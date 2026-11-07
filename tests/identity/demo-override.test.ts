/** CR-ID-06 demo override guardrails (H-requested, staging-only, operator-only). */
import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256 } from "viem";
import { handlers } from "../../src/modules/identity/http";
import { demoOverrideHash } from "../../src/modules/identity/ventures";
import { FakeHuman, lower, makeHarness, newWallet, req, toTypedData } from "./helpers";

async function setup(world: { environment?: "staging" | "production" } = {}) {
  const h = makeHarness({ world });
  const A = newWallet(), B = newWallet();
  const a = lower(A.address), b = lower(B.address);
  const vid = h.ventures.create(a, { name: "Northstar Labs", founderLabel: "aman" }).ventureId;
  h.ventures.join(b, vid, { inviteToken: h.ventures.createInvite(a, vid).inviteToken, founderLabel: "ravi" });
  return { h, A, B, a, b, vid };
}
const code = async (p: Promise<unknown>) => p.then(() => "OK", (e) => e.code);

describe("demo override", () => {
  it("refuses before any real World proof, for a verified seat, twice, or for an unknown wallet", async () => {
    const { h, a, b, vid } = await setup();
    expect(await code(h.ventures.demoOverrideSeat(vid, b, { reason: "demo", operator: "H" }))).toBe("FORBIDDEN"); // no real proof yet
    await h.ventures.verifyWorld(a, vid, { idkitResult: new FakeHuman().prove(h.ventures.worldRequest(a, vid)) });
    expect(await code(h.ventures.demoOverrideSeat(vid, a, { reason: "demo", operator: "H" }))).toBe("ALREADY_VERIFIED");
    expect(await code(h.ventures.demoOverrideSeat(vid, lower(newWallet().address), { reason: "demo", operator: "H" }))).toBe("NOT_FOUND");
    expect(await code(h.ventures.demoOverrideSeat(vid, b, { reason: "", operator: "H" }))).toBe("BAD_REQUEST");
    expect(await code(h.ventures.demoOverrideSeat(vid, b, { reason: "demo", operator: "H" }))).toBe("OK");
    expect(await code(h.ventures.demoOverrideSeat(vid, b, { reason: "demo", operator: "H" }))).toBe("ALREADY_VERIFIED");
  });

  it("is refused for production World", async () => {
    const { h, a, b, vid } = await setup({ environment: "production" });
    await h.ventures.verifyWorld(a, vid, { idkitResult: new FakeHuman().prove(h.ventures.worldRequest(a, vid)) });
    expect(await code(h.ventures.demoOverrideSeat(vid, b, { reason: "demo", operator: "H" }))).toBe("FORBIDDEN");
  });

  it("unblocks terms; never claims a human; no subname; humans stays 1; namespaced attestation hash", async () => {
    const { h, A, B, a, b, vid } = await setup();
    const human = new FakeHuman();
    const proof = human.prove(h.ventures.worldRequest(a, vid));
    await h.ventures.verifyWorld(a, vid, { idkitResult: proof });
    await h.flush();
    const foundersBefore = h.ens.founders.length;
    await h.ventures.demoOverrideSeat(vid, b, { reason: "simulator returns one 4.0 nullifier (D-024)", operator: "H" });
    await h.flush();
    const v = h.ventures.view(vid);
    const rb = v.seats.find((s) => s.wallet === b)!;
    expect(rb).toMatchObject({ worldProofStatus: "VERIFIED", demoOverride: true });
    expect(rb.worldEnvironment).toBeUndefined();
    expect(v.humansVerified).toBe(1);
    expect(h.ens.founders.length).toBe(foundersBefore); // no subname for the override
    expect(h.ens.records.every((r) => r.records.humans === undefined || r.records.humans === 1)).toBe(true);
    // attestation uses the namespaced demo hash, never a World digest
    const att = h.attester.submitted.find((x) => x.wallet === b)!;
    expect(att.nullifierHash).toBe(demoOverrideHash(vid, b));
    expect(att.nullifierHash).not.toBe(keccak256(encodeAbiParameters([{ type: "uint256" }], [BigInt(proof.responses[0]!.nullifier)])));
    expect(h.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM identity_world_nullifiers WHERE venture_id = ?", vid)!.n).toBe(1);
    // public truth: not a verified human, SELF_REPORTED, flagged
    const pub = await (await handlers(h).publicSummary(req(), "northstar-labs.vestige.eth")).json();
    const pf = pub.founders.find((f: { wallet: string }) => f.wallet === b);
    expect(pf).toMatchObject({ humanVerified: false, label: "SELF_REPORTED", demoOverride: true });
    expect(pub.humansVerified).toBe(1);
    expect(pub.events.find((e: { kind: string }) => e.kind === "founder_demo_override")).toMatchObject({ label: "SELF_REPORTED" });
    // the flow moves on: both founders can draft and sign terms
    const terms = { effectiveDate: "2026-11-07", decisionRule: "Both approve.", founders: [
      { wallet: A.address, role: "CEO", contribution: "p", ownershipBps: 5000, vestingIntent: "4y" },
      { wallet: B.address, role: "CTO", contribution: "e", ownershipBps: 5000, vestingIntent: "4y" }] };
    h.agreements.createVersion(a, vid, terms);
    for (const [acct, w] of [[A, a], [B, b]] as const) {
      const p = h.agreements.signingPayload(w, vid, {});
      await h.agreements.sign(w, vid, { version: 1, nonce: p.nonce, expiry: p.expiry, signature: await acct.signTypedData(toTypedData(p)) });
    }
    expect(h.agreements.view(vid, { includeText: false })!.complete).toBe(true);
  });

  it("there is no HTTP route for it", async () => {
    const { h } = await setup();
    expect(Object.keys(handlers(h)).some((k) => /override/i.test(k))).toBe(false);
  });
});

describe("attestation of a demo-override seat (CR-ID-06 labelling)", () => {
  it("retry skips the override unless opted in; sources and basis say MOCK_ONLY demo hash", async () => {
    const { reconcileIdentity } = await import("../../src/modules/identity/scripts/reconcile");
    const { h, a, b, vid } = await setup();
    h.attester.failSubmit = true; // registry not deployed yet
    await h.ventures.verifyWorld(a, vid, { idkitResult: new FakeHuman().prove(h.ventures.worldRequest(a, vid)) });
    await h.ventures.demoOverrideSeat(vid, b, { reason: "demo", operator: "H" });
    h.attester.failSubmit = false; // X deployed + granted
    h.attester.submitted.length = 0;
    const r1 = await reconcileIdentity(h, { retry: true });
    expect(h.attester.submitted.map((x) => x.wallet)).toEqual([a]); // ravi NOT attested by default
    expect(r1.needsManualReview.some((x) => x.includes(b) && x.includes("demo-override-not-attested"))).toBe(true);
    await reconcileIdentity(h, { retry: true, attestDemoOverrides: true });
    await h.flush();
    expect(h.attester.submitted.find((x) => x.wallet === b)!.nullifierHash).toBe(demoOverrideHash(vid, b));
    expect(h.ventures.expectedSeatHash(vid, b)).toEqual({ basis: "demo-override-hash", seatHash: demoOverrideHash(vid, b) });
    expect(h.ventures.expectedSeatHash(vid, a)!.basis).toBe("world-nullifier-digest");
    const v = h.ventures.view(vid);
    expect(v.seats.find((s) => s.wallet === b)).toMatchObject({ demoOverride: true, attestationBasis: "demo-override-hash" });
    expect(v.seats.find((s) => s.wallet === a)).toMatchObject({ attestationBasis: "world-nullifier-digest" });
    const ev = h.db.all<{ actor: string; source: string; kind: string }>("SELECT actor, source, kind FROM identity_events WHERE kind LIKE 'seat_attest%'");
    for (const e of ev.filter((x) => x.actor === b)) expect(e.source).toBe("seat-registry:demo-override-hash (MOCK_ONLY — not World ID)");
    for (const e of ev.filter((x) => x.actor === a)) expect(e.source).toBe("seat-registry:world-nullifier-digest");
    const pub = await (await handlers(h).publicSummary(req(), "northstar-labs.vestige.eth")).json();
    expect(pub.founders.find((f: { wallet: string }) => f.wallet === b)).toMatchObject({ humanVerified: false, label: "SELF_REPORTED", demoOverride: true, attestationBasis: "demo-override-hash" });
  });
});
