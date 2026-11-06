/**
 * First-venture ENS workflow (H-C1-05, after the parent digest is approved and P1/P2 land).
 *
 *   1. readParentState()      — independent read-back of the parent setup (no keys).
 *   2. prepareFirstVenturePlan() — refuses unless the parent read-back passes; builds a
 *      digest-bound plan from the REAL server venture (ventureId, slug, World-verified
 *      founders, humans count, fully-signed agreement hash) read from C1's SQLite, then
 *      dry-runs it with eth_call. Nothing is signed or sent.
 *   3. H approves that exact digest; the operator runs broadcastApproved() (ens-plans.ts).
 *   4. reconcileIdentity() promotes the PENDING ENS steps only on Universal Resolver read-back,
 *      and postDeploymentChecks() (ens-checks.ts) runs the read-only negative tests.
 */
import { keccak256, stringToHex, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { ENSV2_SEPOLIA, VESTIGE_PARENT_NAME } from "../config";
import { permissionedRegistryAbi, REG } from "../ens/encoding";
import type { IdentityServices } from "../http";
import { assertVentureId, type Bytes32 } from "../ids";
import { buildFirstVenturePlan, dryRun, planDigest, PARENT_REGISTRAR_ROLES, type DryRunResult, type EnsPlan } from "./ens-plans";

export const DANGEROUS_ROOT_ROLES = {
  UNREGISTER: REG.UNREGISTER,
  SET_SUBREGISTRY: REG.SET_SUBREGISTRY,
  SET_RESOLVER: REG.SET_RESOLVER,
  SET_PARENT: REG.SET_PARENT,
  UPGRADE: REG.UPGRADE,
  CAN_TRANSFER_ADMIN: REG.CAN_TRANSFER_ADMIN,
} as const;

export interface Check { id: string; ok: boolean; detail: string }

const labelId = (label: string) => BigInt(keccak256(stringToHex(label)));

/** Independent read-back of the parent setup (P1 deployed + P2 pointed). Read-only. */
export async function readParentState(client: PublicClient, a: { parentRegistry: Address; registrar: Address; owner?: Address; parentName?: string }) {
  const parentName = a.parentName ?? VESTIGE_PARENT_NAME;
  const label = parentName.split(".")[0]!;
  const block = await client.getBlockNumber();
  const checks: Check[] = [];
  const [status, sub, expiry, code, balance] = await Promise.all([
    client.readContract({ address: ENSV2_SEPOLIA.ETHRegistry, abi: permissionedRegistryAbi, functionName: "getStatus", args: [labelId(label)] }),
    client.readContract({ address: ENSV2_SEPOLIA.ETHRegistry, abi: permissionedRegistryAbi, functionName: "getSubregistry", args: [label] }),
    client.readContract({ address: ENSV2_SEPOLIA.ETHRegistry, abi: permissionedRegistryAbi, functionName: "getExpiry", args: [labelId(label)] }),
    client.getCode({ address: a.parentRegistry }),
    client.getBalance({ address: a.registrar }),
  ]);
  checks.push({ id: "parent-name-registered", ok: status === 2, detail: `${parentName} status=${["AVAILABLE", "RESERVED", "REGISTERED"][status] ?? status}` });
  checks.push({ id: "P2-subregistry-points-to-parent", ok: sub.toLowerCase() === a.parentRegistry.toLowerCase(), detail: `getSubregistry("${label}")=${sub}` });
  checks.push({ id: "P1-parent-has-code", ok: !!code && code !== "0x", detail: `code bytes=${code ? (code.length - 2) / 2 : 0}` });
  if (code && code !== "0x") {
    const has = (roles: bigint, who: Address = a.registrar) => client.readContract({ address: a.parentRegistry, abi: permissionedRegistryAbi, functionName: "hasRootRoles", args: [roles, who] });
    checks.push({ id: "registrar-has-REGISTRAR|RENEW", ok: await has(PARENT_REGISTRAR_ROLES), detail: `roles=${PARENT_REGISTRAR_ROLES}` });
    for (const [name, role] of Object.entries(DANGEROUS_ROOT_ROLES)) {
      const held = await has(role);
      checks.push({ id: `registrar-lacks-${name}`, ok: !held, detail: held ? "HELD (unexpected)" : "not held" });
    }
    if (a.owner) {
      // Informational: the plan grants the vestige.eth owner no root roles on the parent registry.
      const held: string[] = [];
      for (const [name, role] of Object.entries({ REGISTRAR: REG.REGISTRAR, RENEW: REG.RENEW, ...DANGEROUS_ROOT_ROLES })) if (await has(role, a.owner)) held.push(name);
      checks.push({ id: "owner-root-roles-on-parent", ok: true, detail: held.length ? `owner holds ${held.join("|")} (informational)` : "owner holds no root roles on the parent (as planned)" });
    }
  }
  checks.push({ id: "registrar-funded", ok: balance > 0n, detail: `balance wei=${balance}` });
  return { block: block.toString(), parentName, parentExpiry: expiry, ok: checks.every((c) => c.ok), checks };
}

export interface FirstVenturePrep {
  label: "READ_ONLY_PLAN_FOR_H_APPROVAL";
  block: string;
  digest: string;
  plan: EnsPlan;
  parentReadback: Awaited<ReturnType<typeof readParentState>>;
  preflight: Check[];
  dryRun: DryRunResult[];
}

/** Builds the first-venture plan from the REAL server venture. Throws if any precondition fails. */
export async function prepareFirstVenturePlan(a: {
  services: IdentityServices;
  client: PublicClient;
  ventureId: unknown;
  registrar: Address;
  parentRegistry: Address;
  expiry: bigint;
  proxyLogic: Address;
  owner?: Address;
  createdAt?: string;
}): Promise<FirstVenturePrep> {
  const ventureId = assertVentureId(a.ventureId);
  const v = a.services.ventures.view(ventureId); // NOT_FOUND unless it is a real server venture
  const parent = await readParentState(a.client, { parentRegistry: a.parentRegistry, registrar: a.registrar, owner: a.owner });
  const preflight: Check[] = [];
  const nowS = BigInt(Math.floor(Date.now() / 1000));
  preflight.push({ id: "parent-readback", ok: parent.ok, detail: parent.checks.filter((c) => !c.ok).map((c) => c.id).join(",") || "all parent checks pass" });
  preflight.push({ id: "expiry-within-parent", ok: a.expiry > nowS && a.expiry <= parent.parentExpiry, detail: `expiry=${a.expiry} parentExpiry=${parent.parentExpiry}` });
  preflight.push({ id: "venture-ens-not-verified", ok: v.ensStatus !== "VERIFIED", detail: `server ensStatus=${v.ensStatus}` });
  if (parent.checks.find((c) => c.id === "P1-parent-has-code")?.ok) {
    const st = await a.client.readContract({ address: a.parentRegistry, abi: permissionedRegistryAbi, functionName: "getStatus", args: [labelId(v.slug)] });
    preflight.push({ id: "venture-label-available", ok: st === 0, detail: `${v.slug} status=${["AVAILABLE", "RESERVED", "REGISTERED"][st] ?? st}` });
  }
  const failed = preflight.filter((c) => !c.ok);
  if (failed.length) throw Object.assign(new Error(`first-venture preflight failed: ${failed.map((c) => `${c.id} (${c.detail})`).join("; ")}`), { preflight, parent });

  const founders = v.seats
    .filter((s) => s.worldProofStatus === "VERIFIED")
    .map((s) => ({ label: s.founderLabel, wallet: s.wallet, ...(s.worldEnvironment ? { worldEnvironment: s.worldEnvironment } : {}) }));
  const agreement = a.services.agreements.view(ventureId, { includeText: false });
  const plan = buildFirstVenturePlan({
    registrar: a.registrar,
    parentRegistry: a.parentRegistry,
    proxyLogic: a.proxyLogic,
    slug: v.slug,
    ventureId,
    expiry: a.expiry,
    founders,
    initial: { humans: v.humansVerified, ...(agreement?.complete ? { agreementHash: agreement.docHash } : {}) },
    source: {
      ventureId: "C1 SQLite identity_ventures (server-generated)",
      ensName: v.ensName,
      founders: "World-verified seats only",
      worldEvidence: founders.some((f) => f.worldEnvironment === "staging")
        ? "staging seats are TESTED_IN_SIMULATOR (D-024); they are not proof of distinct real humans"
        : "production World ID",
    },
    createdAt: a.createdAt,
  });
  if (plan.txs.some((t) => t.signerAddress === zeroAddress)) throw new Error("plan has an empty signer");
  return { label: "READ_ONLY_PLAN_FOR_H_APPROVAL", block: parent.block, digest: planDigest(plan), plan, parentReadback: parent, preflight, dryRun: await dryRun(a.client, plan) };
}

export type { Hex, Bytes32 };
