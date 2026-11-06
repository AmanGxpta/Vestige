/**
 * Public evidence chain reader (FR-5, EV-01, never-cut "ENS-resolved public evidence").
 *
 * Order is deliberate and visible to the verifier:
 *   1. Resolve the venture's ENS name on Ethereum Sepolia (resolver, ENSIP-11
 *      Whitechain address, vestige.* text records).
 *   2. Read the Safe, Guard, SeatRegistry and USDT directly from Whitechain.
 * Nothing here reads our database. A failed read is `UNKNOWN`, never success.
 * There is NO fallback to a hard-coded address.
 */
import { createPublicClient, defineChain, getAddress, http, parseAbi, parseAbiItem, zeroAddress, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { normalize } from "viem/ens";
import type { Address, Hex, ReadStatus } from "@/src/modules/ui/types";
import { SEPOLIA_CHAIN_ID, WHITECHAIN_CHAIN_ID, WHITECHAIN_ENS_COIN_TYPE } from "@/src/modules/ui/types";

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

export const ENS_TEXT_KEYS = ["vestige.agreement", "vestige.status", "vestige.humans", "vestige.guard", "vestige.treasury"] as const;
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
/** PRD FR-7 SeatRegistry interface. X owns the deployed ABI; re-check on handoff. */
const REGISTRY_ABI = parseAbi(["function isSeat(bytes32 ventureId, address wallet) view returns (bool)"]);
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

export type PublicChainReport = {
  ensName: string;
  normalizedName?: string;
  startedAt: string;
  source: "CHAIN" | "DEV_MOCK";
  ens: {
    resolver: Step<Address>;
    treasury: Step<{ address: Address; via: "ENSIP-11" | "TEXT_FALLBACK" }>;
    texts: Step<Partial<Record<EnsTextKey, string | null>>>;
  };
  whitechain?: {
    blockNumber: Step<string>;
    safeCode: Step<boolean>;
    version: Step<string>;
    owners: Step<Address[]>;
    threshold: Step<number>;
    guard: Step<Address>;
    modules: Step<Address[]>;
    token: Step<{ address: Address; symbol: string; decimals: number; balanceRaw: string }>;
    seats: Step<{ owner: Address; isSeat: boolean }[]>;
    transfers: Step<TokenTransfer[]>;
  };
};

export type ReaderConfig = {
  sepoliaRpcUrl: string;
  whitechainRpcUrl: string;
  usdtAddress: Address;
  registryAddress?: Address;
  universalResolver?: Address;
  /** ventureId for SeatRegistry.isSeat — see CR-C2-002 (it is not yet published on-chain/ENS). */
  ventureId?: Hex;
  /** Lazily supplies ventureId (e.g. from C1's public API) so ENS resolution can start first. */
  ventureIdSource?: () => Promise<Hex | undefined>;
  /** How far back to scan USDT Transfer logs. */
  logLookbackBlocks?: bigint;
};

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

  let name: string;
  try {
    name = normalize(ensName);
  } catch (e) {
    const bad: Step<never> = { status: "FAILED", note: `Not a valid ENS name: ${errMsg(e)}`, provenance: ensProv("normalize") };
    return { ensName, startedAt, source: "CHAIN", ens: { resolver: bad, treasury: bad, texts: bad } };
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

  const report: PublicChainReport = { ensName, normalizedName: name, startedAt, source: "CHAIN", ens: { resolver, treasury, texts } };
  if (treasury.status !== "VERIFIED" || !treasury.value) return report;

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

  const [version, owners, threshold, guard, modules] = isContract
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
      ])
    : [skip<string>("Safe.VERSION()"), skip<Address[]>("Safe.getOwners()"), skip<number>("Safe.getThreshold()"), skip<Address>("guard slot"), skip<Address[]>("modules")];

  const token = await step(wcProv("USDT.balanceOf/decimals/symbol", cfg.usdtAddress, bn), async () => {
    const [balance, decimals, symbol] = await Promise.all([
      wc.readContract({ address: cfg.usdtAddress, abi: ERC20_ABI, functionName: "balanceOf", args: [safe], ...at }),
      wc.readContract({ address: cfg.usdtAddress, abi: ERC20_ABI, functionName: "decimals", ...at }),
      wc.readContract({ address: cfg.usdtAddress, abi: ERC20_ABI, functionName: "symbol", ...at }),
    ]);
    return { address: cfg.usdtAddress, symbol, decimals: Number(decimals), balanceRaw: balance.toString() };
  });

  const seats = await step<{ owner: Address; isSeat: boolean }[]>(wcProv("SeatRegistry.isSeat(ventureId, owner)", cfg.registryAddress, bn), async () => {
    if (!cfg.registryAddress) throw new Error("SeatRegistry address not configured (deployment manifest pending)");
    const ventureId = cfg.ventureId ?? (await cfg.ventureIdSource?.());
    if (!ventureId) throw new Error("ventureId not available from a verifiable source (CR-C2-002)");
    if (!owners.value?.length) throw new Error("owners unknown");
    const out = await Promise.all(
      owners.value.map(async (o) => ({
        owner: o,
        isSeat: await wc.readContract({ address: cfg.registryAddress!, abi: REGISTRY_ABI, functionName: "isSeat", args: [ventureId, o], ...at }),
      })),
    );
    return out.every((x) => x.isSeat) ? out : { fail: "At least one Safe owner is not a verified seat in the SeatRegistry.", value: out };
  });

  const transfers = await step<TokenTransfer[]>(wcProv("USDT Transfer logs (to/from Safe)", cfg.usdtAddress, bn), async () => {
    if (bn === undefined) throw new Error("block number unknown");
    const lookback = cfg.logLookbackBlocks ?? 50_000n;
    const start = bn > lookback ? bn - lookback : 0n;
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

  report.whitechain = { blockNumber, safeCode, version, owners, threshold, guard, modules, token, seats, transfers };
  return report;
}
