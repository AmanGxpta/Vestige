/**
 * ENSv2 Sepolia setup plans for H review (H-C1-05). PLAN + READ-ONLY DRY RUN ONLY.
 *
 * - `buildParentSetupPlan` — one-time: deploy the vestige.eth UserRegistry, then the
 *   vestige.eth owner (H's wallet) points ETHRegistry's subregistry for `vestige` at it.
 * - `buildFirstVenturePlan` — the first venture: its own UserRegistry + Permissioned
 *   Resolver (status=workspace, ventureId, humans=0), then `register` in the parent.
 *   Optional founder steps follow the same plan builder the server uses.
 * - `dryRun` uses eth_call / eth_getCode only. It never signs and never sends.
 * - `broadcastApproved` exists so H can run the reviewed plan; it refuses unless the
 *   caller passes the exact sha256 digest of the plan JSON H approved, plus the env
 *   switch VESTIGE_ENS_BROADCAST=I_HAVE_H_APPROVAL. C1 does not call it.
 *
 * Nothing here registers vestige.eth itself (ETHRegistrar commit/reveal + MockUSDC):
 * that is H-C1-04, done by H from the owner wallet.
 */
import { createHash } from "node:crypto";
import {
  encodeFunctionData,
  keccak256,
  stringToHex,
  zeroAddress,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { ENS_KEYS, ENSV2_SEPOLIA, VESTIGE_PARENT_NAME, WHITECHAIN_COIN_TYPE } from "../config";
import {
  encodeSetText,
  encodeUserRegistryInit,
  permissionedResolverAbi,
  permissionedRegistryAbi,
  predictProxyAddress,
  REG,
  ventureRegistrySalt,
  verifiableFactoryAbi,
} from "../ens/encoding";
import { buildFounderPlan, buildVenturePlan, recordCalls, VENTURE_TOKEN_ROLES } from "../ens/registrar";
import type { Bytes32 } from "../ids";

export interface PlannedTx {
  id: string;
  signer: "REGISTRAR" | "VESTIGE_ETH_OWNER";
  signerAddress: Address | null;
  to: Address;
  data: Hex;
  value: "0";
  purpose: string;
  dependsOn: string[];
  expectedResult?: string;
}

export interface EnsPlan {
  schema: "vestige.ens-plan/1";
  kind: "parent-setup" | "first-venture" | "treasury-records";
  chainId: 11155111;
  createdAt: string;
  inputs: Record<string, unknown>;
  predicted: Record<string, Address>;
  txs: PlannedTx[];
  disclosures: string[];
}

/** Parent registry root roles for the registrar: operational only (register/renew venture names). */
export const PARENT_REGISTRAR_ROLES = REG.REGISTRAR | REG.RENEW;

export function planDigest(plan: EnsPlan): string {
  return createHash("sha256").update(JSON.stringify(plan, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).digest("hex");
}

export function buildParentSetupPlan(a: {
  registrar: Address;
  owner: Address | null; // vestige.eth owner (H); null if not yet registered
  proxyLogic: Address; // VerifiableFactory.proxyLogic(), read on-chain
  parentName?: string;
  createdAt?: string;
}): EnsPlan {
  const parentName = a.parentName ?? VESTIGE_PARENT_NAME;
  const label = parentName.split(".")[0]!;
  if (parentName !== `${label}.eth`) throw new Error("parent must be a 2LD under .eth");
  const salt = ventureRegistrySalt(parentName);
  const parentRegistry = predictProxyAddress({ factory: ENSV2_SEPOLIA.VerifiableFactory, proxyLogic: a.proxyLogic, deployer: a.registrar, salt });
  const init = encodeUserRegistryInit([{ account: a.registrar, roleBitmap: PARENT_REGISTRAR_ROLES }]);
  const labelId = BigInt(keccak256(stringToHex(label)));
  return {
    schema: "vestige.ens-plan/1",
    kind: "parent-setup",
    chainId: 11155111,
    createdAt: a.createdAt ?? new Date().toISOString(),
    inputs: { parentName, registrar: a.registrar, owner: a.owner, implementation: ENSV2_SEPOLIA.UserRegistryImpl, factory: ENSV2_SEPOLIA.VerifiableFactory, salt: salt.toString(), registrarRootRoles: PARENT_REGISTRAR_ROLES.toString() },
    predicted: { parentRegistry },
    txs: [
      {
        id: "P1-deploy-parent-registry",
        signer: "REGISTRAR",
        signerAddress: a.registrar,
        to: ENSV2_SEPOLIA.VerifiableFactory,
        data: encodeFunctionData({ abi: verifiableFactoryAbi, functionName: "deployProxy", args: [ENSV2_SEPOLIA.UserRegistryImpl, salt, init] }),
        value: "0",
        purpose: `Deploy the ${parentName} UserRegistry; registrar gets REGISTRAR|RENEW root roles only`,
        dependsOn: [],
        expectedResult: `ProxyDeployed(proxyAddress=${parentRegistry})`,
      },
      {
        id: "P2-point-parent-subregistry",
        signer: "VESTIGE_ETH_OWNER",
        signerAddress: a.owner,
        to: ENSV2_SEPOLIA.ETHRegistry,
        data: encodeFunctionData({ abi: permissionedRegistryAbi, functionName: "setSubregistry", args: [labelId, parentRegistry] }),
        value: "0",
        purpose: `ETHRegistry: ${parentName} subregistry → ${parentRegistry}. Sent by the ${parentName} owner from their own wallet (calldata to paste).`,
        dependsOn: ["P1-deploy-parent-registry", "H-C1-04 vestige.eth registered to owner"],
        expectedResult: `ETHRegistry.getSubregistry("${label}") == ${parentRegistry}`,
      },
    ],
    disclosures: [
      "Residual power: the registrar can register/renew venture names in the parent registry; the vestige.eth owner can re-point the parent subregistry until handover.",
      "No dangerous root roles (UNREGISTER, SET_SUBREGISTRY, SET_RESOLVER, UPGRADE, transfer admin) are granted on the parent registry by this plan.",
      "Set VESTIGE_PARENT_REGISTRY to predicted.parentRegistry only after P1's receipt and a read-back of getSubregistry.",
    ],
  };
}

export function buildFirstVenturePlan(a: {
  registrar: Address;
  parentRegistry: Address;
  proxyLogic: Address;
  slug: string;
  ventureId: Bytes32;
  expiry: bigint;
  founders?: { label: string; wallet: Address; worldEnvironment?: string }[];
  /** Initial records derived from server state (never from a request). */
  initial?: { humans?: number; agreementHash?: Hex };
  /** Provenance of ventureId/founders, recorded in the plan for the approver. */
  source?: Record<string, unknown>;
  createdAt?: string;
}): EnsPlan {
  const cfg = { parentRegistry: a.parentRegistry, expiry: a.expiry };
  const plan = buildVenturePlan(cfg, a.slug, a.registrar, a.ventureId, a.initial ?? {});
  const predict = (salt: bigint) => predictProxyAddress({ factory: ENSV2_SEPOLIA.VerifiableFactory, proxyLogic: a.proxyLogic, deployer: a.registrar, salt });
  const ventureRegistry = predict(plan.registry.salt);
  const ventureResolver = predict(plan.resolver.salt);
  const label = plan.name.split(".")[0]!;
  const deploy = (p: { implementation: Address; salt: bigint; data: Hex }) =>
    encodeFunctionData({ abi: verifiableFactoryAbi, functionName: "deployProxy", args: [p.implementation, p.salt, p.data] });
  const txs: PlannedTx[] = [
    { id: "V1-deploy-venture-registry", signer: "REGISTRAR", signerAddress: a.registrar, to: ENSV2_SEPOLIA.VerifiableFactory, data: deploy(plan.registry), value: "0", purpose: `UserRegistry for ${plan.name} (registrar REGISTRAR|RENEW only → emancipated)`, dependsOn: [], expectedResult: `ProxyDeployed(${ventureRegistry})` },
    { id: "V2-deploy-venture-resolver", signer: "REGISTRAR", signerAddress: a.registrar, to: ENSV2_SEPOLIA.VerifiableFactory, data: deploy(plan.resolver), value: "0", purpose: `PermissionedResolver for ${plan.name}: vestige.status=workspace, vestige.ventureId=${a.ventureId}, vestige.humans=${a.initial?.humans ?? 0}${a.initial?.agreementHash ? `, vestige.agreement=${a.initial.agreementHash}` : ""}`, dependsOn: [], expectedResult: `ProxyDeployed(${ventureResolver})` },
    {
      id: "V3-register-venture-name", signer: "REGISTRAR", signerAddress: a.registrar, to: a.parentRegistry,
      data: encodeFunctionData({ abi: permissionedRegistryAbi, functionName: "register", args: [label, a.registrar, ventureRegistry, ventureResolver, VENTURE_TOKEN_ROLES, a.expiry] }),
      value: "0", purpose: `register("${label}") in the parent registry`, dependsOn: ["parent-setup P1+P2", "V1", "V2"],
      expectedResult: `UniversalResolver text(${plan.name}, vestige.ventureId) == ${a.ventureId}`,
    },
  ];
  const predicted: Record<string, Address> = { ventureRegistry, ventureResolver };
  for (const f of a.founders ?? []) {
    const fp = buildFounderPlan(cfg, a.slug, f.label, f.wallet);
    const res = predict(fp.resolver.salt);
    predicted[`founderResolver:${fp.name}`] = res;
    txs.push(
      { id: `F-${f.label}-deploy-resolver`, signer: "REGISTRAR", signerAddress: a.registrar, to: ENSV2_SEPOLIA.VerifiableFactory, data: deploy(fp.resolver), value: "0", purpose: `Founder resolver for ${fp.name}; sole grantee ${f.wallet} (SET_TEXT|SET_ADDRESS); addr(60)=${f.wallet}`, dependsOn: ["World seat VERIFIED for this wallet"], expectedResult: `ProxyDeployed(${res})` },
      {
        id: `F-${f.label}-register`, signer: "REGISTRAR", signerAddress: a.registrar, to: ventureRegistry,
        data: encodeFunctionData({ abi: permissionedRegistryAbi, functionName: "register", args: [f.label, f.wallet, zeroAddress, res, fp.roleBitmap, a.expiry] }),
        value: "0", purpose: `register("${f.label}") under ${plan.name}, owner ${f.wallet}, roleBitmap 0 (non-transferable)`, dependsOn: ["V3", `F-${f.label}-deploy-resolver`],
        expectedResult: `UniversalResolver addr(${fp.name}) == ${f.wallet}`,
      },
    );
  }
  return {
    schema: "vestige.ens-plan/1",
    kind: "first-venture",
    chainId: 11155111,
    createdAt: a.createdAt ?? new Date().toISOString(),
    inputs: { slug: a.slug, ventureId: a.ventureId, registrar: a.registrar, parentRegistry: a.parentRegistry, expiry: a.expiry.toString(), founders: a.founders ?? [], initial: a.initial ?? { humans: 0 }, ...(a.source ? { source: a.source } : {}) },
    predicted,
    txs,
    disclosures: [
      "Founder names: roleBitmap 0 → transfers revert TransferDisallowed; needs the live negative test after registration.",
      "Until handover the parent operator can re-point/unregister the venture name; vestige cannot revoke founder names (venture registry emancipated).",
      "Each step is complete only after receipt success AND Universal Resolver read-back.",
    ],
  };
}

export interface DryRunResult {
  id: string;
  ok: boolean;
  detail: string;
}

/** Read-only checks + eth_call simulation of every step whose signer is known. Never signs or sends. */
export async function dryRun(client: PublicClient, plan: EnsPlan): Promise<DryRunResult[]> {
  const out: DryRunResult[] = [];
  for (const tx of plan.txs) {
    const code = await client.getCode({ address: tx.to });
    if (!code || code === "0x") {
      out.push({ id: tx.id, ok: false, detail: `no contract at ${tx.to} yet (expected until its dependency is executed: ${tx.dependsOn.join(", ") || "none"})` });
      continue;
    }
    if (!tx.signerAddress) {
      out.push({ id: tx.id, ok: false, detail: "signer unknown (vestige.eth not registered yet); simulate after H-C1-04" });
      continue;
    }
    try {
      const r = await client.call({ account: tx.signerAddress, to: tx.to, data: tx.data });
      out.push({ id: tx.id, ok: true, detail: `eth_call ok, returned ${r.data ?? "0x"}` });
    } catch (e) {
      out.push({ id: tx.id, ok: false, detail: `eth_call reverted: ${(e as Error).message.split("\n")[0]!.slice(0, 200)}` });
    }
  }
  return out;
}

/**
 * H-only execution of a reviewed plan. Refuses unless BOTH the env switch is set and
 * the digest H approved matches this exact plan. Sends REGISTRAR steps only;
 * VESTIGE_ETH_OWNER steps are printed for H to send from the owner wallet.
 */
export async function broadcastApproved(a: { plan: EnsPlan; approvedDigest: string; wallet: WalletClient; client: PublicClient; env?: NodeJS.ProcessEnv }) {
  const env = a.env ?? process.env;
  if (env.VESTIGE_ENS_BROADCAST !== "I_HAVE_H_APPROVAL") throw new Error("refusing: VESTIGE_ENS_BROADCAST=I_HAVE_H_APPROVAL not set");
  if (planDigest(a.plan) !== a.approvedDigest) throw new Error("refusing: plan digest differs from the approved digest");
  if (a.client.chain?.id !== 11155111 || a.wallet.chain?.id !== 11155111) throw new Error("refusing: not Sepolia");
  const account = a.wallet.account;
  if (!account) throw new Error("refusing: no account");
  const receipts: { id: string; hash: Hex; block: bigint }[] = [];
  for (const tx of a.plan.txs) {
    if (tx.signer !== "REGISTRAR") continue;
    if (tx.signerAddress?.toLowerCase() !== account.address.toLowerCase()) throw new Error(`refusing: ${tx.id} planned for ${tx.signerAddress}`);
    await a.client.call({ account: account.address, to: tx.to, data: tx.data });
    const hash = await a.wallet.sendTransaction({ account, chain: a.wallet.chain, to: tx.to, data: tx.data });
    const r = await a.client.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${tx.id} reverted: ${hash}`);
    receipts.push({ id: tx.id, hash, block: r.blockNumber });
  }
  return receipts;
}

/**
 * Treasury records on an EXISTING venture name (after X's Safe deploy): one registrar
 * multicall on the venture's PermissionedResolver setting ENSIP-11 addr(2147485522)=Safe and
 * text vestige.guard=Guard (CONTRACTS v0 ENS records). Optional vestige.treasury text fallback.
 * Plan + digest for H approval only; executed via broadcastApproved like the others.
 */
export function buildTreasuryRecordPlan(a: {
  registrar: Address;
  ensName: string; // <slug>.vestige.eth
  ventureResolver: Address; // read from the parent registry, never assumed
  safe: Address;
  guard: Address;
  includeTextFallback?: boolean;
  source?: Record<string, unknown>;
  createdAt?: string;
}): EnsPlan {
  const calls = recordCalls(a.ensName, { treasury: a.safe, guard: a.guard });
  if (a.includeTextFallback) calls.push(encodeSetText(a.ensName, ENS_KEYS.treasuryFallback, a.safe));
  return {
    schema: "vestige.ens-plan/1",
    kind: "treasury-records",
    chainId: 11155111,
    createdAt: a.createdAt ?? new Date().toISOString(),
    inputs: { ensName: a.ensName, ventureResolver: a.ventureResolver, safe: a.safe, guard: a.guard, coinType: WHITECHAIN_COIN_TYPE.toString(), textFallback: !!a.includeTextFallback, ...(a.source ? { source: a.source } : {}) },
    predicted: {},
    txs: [{
      id: "T1-set-treasury-records", signer: "REGISTRAR", signerAddress: a.registrar, to: a.ventureResolver,
      data: encodeFunctionData({ abi: permissionedResolverAbi, functionName: "multicall", args: [calls] }), value: "0",
      purpose: `${a.ensName}: addr(${WHITECHAIN_COIN_TYPE})=${a.safe}; text vestige.guard=${a.guard}${a.includeTextFallback ? `; text vestige.treasury=${a.safe}` : ""}`,
      dependsOn: ["X Safe + Guard deployed and read back on Whitechain 1874"],
      expectedResult: `UniversalResolver addr(${a.ensName}, ${WHITECHAIN_COIN_TYPE}) == ${a.safe}`,
    }],
    disclosures: ["Records point to Whitechain contracts; verifiers must still read Safe owners/threshold/Guard on Whitechain (ENS is a pointer, not proof)."],
  };
}
