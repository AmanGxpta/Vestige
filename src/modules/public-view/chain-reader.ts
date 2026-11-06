/**
 * Public evidence chain reader (FR-5, EV-01, never-cut "ENS-resolved public evidence").
 *
 * Order is deliberate and visible to the verifier:
 *   1. Resolve the venture's ENS name on Ethereum Sepolia (resolver, ENSIP-11
 *      Whitechain address, vestige.* text records).
 *      `vestige.ventureId` comes from ENS (CR-C2-002); an API value is only a cross-check.
 *   2. Read the Safe, its Guard's immutable binding (safe/registry/ventureId), the
 *      SeatRegistry and USDT directly from Whitechain; compare runtime code hashes
 *      with the reviewed DeploymentManifestV1 (CR-C2-003) and scan Transfer logs
 *      from the manifest's deploymentBlock in ≤10k-block windows (CR-C2-004).
 * Nothing here reads our database. A failed read is `UNKNOWN`, never success.
 * There is NO fallback to a hard-coded address.
 */
import { createPublicClient, defineChain, getAddress, http, keccak256, parseAbi, parseAbiItem, zeroAddress, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import type { Address, Hex, ReadStatus } from "@/src/modules/ui/types";
import { SEPOLIA_CHAIN_ID, WHITECHAIN_CHAIN_ID, WHITECHAIN_ENS_COIN_TYPE } from "@/src/modules/ui/types";
import type { DeploymentManifestV1, ManifestLoad } from "./manifest";

export const whitechainSepolia = defineChain({
  id: WHITECHAIN_CHAIN_ID,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.whitechain.io"] } },
  testnet: true,
});

/** keccak256("guard_manager.guard.address") — Safe v1.3+/v1.4.1 GuardManager slot. */
export const SAFE_GUARD_SLOT: Hex = "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
const SENTINEL: Address = "0x0000000000000000000000000000000000000001";
/** Max eth_getLogs span accepted by rpc.testnet.whitechain.io (verified 2026-11-06). */
const LOG_WINDOW = 10_000n;

export const ENS_TEXT_KEYS = ["vestige.ventureId", "vestige.agreement", "vestige.status", "vestige.humans", "vestige.guard", "vestige.treasury"] as const;
/** Without a reviewed manifest we only scan this many recent blocks, and say so. */
export const FALLBACK_LOOKBACK = 50_000n;
export type EnsTextKey = (typeof ENS_TEXT_KEYS)[number];

const SAFE_ABI = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function VERSION() view returns (string)",
  "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
]);
const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);
/** X's SeatRegistry/VestigeGuard public getters (agent/treasury contracts/*.sol @ ee46097). */
const REGISTRY_ABI = parseAbi(["function isSeat(bytes32 ventureId, address wallet) view returns (bool)"]);
const GUARD_ABI = parseAbi(["function safe() view returns (address)", "function registry() view returns (address)", "function ventureId() view returns (bytes32)"]);
const TRANSFER_EVENT = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

export type Provenance = {
  chainId: number;
  method: string;
  target?: string;
  blockNumber?: string;
  source: "CHAIN" | "DEV_MOCK";
};

export type Step<T> = {
  status: ReadStatus;
  value?: T;
  /** Human explanation when status is not VERIFIED. */
  note?: string;
  provenance: Provenance;
};

export type TokenTransfer = { from: Address; to: Address; valueRaw: string; txHash: Hex; blockNumber: string; direction: "IN" | "OUT" };

export type GuardBinding = { safe: Address; registry: Address; ventureId: Hex };
export type CodeHashes = { safe?: Hex; guard?: Hex; registry?: Hex };

export type PublicChainReport = {
  ensName: string;
  normalizedName?: string;
  startedAt: string;
  source: "CHAIN" | "DEV_MOCK";
  ens: {
    resolver: Step<Address>;
    treasury: Step<{ address: Address; via: "ENSIP-11" | "TEXT_FALLBACK" }>;
    texts: Step<Partial<Record<EnsTextKey, string | null>>>;
    /** `vestige.ventureId` — must be 0x + 64 lowercase hex. */
    ventureId: Step<Hex>;
  };
  /** Reviewed deployment manifest state (never fabricated). */
  manifest: ManifestLoad;
  /** Off-chain API ventureId, cross-check only. */
  apiVentureId?: Hex;
  whitechain?: {
    blockNumber: Step<string>;
    safeCode: Step<boolean>;
    version: Step<string>;
    owners: Step<Address[]>;
    threshold: Step<number>;
    guard: Step<Address>;
    binding: Step<GuardBinding>;
    codeHashes: Step<CodeHashes>;
    modules: Step<Address[]>;
    token: Step<{ address: Address; symbol: string; decimals: number; balanceRaw: string }>;
    seats: Step<{ owner: Address; isSeat: boolean }[]>;
    transfers: Step<TokenTransfer[]>;
    /** First block scanned for transfers and whether it came from the manifest. */
    scanFrom?: { block: string; fromManifest: boolean };
  };
};

export type ReaderConfig = {
  sepoliaRpcUrl: string;
  whitechainRpcUrl: string;
  /** Approved token anchor (CONTRACTS); the manifest token must equal it. */
  usdtAddress: Address;
  universalResolver?: Address;
  /** Reviewed manifest load (or a promise of it), from loadManifest(). */
  manifest?: ManifestLoad | Promise<ManifestLoad>;
  /** Lazily supplies the API ventureId — a CROSS-CHECK only, never the source. */
  apiVentureIdSource?: () => Promise<Hex | undefined>;
  /** Fallback scan depth when no applicable manifest exists. */
  logLookbackBlocks?: bigint;
};

/** Manifest applies to this lookup only if it names the same ENS name. */
export function applicableManifest(m: ManifestLoad, ensName: string): DeploymentManifestV1 | undefined {
  return m.status === "LOADED" && m.manifest.ensName.toLowerCase() === ensName.toLowerCase() ? m.manifest : undefined;
}

const errMsg = (e: unknown) => {
  const m = e instanceof Error ? (e as Error & { shortMessage?: string }).shortMessage ?? e.message : String(e);
  return m.split("\n")[0].slice(0, 240);
};

async function step<T>(prov: Provenance, fn: () => Promise<T | { fail: string; value?: T }>): Promise<Step<T>> {
  try {
    const r = await fn();
    if (r && typeof r === "object" && "fail" in (r as object)) {
      const f = r as { fail: string; value?: T };
      return { status: "FAILED", note: f.fail, value: f.value, provenance: prov };
    }
    return { status: "VERIFIED", value: r as T, provenance: prov };
  } catch (e) {
    return { status: "UNKNOWN", note: `Could not read: ${errMsg(e)}`, provenance: prov };
  }
}

/** Parse the MASTER §11 fallback text record `eip155:1874:<address>`. Strict. */
export function parseTreasuryTextRecord(v: string | null | undefined): Address | null {
  if (!v) return null;
  const m = /^eip155:1874:(0x[0-9a-fA-F]{40})$/.exec(v.trim());
  return m ? getAddress(m[1]) : null;
}

export async function readPublicChainReport(ensName: string, cfg: ReaderConfig, clients?: { sepolia?: PublicClient; whitechain?: PublicClient }): Promise<PublicChainReport> {
  const startedAt = new Date().toISOString();
  const sep = clients?.sepolia ?? (createPublicClient({ chain: sepolia, transport: http(cfg.sepoliaRpcUrl, { timeout: 12_000 }) }) as PublicClient);
  const wc = clients?.whitechain ?? (createPublicClient({ chain: whitechainSepolia, transport: http(cfg.whitechainRpcUrl, { timeout: 12_000 }) }) as PublicClient);
  const ensProv = (method: string, target?: string): Provenance => ({ chainId: SEPOLIA_CHAIN_ID, method, target, source: "CHAIN" });

  const manifestP = Promise.resolve(cfg.manifest ?? ({ status: "NOT_CONFIGURED" } as ManifestLoad));
  const apiP = cfg.apiVentureIdSource?.().catch(() => undefined) ?? Promise.resolve(undefined);
  let name: string;
  try {
    name = normalize(ensName);
  } catch (e) {
    const bad: Step<never> = { status: "FAILED", note: `Not a valid ENS name: ${errMsg(e)}`, provenance: ensProv("normalize") };
    return { ensName, startedAt, source: "CHAIN", ens: { resolver: bad, treasury: bad, texts: bad, ventureId: bad }, manifest: await manifestP };
  }
  const ur = cfg.universalResolver ? { universalResolverAddress: cfg.universalResolver } : {};

  // 1. ENS on Sepolia --------------------------------------------------------
  const resolver = await step<Address>(ensProv("UniversalResolver.findResolver", name), async () => {
    const r = await sep.getEnsResolver({ name, ...ur });
    if (!r || r === zeroAddress) return { fail: "No resolver is set for this name on Sepolia. The name is unregistered or unresolved." };
    return r;
  });

  const texts = await step<Partial<Record<EnsTextKey, string | null>>>(ensProv("resolver.text", name), async () => {
    if (resolver.status !== "VERIFIED") return { fail: "Skipped: no resolver." };
    const entries = await Promise.all(ENS_TEXT_KEYS.map(async (k) => [k, await sep.getEnsText({ name, key: k, ...ur })] as const));
    return Object.fromEntries(entries);
  });

  const treasury = await step<{ address: Address; via: "ENSIP-11" | "TEXT_FALLBACK" }>(
    ensProv(`resolver.addr(node, ${WHITECHAIN_ENS_COIN_TYPE})`, name),
    async () => {
      if (resolver.status !== "VERIFIED") return { fail: "Skipped: no resolver." };
      const a = await sep.getEnsAddress({ name, coinType: BigInt(WHITECHAIN_ENS_COIN_TYPE), ...ur });
      if (a && a !== zeroAddress) return { address: getAddress(a), via: "ENSIP-11" as const };
      const fb = parseTreasuryTextRecord(texts.value?.["vestige.treasury"]);
      if (fb) return { address: fb, via: "TEXT_FALLBACK" as const };
      return { fail: "The name has no Whitechain treasury address (ENSIP-11 coin type 2147485522) and no vestige.treasury record." };
    },
  );

  const ventureIdStep: Step<Hex> = (() => {
    const prov = ensProv("resolver.text(vestige.ventureId)", name);
    if (texts.status !== "VERIFIED") return { status: texts.status === "FAILED" ? "FAILED" : "UNKNOWN", note: "Skipped: text records not read.", provenance: prov };
    const v = texts.value?.["vestige.ventureId"];
    if (!v) return { status: "FAILED", note: "The name does not publish a vestige.ventureId record.", provenance: prov };
    if (!/^0x[0-9a-f]{64}$/.test(v)) return { status: "FAILED", note: `vestige.ventureId is not 0x + 64 lowercase hex: "${v.slice(0, 80)}"`, provenance: prov };
    return { status: "VERIFIED", value: v as Hex, provenance: prov };
  })();

  const [manifest, apiVentureId] = await Promise.all([manifestP, apiP]);
  const report: PublicChainReport = { ensName, normalizedName: name, startedAt, source: "CHAIN", ens: { resolver, treasury, texts, ventureId: ventureIdStep }, manifest, apiVentureId };
  if (treasury.status !== "VERIFIED" || !treasury.value) return report;
  const m = applicableManifest(manifest, name);

  // 2. Whitechain -------------------------------------------------------------
  const safe = treasury.value.address;
  const wcProv = (method: string, target?: string, blockNumber?: bigint): Provenance => ({
    chainId: WHITECHAIN_CHAIN_ID,
    method,
    target,
    blockNumber: blockNumber?.toString(),
    source: "CHAIN",
  });

  const blockNumber = await step<string>(wcProv("eth_blockNumber"), async () => (await wc.getBlockNumber()).toString());
  const bn = blockNumber.value ? BigInt(blockNumber.value) : undefined;
  const at = bn !== undefined ? { blockNumber: bn } : {};

  const safeCode = await step<boolean>(wcProv("eth_getCode", safe, bn), async () => {
    const code = await wc.getCode({ address: safe, ...at });
    return code && code !== "0x" ? true : { fail: "No contract at this address on Whitechain.", value: false };
  });
  const isContract = safeCode.status === "VERIFIED";
  const skip = <T,>(method: string, target?: string): Step<T> => ({ status: "UNKNOWN", note: "Skipped: no Safe contract found.", provenance: wcProv(method, target, bn) });

  const [version, owners, threshold, guard, modules, safeCodeHash] = isContract
    ? await Promise.all([
        step<string>(wcProv("Safe.VERSION()", safe, bn), () => wc.readContract({ address: safe, abi: SAFE_ABI, functionName: "VERSION", ...at })),
        step<Address[]>(wcProv("Safe.getOwners()", safe, bn), async () => [...(await wc.readContract({ address: safe, abi: SAFE_ABI, functionName: "getOwners", ...at }))]),
        step<number>(wcProv("Safe.getThreshold()", safe, bn), async () => Number(await wc.readContract({ address: safe, abi: SAFE_ABI, functionName: "getThreshold", ...at }))),
        step<Address>(wcProv("eth_getStorageAt(guard slot)", safe, bn), async () => {
          const raw = await wc.getStorageAt({ address: safe, slot: SAFE_GUARD_SLOT, ...at });
          const addr = getAddress(`0x${(raw ?? "0x").slice(-40).padStart(40, "0")}`);
          return addr === zeroAddress ? { fail: "No Guard is attached to this Safe.", value: addr } : addr;
        }),
        step<Address[]>(wcProv("Safe.getModulesPaginated(0x1, 10)", safe, bn), async () => {
          const [arr] = await wc.readContract({ address: safe, abi: SAFE_ABI, functionName: "getModulesPaginated", args: [SENTINEL, 10n], ...at });
          return arr.length ? { fail: "Modules are enabled. Safe modules bypass owner signatures and Guards.", value: [...arr] } : [];
        }),
        wc.getCode({ address: safe, ...at }).then((c) => (c && c !== "0x" ? keccak256(c) : undefined)).catch(() => undefined),
      ])
    : [skip<string>("Safe.VERSION()"), skip<Address[]>("Safe.getOwners()"), skip<number>("Safe.getThreshold()"), skip<Address>("guard slot"), skip<Address[]>("modules"), undefined];

  const guardAddr = guard.status === "VERIFIED" ? guard.value : undefined;
  const binding = await step<GuardBinding>(wcProv("VestigeGuard.safe()/registry()/ventureId()", guardAddr, bn), async () => {
    if (!guardAddr) throw new Error("no Guard attached");
    const [gSafe, gRegistry, gVenture] = await Promise.all([
      wc.readContract({ address: guardAddr, abi: GUARD_ABI, functionName: "safe", ...at }),
      wc.readContract({ address: guardAddr, abi: GUARD_ABI, functionName: "registry", ...at }),
      wc.readContract({ address: guardAddr, abi: GUARD_ABI, functionName: "ventureId", ...at }),
    ]);
    return { safe: getAddress(gSafe), registry: getAddress(gRegistry), ventureId: gVenture.toLowerCase() as Hex };
  });
  const registryAddr = binding.value?.registry;

  const codeHashes = await step<CodeHashes>(wcProv("keccak256(eth_getCode) safe/guard/registry", safe, bn), async () => {
    const hashOf = async (a?: Address) => {
      if (!a) return undefined;
      const c = await wc.getCode({ address: a, ...at });
      return c && c !== "0x" ? keccak256(c) : undefined;
    };
    const [g, r] = await Promise.all([hashOf(guardAddr), hashOf(registryAddr)]);
    return { safe: safeCodeHash, guard: g, registry: r };
  });

  const token = await step(wcProv("USDT.balanceOf/decimals/symbol", cfg.usdtAddress, bn), async () => {
    const [balance, decimals, symbol] = await Promise.all([
      wc.readContract({ address: cfg.usdtAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [safe], ...at }),
      wc.readContract({ address: cfg.usdtAddress, abi: ERC20_ABI, functionName: "decimals", ...at }),
      wc.readContract({ address: cfg.usdtAddress, abi: ERC20_ABI, functionName: "symbol", ...at }),
    ]);
    return { address: cfg.usdtAddress, symbol, decimals: Number(decimals), balanceRaw: balance.toString() };
  });

  const seats = await step<{ owner: Address; isSeat: boolean }[]>(wcProv("SeatRegistry.isSeat(ventureId, owner)", registryAddr, bn), async () => {
    if (!registryAddr) throw new Error("SeatRegistry unknown: the Guard's registry() could not be read");
    // ventureId from ENS (CR-C2-002) — never from our API.
    const ventureId = ventureIdStep.value;
    if (!ventureId) throw new Error("ventureId not published in ENS (vestige.ventureId)");
    if (!owners.value?.length) throw new Error("owners unknown");
    const out = await Promise.all(
      owners.value.map(async (o) => ({
        owner: o,
        isSeat: await wc.readContract({ address: registryAddr, abi: REGISTRY_ABI, functionName: "isSeat", args: [ventureId, o], ...at }),
      })),
    );
    return out.every((x) => x.isSeat) ? out : { fail: "At least one Safe owner is not a verified seat in the SeatRegistry.", value: out };
  });

  const transfers = await step<TokenTransfer[]>(wcProv("USDT Transfer logs (to/from Safe)", cfg.usdtAddress, bn), async () => {
    if (bn === undefined) throw new Error("block number unknown");
    const lookback = cfg.logLookbackBlocks ?? FALLBACK_LOOKBACK;
    const start = m ? BigInt(m.deploymentBlock) : bn > lookback ? bn - lookback : 0n;
    // Whitechain's public RPC rejects eth_getLogs spans > 10,000 blocks ("query exceeds max block range 10000").
    const windows: [bigint, bigint][] = [];
    for (let from = start; from <= bn; from += LOG_WINDOW) windows.push([from, from + LOG_WINDOW - 1n > bn ? bn : from + LOG_WINDOW - 1n]);
    const scan = async (args: { to: Address } | { from: Address }) =>
      (await Promise.all(windows.map(([fromBlock, toBlock]) => wc.getLogs({ address: cfg.usdtAddress, event: TRANSFER_EVENT, args, fromBlock, toBlock })))).flat();
    const [inbound, outbound] = await Promise.all([scan({ to: safe }), scan({ from: safe })]);
    const map = (l: (typeof inbound)[number], direction: "IN" | "OUT"): TokenTransfer => ({
      from: l.args.from as Address,
      to: l.args.to as Address,
      valueRaw: (l.args.value ?? 0n).toString(),
      txHash: l.transactionHash as Hex,
      blockNumber: (l.blockNumber ?? 0n).toString(),
      direction,
    });
    return [...inbound.map((l) => map(l, "IN")), ...outbound.map((l) => map(l, "OUT"))].sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)));
  });

  const scanStart = bn === undefined ? undefined : m ? BigInt(m.deploymentBlock) : bn > (cfg.logLookbackBlocks ?? FALLBACK_LOOKBACK) ? bn - (cfg.logLookbackBlocks ?? FALLBACK_LOOKBACK) : 0n;
  report.whitechain = {
    blockNumber,
    safeCode,
    version,
    owners,
    threshold,
    guard,
    binding,
    codeHashes,
    modules,
    token,
    seats,
    transfers,
    ...(scanStart !== undefined ? { scanFrom: { block: scanStart.toString(), fromManifest: !!m } } : {}),
  };
  return report;
}

/**
 * Light ENS-only resolution for the funding flow: the Safe a deposit goes to and the
 * ventureId are taken from ENS on Sepolia, never from our API (CR-C2-002).
 */
export async function resolveEnsVenture(
  ensName: string,
  cfg: Pick<ReaderConfig, "sepoliaRpcUrl" | "universalResolver">,
  client?: PublicClient,
): Promise<{ ok: true; safe: Address; ventureId: Hex } | { ok: false; reason: string }> {
  const sep = client ?? (createPublicClient({ chain: sepolia, transport: http(cfg.sepoliaRpcUrl, { timeout: 12_000 }) }) as PublicClient);
  const ur = cfg.universalResolver ? { universalResolverAddress: cfg.universalResolver } : {};
  try {
    const name = normalize(ensName);
    const resolver = await sep.getEnsResolver({ name, ...ur });
    if (!resolver || resolver === zeroAddress) return { ok: false, reason: `${name} does not resolve on Sepolia.` };
    const [vid, fallback, addr] = await Promise.all([
      sep.getEnsText({ name, key: "vestige.ventureId", ...ur }),
      sep.getEnsText({ name, key: "vestige.treasury", ...ur }),
      sep.getEnsAddress({ name, coinType: BigInt(WHITECHAIN_ENS_COIN_TYPE), ...ur }),
    ]);
    if (!vid || !/^0x[0-9a-f]{64}$/.test(vid)) return { ok: false, reason: `${name} does not publish a valid vestige.ventureId.` };
    const safe = addr && addr !== zeroAddress ? getAddress(addr) : parseTreasuryTextRecord(fallback);
    if (!safe) return { ok: false, reason: `${name} has no Whitechain treasury address.` };
    return { ok: true, safe, ventureId: vid as Hex };
  } catch (e) {
    return { ok: false, reason: `Could not read ENS: ${errMsg(e)}` };
  }
}
