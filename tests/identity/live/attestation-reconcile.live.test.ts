/**
 * OPERATOR COMMAND — run the moment X reports SeatRegistry deployed + attester send grant:
 *
 *   VESTIGE_ATTEST_RECONCILE=1 VESTIGE_DB_PATH=<server sqlite> VENTURE_ID=<id> \
 *   VESTIGE_AUTH_URI=<as server> WHITECHAIN_RPC_URL=https://rpc.testnet.whitechain.io \
 *   VESTIGE_DEPLOYMENT_MANIFEST_PATH=<X infra manifest> [COMPOSITION_MODULE=<X composition with send grant>] \
 *   [ATTEST_DEMO_OVERRIDES=1] npx vitest run --config tests/identity/vitest.config.ts attestation-reconcile
 *
 * Uses X's composition (default src/modules/treasury/root-composition.mjs) to get C1 services with
 * the REAL SeatAttestationPort — C1 never builds a signer. Runs reconcileIdentity({retry:true}):
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
    const identityModule = await import("../../../src/modules/identity/container");
    const comp = await import(/* @vite-ignore */ env.COMPOSITION_MODULE ?? `${repo}src/modules/treasury/root-composition.mjs`);
    const root = await comp.createRootComposition({ identityModule, env }).ready();
    const client = createPublicClient({ transport: http(env.WHITECHAIN_RPC_URL!) });
    const before = await attestationEvidence(root.identity.ventures, client as never, registry, env.VENTURE_ID as `0x${string}`);
    const rec = await reconcileIdentity(root.identity, { retry: true, attestDemoOverrides: env.ATTEST_DEMO_OVERRIDES === "1" });
    // second pass confirms anything submitted in the first (receipt needs ≥1 confirmation)
    await new Promise((r) => setTimeout(r, 15_000));
    const rec2 = await reconcileIdentity(root.identity, { retry: false });
    const after = await attestationEvidence(root.identity.ventures, client as never, registry, env.VENTURE_ID as `0x${string}`);
    const out = { label: "LIVE_WHITECHAIN_ATTESTATION_EVIDENCE", mode: root.mode ?? "unknown", attestDemoOverrides: env.ATTEST_DEMO_OVERRIDES === "1", before, reconcile: [rec, rec2], after };
    writeFileSync(`${repo}docs/agent-reports/identity/evidence/attestation-${after.ensName.split(".")[0]}.json`, JSON.stringify(out, (_k, x) => (typeof x === "bigint" ? x.toString() : x), 2) + "\n");
    console.log(JSON.stringify({ seats: after.seats.map((s) => ({ label: s.label, evidenceLabel: s.evidenceLabel, tx: s.txHash, receipt: s.receipt?.status, isSeat: s.isSeatAtLatest, hashOk: s.eventHashMatchesExpected, server: s.serverOnchainStatus })), review: rec.needsManualReview }));
    expect(after.seats.length).toBeGreaterThan(0);
  });
});
