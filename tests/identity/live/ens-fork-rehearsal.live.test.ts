/**
 * LOCAL_FORK_REHEARSAL — anvil fork of Sepolia. NOT Sepolia evidence: nothing here is
 * broadcast to a public network. Registrar and owner are IMPERSONATED on the local fork
 * (no keys). World proofs are DEV MOCK (this rehearses ENS only).
 *
 * Proves the post-approval workflow end to end against real ENSv2 bytecode/state:
 *   P1 (registrar) → P2 (owner) → independent parent read-back → real server venture via
 *   the approval-gated API (ENS stays PENDING, no broadcast) → first-venture plan from the
 *   server DB + digest → digest-gated execution → reconcileIdentity() read-back promotion →
 *   postDeploymentChecks() negative tests.
 * Run: VESTIGE_FORK=1 npx vitest run --config vitest.config.ts live/ens-fork-rehearsal
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { createPublicClient, createTestClient, createWalletClient, http, parseEther, type Address, type Hex, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { AgreementService } from "../../../src/modules/agreements/service";
import { AuthService } from "../../../src/modules/identity/auth";
import { ENS_KEYS, ENSV2_SEPOLIA } from "../../../src/modules/identity/config";
import { migrateIdentity, SqliteDb } from "../../../src/modules/identity/db";
import { verifiableFactoryAbi } from "../../../src/modules/identity/ens/encoding";
import { EnsReader } from "../../../src/modules/identity/ens/registrar";
import { ApprovalGatedEnsPort } from "../../../src/modules/identity/ports";
import { VentureService } from "../../../src/modules/identity/ventures";
import { postDeploymentChecks } from "../../../src/modules/identity/scripts/ens-checks";
import { broadcastApproved, buildParentSetupPlan, planDigest } from "../../../src/modules/identity/scripts/ens-plans";
import { prepareFirstVenturePlan, readParentState } from "../../../src/modules/identity/scripts/first-venture";
import { reconcileIdentity } from "../../../src/modules/identity/scripts/reconcile";
import { FakeHuman, FakeWorldPortal, MemoryAttester, makeWorldConfig, newWallet } from "../helpers";

const RUN = process.env.VESTIGE_FORK === "1";
const repo = new URL("../../../", import.meta.url).pathname;
const PORT = 8547;
const REGISTRAR = "0xc63F0594309F21E35b41298C71d370c0d0A9313C" as Address;
const OWNER = "0x1ed73ee055b7B5379CcD398748281C5A82e9A41E" as Address;
const REVIEWED_DIGEST = "1471c7880a7d7b89931c2320e6ce4cce252234c9164df8b01d4fec9b1e49576a";
const REVIEWED_CREATED_AT = "2026-11-06T22:15:01.675Z";

function forkUrl(): string {
  // Prefer H's configured RPC (value never printed); fall back to the public endpoint.
  const f = `${repo}.env.local`;
  if (existsSync(f)) {
    const m = /^SEPOLIA_RPC_URL=(.+)$/m.exec(readFileSync(f, "utf8"));
    if (m) return m[1]!.trim().replace(/^["']|["']$/g, "");
  }
  return "https://ethereum-sepolia-rpc.publicnode.com";
}

let anvil: ChildProcess | null = null;
afterAll(() => { anvil?.kill("SIGTERM"); });

describe.skipIf(!RUN)("LOCAL_FORK_REHEARSAL: ENS parent + first venture + negative tests", () => {
  it("runs the whole post-approval workflow on a local Sepolia fork", async () => {
    anvil = spawn("anvil", ["--fork-url", forkUrl(), "--port", String(PORT), "--chain-id", "11155111", "--silent"], { stdio: "ignore" });
    const url = `http://127.0.0.1:${PORT}`;
    const client = createPublicClient({ chain: sepolia, transport: http(url) }) as PublicClient;
    for (let i = 0; i < 60; i++) { try { await client.getBlockNumber(); break; } catch { await new Promise((r) => setTimeout(r, 500)); } }
    const forkBlock = await client.getBlockNumber();
    const test = createTestClient({ chain: sepolia, mode: "anvil", transport: http(url) });
    for (const a of [REGISTRAR, OWNER]) await test.impersonateAccount({ address: a });
    await test.setBalance({ address: OWNER, value: parseEther("1") }); // fork-only gas for the impersonated owner
    const asRegistrar = createWalletClient({ chain: sepolia, transport: http(url), account: REGISTRAR });
    const asOwner = createWalletClient({ chain: sepolia, transport: http(url), account: OWNER });

    // 1. Exact reviewed parent plan (digest must match the one H reviews).
    const proxyLogic = await client.readContract({ address: ENSV2_SEPOLIA.VerifiableFactory, abi: verifiableFactoryAbi, functionName: "proxyLogic" });
    const parent = buildParentSetupPlan({ registrar: REGISTRAR, owner: OWNER, proxyLogic, createdAt: REVIEWED_CREATED_AT });
    expect(planDigest(parent)).toBe(REVIEWED_DIGEST);
    const env = { VESTIGE_ENS_BROADCAST: "I_HAVE_H_APPROVAL" }; // fork only
    // P1 was executed on Sepolia (tx 0x3a32aca8…e151, block 12079704) after H approval; a fork at or
    // after that block inherits it. Only rehearse P1 when the fork predates it.
    const parentCode = await client.getCode({ address: parent.predicted.parentRegistry! });
    const p1 = parentCode && parentCode !== "0x" ? [] : await broadcastApproved({ plan: parent, approvedDigest: REVIEWED_DIGEST, wallet: asRegistrar, client, env });
    const p2tx = parent.txs.find((t) => t.id === "P2-point-parent-subregistry")!;
    const p2hash = await asOwner.sendTransaction({ account: OWNER, chain: sepolia, to: p2tx.to, data: p2tx.data });
    const p2 = await client.waitForTransactionReceipt({ hash: p2hash });
    expect(p2.status).toBe("success");
    const parentRegistry = parent.predicted.parentRegistry!;
    const parentReadback = await readParentState(client, { parentRegistry, registrar: REGISTRAR, owner: OWNER });
    expect(parentReadback.ok, JSON.stringify(parentReadback.checks)).toBe(true);

    // 2. Real server venture through C1 services; ENS port is approval-gated (no broadcast).
    const db = new SqliteDb(":memory:");
    migrateIdentity(db);
    const portal = new FakeWorldPortal();
    const tasks: Promise<void>[] = [];
    const ventures = new VentureService({ db, world: makeWorldConfig(), attester: new MemoryAttester(), ens: new ApprovalGatedEnsPort(), fetchImpl: portal.fetch, defer: (t) => { tasks.push(t()); } });
    const reader = new EnsReader(client);
    ventures.checks = {
      ventureName: async (n, id) => (await reader.text(n, ENS_KEYS.status).catch(() => null)) === "workspace" && (await reader.text(n, ENS_KEYS.ventureId).catch(() => null)) === id,
      founderName: async (n, w) => (await reader.address(n).catch(() => null))?.toLowerCase() === w.toLowerCase(),
      humans: async (n, k) => (await reader.text(n, ENS_KEYS.humans).catch(() => null)) === String(k),
    };
    const agreements = new AgreementService(db, ventures, new ApprovalGatedEnsPort(), { defer: (t) => { tasks.push(t()); } });
    const services = { db, ventures, agreements, auth: new AuthService(db, { domain: "localhost:3200", uri: "http://localhost:3200" }) };
    const A = newWallet(), B = newWallet();
    const a = A.address.toLowerCase() as Address, b = B.address.toLowerCase() as Address;
    const slug = `rehearsal-${Date.now() % 1_000_000}`;
    const vid = ventures.create(a, { name: `Rehearsal ${slug}`, slug, founderLabel: "ada" }).ventureId;
    ventures.join(b, vid, { inviteToken: ventures.createInvite(a, vid).inviteToken, founderLabel: "bob" });
    for (const w of [a, b]) await ventures.verifyWorld(w, vid, { idkitResult: new FakeHuman().prove(ventures.worldRequest(w, vid)) });
    await Promise.all(tasks);
    expect(ventures.view(vid).ensStatus).toBe("PENDING"); // gated: nothing was sent by the API

    // 3. First-venture plan from the server DB, digest, dry run; then digest-gated execution.
    const expiry = parentReadback.parentExpiry; // must be ≤ parent expiry
    const prep = await prepareFirstVenturePlan({ services, client, ventureId: vid, registrar: REGISTRAR, parentRegistry, expiry, proxyLogic, owner: OWNER });
    expect(prep.plan.inputs.ventureId).toBe(vid);
    expect(prep.dryRun.slice(0, 2).every((r) => r.ok)).toBe(true);
    const sent = await broadcastApproved({ plan: prep.plan, approvedDigest: prep.digest, wallet: asRegistrar, client, env });
    const wrongDigest = await broadcastApproved({ plan: prep.plan, approvedDigest: REVIEWED_DIGEST, wallet: asRegistrar, client, env }).catch((e: Error) => e.message);
    expect(String(wrongDigest)).toMatch(/digest/);

    // 4. Reconcile by read-back only, then the read-only negative tests.
    const rec = await reconcileIdentity(services);
    const v = ventures.view(vid);
    const checks = await postDeploymentChecks(client, { ensName: v.ensName, ventureId: vid, parentRegistry, registrar: REGISTRAR, founders: v.seats.map((s) => ({ label: s.founderLabel, wallet: s.wallet })) });

    const out = {
      label: "LOCAL_FORK_REHEARSAL — anvil fork of Sepolia; impersonated signers; NOT Sepolia evidence; World proofs DEV MOCK",
      forkBlock: forkBlock.toString(),
      parent: { digest: planDigest(parent), p1: p1.length ? p1.map((r) => ({ id: r.id, block: r.block.toString() })) : "inherited from Sepolia (tx 0x3a32aca8086f8c8bcc3d4026e98e5caea28cf921259d39e5d87d753c1b30e151)", p2OnForkStatus: p2.status, readback: parentReadback },
      firstVenture: { ventureId: vid, ensName: v.ensName, digest: prep.digest, preflight: prep.preflight, dryRun: prep.dryRun, executed: sent.map((r) => r.id), wrongDigestRefused: String(wrongDigest).includes("digest") },
      reconcile: rec,
      serverStateAfter: { ensStatus: v.ensStatus, seats: v.seats.map((s) => ({ label: s.founderLabel, subnameStatus: s.subnameStatus })) },
      postDeploymentChecks: checks,
    };
    writeFileSync(`${repo}docs/agent-reports/identity/evidence/ens-fork-rehearsal.json`, JSON.stringify(out, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2) + "\n");
    console.log(JSON.stringify({ reconcile: rec, ens: out.serverStateAfter, failed: checks.checks.filter((c) => !c.ok) }));
    expect(v.ensStatus).toBe("VERIFIED");
    expect(v.seats.every((s) => s.subnameStatus === "VERIFIED")).toBe(true);
    expect(checks.checks.filter((c) => !c.ok)).toEqual([]);
  }, 600_000);
});

export type { Hex };
