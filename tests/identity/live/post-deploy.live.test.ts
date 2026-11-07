/**
 * OPERATOR STEP (read-only to chains): after an approved ENS plan lands, reconcile the REAL
 * server DB by Universal Resolver read-back and run the post-deployment negative checks.
 *   VESTIGE_LIVE=1 VESTIGE_DB_PATH=<server sqlite> VENTURE_ID=<id> npx vitest run --config tests/identity/vitest.config.ts post-deploy
 */
import { existsSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { AgreementService } from "../../../src/modules/agreements/service";
import { ENS_KEYS } from "../../../src/modules/identity/config";
import { migrateIdentity, SqliteDb } from "../../../src/modules/identity/db";
import { EnsReader } from "../../../src/modules/identity/ens/registrar";
import { ApprovalGatedEnsPort, UnconfiguredPort } from "../../../src/modules/identity/ports";
import { VentureService } from "../../../src/modules/identity/ventures";
import { postDeploymentChecks } from "../../../src/modules/identity/scripts/ens-checks";
import { reconcileIdentity } from "../../../src/modules/identity/scripts/reconcile";

const RUN = process.env.VESTIGE_LIVE === "1" && !!process.env.VENTURE_ID && !!process.env.VESTIGE_DB_PATH;
const repo = new URL("../../../", import.meta.url).pathname;

describe.skipIf(!RUN)("OPERATOR: post-deploy reconcile + checks (read-only)", () => {
  it("reconciles by read-back and runs the negative checks", async () => {
    if (!existsSync(process.env.VESTIGE_DB_PATH!)) throw new Error("no server DB");
    const db = new SqliteDb(process.env.VESTIGE_DB_PATH!);
    migrateIdentity(db);
    const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com") });
    const ventures = new VentureService({ db, world: null, attester: new UnconfiguredPort("attester"), ens: new ApprovalGatedEnsPort() });
    const r = new EnsReader(client as never);
    ventures.checks = {
      ventureName: async (n, id) => (await r.text(n, ENS_KEYS.status)) === "workspace" && (await r.text(n, ENS_KEYS.ventureId)) === id,
      founderName: async (n, w) => (await r.address(n))?.toLowerCase() === w.toLowerCase(),
      humans: async (n, k) => (await r.text(n, ENS_KEYS.humans)) === String(k),
    };
    const agreements = new AgreementService(db, ventures, new ApprovalGatedEnsPort(), { checkAgreementRecord: async (n, h) => (await r.text(n, ENS_KEYS.agreement))?.toLowerCase() === h.toLowerCase() });
    const rec = await reconcileIdentity({ db, ventures, agreements } as never);
    const v = ventures.view(process.env.VENTURE_ID);
    const founders = v.seats.filter((s) => s.worldProofStatus === "VERIFIED").map((s) => ({ label: s.founderLabel, wallet: s.wallet as Address }));
    const checks = await postDeploymentChecks(client as never, {
      ensName: v.ensName, ventureId: v.ventureId,
      parentRegistry: (process.env.VESTIGE_PARENT_REGISTRY ?? "0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73") as Address,
      registrar: "0xc63F0594309F21E35b41298C71d370c0d0A9313C", founders,
    });
    const out = {
      label: "LIVE_SEPOLIA_READBACK — read-only; world proofs for founders are TESTED_IN_SIMULATOR (staging)",
      reconcile: rec,
      serverStateAfter: { ensName: v.ensName, ensStatus: v.ensStatus, seats: v.seats.map((s) => ({ label: s.founderLabel, worldProofStatus: s.worldProofStatus, worldEnvironment: s.worldEnvironment ?? null, subnameStatus: s.subnameStatus })) },
      postDeploymentChecks: checks,
    };
    writeFileSync(`${repo}docs/agent-reports/identity/evidence/post-deploy-${v.slug}.json`, JSON.stringify(out, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2) + "\n");
    console.log(JSON.stringify({ reconcile: rec, state: out.serverStateAfter, failed: checks.checks.filter((c) => !c.ok) }));
    expect(checks.checks.filter((c) => !c.ok)).toEqual([]);
  });
});
