/**
 * OPERATOR COMMAND — run the moment X reports SeatRegistry deployed + attester send grant:
 *
 *   VESTIGE_ATTEST_RECONCILE=1 VESTIGE_DB_PATH=<server sqlite> VENTURE_ID=<id> \
 *   VESTIGE_AUTH_URI=<as server> WHITECHAIN_RPC_URL=https://rpc.testnet.whitechain.io \
 *   VESTIGE_DEPLOYMENT_MANIFEST_PATH=contracts/manifests/whitechain-1874/infrastructure.json \
 *   VESTIGE_ATTESTER_PRIVATE_KEY=<from the attester keystore, env only> ATTESTER_ADDRESS=<attester> \
 *   [ATTEST_DEMO_OVERRIDES=1] npx vitest run --config tests/identity/vitest.config.ts attestation-reconcile
 *
 * Uses the SHARED root composition (src/shared/composition.ts → services()) — the same wiring the
 * app uses, with X's real SeatAttester + attester transport. C1 builds no signer of its own. Runs reconcileIdentity({retry:true}):
 * FAILED seats with no tx are re-submitted through X's port (demo-override seats only with
 * ATTEST_DEMO_OVERRIDES=1), then confirmed by X's receipt + isSeat read-back. Writes evidence with
 * tx hashes, the on-chain SeatAttested hash vs the intended hash, and an independent isSeat read.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPublicClient, http, type Address } from "viem";
import { attestationEvidence } from "../../../src/modules/identity/scripts/attestation-evidence";
import { reconcileIdentity } from "../../../src/modules/identity/scripts/reconcile";

const RUN = process.env.VESTIGE_ATTEST_RECONCILE === "1";
const repo = new URL("../../../", import.meta.url).pathname;

describe.skipIf(!RUN)("OPERATOR: attestation retry + Whitechain evidence", () => {
  it("retries through X's port and records receipts + registry read-back", async () => {
    const env = process.env;
    const manifest = JSON.parse(readFileSync(env.VESTIGE_DEPLOYMENT_MANIFEST_PATH!, "utf8"));
    const registry = manifest.contracts?.registry?.address as Address;
    if (!registry) throw new Error("manifest has no contracts.registry.address");
    const shared = await import("../../../src/shared/composition");
    const root = (await shared.services()) as unknown as { identity: Parameters<typeof reconcileIdentity>[0]; mode?: string; attesterMode?: string };
    if (root.attesterMode !== "ENABLED") throw new Error(`shared composition attesterMode=${root.attesterMode} (no broadcast possible)`);
    const client = createPublicClient({ transport: http(env.WHITECHAIN_RPC_URL!) });
    const before = await attestationEvidence(root.identity.ventures, client as never, registry, env.VENTURE_ID as `0x${string}`);
    const rec = await reconcileIdentity(root.identity, { retry: true, attestDemoOverrides: env.ATTEST_DEMO_OVERRIDES === "1" });
    // read-only passes until X's confirm (receipt + ≥1 block + isSeat at receipt block) settles
    let rec2 = rec;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      rec2 = await reconcileIdentity(root.identity, { retry: false });
      const v = root.identity.ventures.view(env.VENTURE_ID);
      if (v.seats.every((s) => s.onchainSeatStatus !== "PENDING")) break;
    }
    const after = await attestationEvidence(root.identity.ventures, client as never, registry, env.VENTURE_ID as `0x${string}`);
    const out = { label: "LIVE_WHITECHAIN_ATTESTATION_EVIDENCE", composition: "src/shared/composition.ts services()", mode: root.mode ?? "unknown", attesterMode: root.attesterMode, attestDemoOverrides: env.ATTEST_DEMO_OVERRIDES === "1", before, reconcile: [rec, rec2], after };
    writeFileSync(`${repo}docs/agent-reports/identity/evidence/attestation-${after.ensName.split(".")[0]}.json`, JSON.stringify(out, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2) + "\n");
    console.log(JSON.stringify({ seats: after.seats.map((s) => ({ label: s.label, evidenceLabel: s.evidenceLabel, tx: s.txHash, receipt: s.receipt?.status, isSeat: s.isSeatAtLatest, hashOk: s.eventHashMatchesExpected, server: s.serverOnchainStatus })), review: rec.needsManualReview }));
    expect(after.seats.length).toBeGreaterThan(0);
  });
});
