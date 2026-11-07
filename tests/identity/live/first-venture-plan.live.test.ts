/**
 * OPERATOR STEP (read-only): prepare the first-venture ENS plan for H approval from the
 * REAL server database. No keys, no signing, no broadcast.
 *   VESTIGE_LIVE=1 VESTIGE_DB_PATH=<server sqlite> VENTURE_ID=<server ventureId> \
 *   VESTIGE_ENS_EXPIRY=<≤ vestige.eth expiry> npm run test:live -- first-venture-plan
 * Refuses (throws with the failing check ids) until the live parent read-back passes,
 * i.e. until H's owner-wallet P2 receipt has landed. Output: evidence/first-venture-plan-<slug>.json
 */
import { existsSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPublicClient, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { AgreementService } from "../../../src/modules/agreements/service";
import { ENSV2_SEPOLIA } from "../../../src/modules/identity/config";
import { migrateIdentity, SqliteDb } from "../../../src/modules/identity/db";
import { verifiableFactoryAbi } from "../../../src/modules/identity/ens/encoding";
import { ApprovalGatedEnsPort, UnconfiguredPort } from "../../../src/modules/identity/ports";
import { VentureService } from "../../../src/modules/identity/ventures";
import { prepareFirstVenturePlan } from "../../../src/modules/identity/scripts/first-venture";

const RUN = process.env.VESTIGE_LIVE === "1" && !!process.env.VENTURE_ID && !!process.env.VESTIGE_DB_PATH;
const repo = new URL("../../../", import.meta.url).pathname;

describe.skipIf(!RUN)("OPERATOR: first-venture plan from the real server DB (read-only)", () => {
  it("builds the digest-bound plan for H approval", async () => {
    const path = process.env.VESTIGE_DB_PATH!;
    if (!existsSync(path)) throw new Error(`no server DB at ${path}`);
    const db = new SqliteDb(path);
    migrateIdentity(db); // additive CREATE IF NOT EXISTS only
    const ventures = new VentureService({ db, world: null, attester: new UnconfiguredPort("attester"), ens: new ApprovalGatedEnsPort() });
    const agreements = new AgreementService(db, ventures, new ApprovalGatedEnsPort());
    const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com") });
    const proxyLogic = await client.readContract({ address: ENSV2_SEPOLIA.VerifiableFactory, abi: verifiableFactoryAbi, functionName: "proxyLogic" });
    const prep = await prepareFirstVenturePlan({
      services: { db, ventures, agreements } as never,
      client: client as never,
      ventureId: process.env.VENTURE_ID,
      registrar: (process.env.ENS_REGISTRAR_ADDRESS ?? "0xc63F0594309F21E35b41298C71d370c0d0A9313C") as Address,
      parentRegistry: (process.env.VESTIGE_PARENT_REGISTRY ?? "0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73") as Address,
      owner: "0x1ed73ee055b7B5379CcD398748281C5A82e9A41E",
      expiry: BigInt(process.env.VESTIGE_ENS_EXPIRY ?? "0"),
      proxyLogic,
    });
    const slug = String(prep.plan.inputs.slug);
    writeFileSync(`${repo}docs/agent-reports/identity/evidence/first-venture-plan-${slug}.json`, JSON.stringify(prep, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
    console.log(JSON.stringify({ digest: prep.digest, ventureId: prep.plan.inputs.ventureId, dryRun: prep.dryRun }));
    expect(prep.digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
