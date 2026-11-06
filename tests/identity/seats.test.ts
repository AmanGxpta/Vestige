/**
 * Founder seats + World ID uniqueness. DEV MOCK World portal (see helpers.ts):
 * these prove OUR server logic, not live World behaviour (claim class: IMPLEMENTED, MOCK_ONLY for World).
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { Address } from "viem";
import { IdentityError } from "../../src/modules/identity/errors";
import { FakeHuman, lower, makeHarness, newWallet, type Harness } from "./helpers";

async function expectCode(p: Promise<unknown> | (() => unknown), c: string) {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    expect((e as IdentityError).code).toBe(c);
    return e as IdentityError;
  }
  throw new Error(`expected ${c}`);
}

describe("venture + seats + World uniqueness", () => {
  let h: Harness;
  const A = newWallet(), B = newWallet(), C = newWallet();
  const a = lower(A.address), b = lower(B.address), c = lower(C.address);
  const alice = new FakeHuman(), bob = new FakeHuman();

  let ventureId: `0x${string}`;
  beforeEach(() => {
    h = makeHarness();
    ventureId = h.ventures.create(a, { name: "Northstar Labs", founderLabel: "ada" }).ventureId;
  });

  async function verify(wallet: Address, human: FakeHuman, opts: Parameters<FakeHuman["prove"]>[1] = {}, vid = ventureId) {
    const r = h.ventures.worldRequest(wallet, vid);
    return h.ventures.verifyWorld(wallet, vid, { idkitResult: human.prove(r, opts) });
  }
  function seatB() {
    const { inviteToken } = h.ventures.createInvite(a, ventureId);
    h.ventures.join(b, ventureId, { inviteToken, founderLabel: "bob" });
  }

  it("ID-01: creates a fresh venture with derived ENS name and queues the ENS registration", async () => {
    const v = h.ventures.view(ventureId);
    expect(v.ensName).toBe("northstar-labs.vestige.eth");
    expect(v.status).toBe("workspace");
    expect(v.seats).toHaveLength(1);
    await h.flush();
    expect(h.ens.ventures).toEqual(["northstar-labs"]);
    expect(h.ventures.view(ventureId).ensStatus).toBe("VERIFIED"); // memory port: receipt+read-back stub
  });

  it("rejects a duplicate slug", async () => {
    await expectCode(() => h.ventures.create(c, { name: "Northstar Labs", founderLabel: "x1y" }), "SLUG_TAKEN");
  });

  it("invite is single-use, founders-only, and seats cap at 2", async () => {
    await expectCode(() => h.ventures.createInvite(b, ventureId), "FORBIDDEN");
    const { inviteToken } = h.ventures.createInvite(a, ventureId);
    h.ventures.join(b, ventureId, { inviteToken, founderLabel: "bob" });
    await expectCode(() => h.ventures.join(c, ventureId, { inviteToken, founderLabel: "cy1" }), "VENTURE_FULL");
    await expectCode(() => h.ventures.createInvite(a, ventureId), "VENTURE_FULL");
  });

  it("invite replay by another wallet fails; wrong venture fails; same wallet twice fails", async () => {
    const other = h.ventures.create(c, { name: "Other Co", founderLabel: "cy1" }).ventureId;
    const { inviteToken } = h.ventures.createInvite(a, ventureId);
    await expectCode(() => h.ventures.join(b, other, { inviteToken, founderLabel: "bob" }), "INVITE_INVALID");
    await expectCode(() => h.ventures.join(a, ventureId, { inviteToken, founderLabel: "dup" }), "ALREADY_SEATED");
    h.ventures.join(b, ventureId, { inviteToken, founderLabel: "bob" });
  });

  it("ID-02: two distinct humans each verify; attestation submitted with nullifier bytes32; status PENDING→VERIFIED only via confirm", async () => {
    seatB();
    h.attester.confirmState = "PENDING";
    const r1 = await verify(a, alice);
    expect(r1.seat.worldProofStatus).toBe("VERIFIED");
    expect(r1.attestation.status).toBe("PENDING");
    expect(h.ventures.view(ventureId).seats.find((s) => s.wallet === a)!.onchainSeatStatus).toBe("PENDING");
    await h.flush();
    expect(h.ventures.view(ventureId).seats.find((s) => s.wallet === a)!.onchainSeatStatus).toBe("PENDING"); // no receipt yet → never VERIFIED
    h.attester.confirmState = "CONFIRMED";
    expect(await h.ventures.refreshAttestation(ventureId, a)).toBe("VERIFIED");
    await verify(b, bob);
    await h.flush();
    const v = h.ventures.view(ventureId);
    expect(v.humansVerified).toBe(2);
    expect(h.attester.submitted.map((s) => s.wallet)).toEqual([a, b]);
    expect(h.attester.submitted[0]!.nullifierHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(h.ens.founders.map((f) => f.label).sort()).toEqual(["ada", "bob"]);
    expect(h.ens.records.at(-1)!.records.humans).toBe(2);
  });

  it("ID-03: SAME human, SAME venture, DIFFERENT wallet → DUPLICATE_HUMAN, seat stays empty, no attestation", async () => {
    seatB();
    await verify(a, alice);
    const before = h.attester.submitted.length;
    const err = await expectCode(verify(b, alice), "DUPLICATE_HUMAN");
    expect(err.message).toBe("This human already holds a seat in Northstar Labs.");
    expect(err.message).not.toMatch(/\d{10,}/); // no nullifier in user-facing text
    const seatBView = h.ventures.view(ventureId).seats.find((s) => s.wallet === b)!;
    expect(seatBView.worldProofStatus).toBe("PENDING");
    expect(seatBView.onchainSeatStatus).toBe("UNKNOWN");
    expect(h.attester.submitted.length).toBe(before);
    expect(h.ventures.view(ventureId).humansVerified).toBe(1);
    // portal itself returned success (it does not enforce uniqueness) — our DB did the refusal
    expect(h.portal.calls).toHaveLength(2);
  });

  it("ID-04: SAME human, DIFFERENT venture → allowed (nullifier is per-action)", async () => {
    await verify(a, alice);
    const v2 = h.ventures.create(a, { name: "Second Venture", founderLabel: "ada" }).ventureId;
    const r = await verify(a, alice, {}, v2);
    expect(r.seat.worldProofStatus).toBe("VERIFIED");
    expect(alice.nullifierFor(`vestige-founder-seat:${ventureId}`)).not.toBe(alice.nullifierFor(`vestige-founder-seat:${v2}`));
  });

  it("ID-05a: proof replay — reusing a consumed request nonce is refused before calling World", async () => {
    seatB();
    const r = h.ventures.worldRequest(a, ventureId);
    const proof = alice.prove(r);
    await h.ventures.verifyWorld(a, ventureId, { idkitResult: proof });
    const calls = h.portal.calls.length;
    await expectCode(h.ventures.verifyWorld(b, ventureId, { idkitResult: proof }), "WORLD_REQUEST_INVALID");
    expect(h.portal.calls.length).toBe(calls);
  });

  it("ID-05b: proof bound to another wallet (signal mismatch) is refused and the nonce is burned", async () => {
    seatB();
    const r = h.ventures.worldRequest(b, ventureId);
    await expectCode(h.ventures.verifyWorld(b, ventureId, { idkitResult: alice.prove(r, { signal: a }) }), "WORLD_SIGNAL_MISMATCH");
    await expectCode(h.ventures.verifyWorld(b, ventureId, { idkitResult: alice.prove(r) }), "WORLD_REQUEST_INVALID");
    expect(h.portal.calls).toHaveLength(0);
  });

  it("ID-05c: proof for another venture's action is refused", async () => {
    const r = h.ventures.worldRequest(a, ventureId);
    await expectCode(h.ventures.verifyWorld(a, ventureId, { idkitResult: alice.prove(r, { action: "vestige-founder-seat:0x" + "1".repeat(64) }) }), "WORLD_ACTION_MISMATCH");
  });

  it("ID-05d: invalid proof (portal rejects), null proof, wrong environment, legacy protocol, non-PoH credential", async () => {
    let r = h.ventures.worldRequest(a, ventureId);
    h.portal.invalidProofs.add(alice.nullifierFor(r.action));
    await expectCode(h.ventures.verifyWorld(a, ventureId, { idkitResult: alice.prove(r) }), "WORLD_PROOF_INVALID");
    h.portal.invalidProofs.clear();
    await expectCode(h.ventures.verifyWorld(a, ventureId, { idkitResult: null }), "WORLD_PROOF_INVALID");
    r = h.ventures.worldRequest(a, ventureId);
    await expectCode(h.ventures.verifyWorld(a, ventureId, { idkitResult: alice.prove(r, { environment: "production" }) }), "WORLD_ENVIRONMENT_MISMATCH");
    r = h.ventures.worldRequest(a, ventureId);
    await expectCode(h.ventures.verifyWorld(a, ventureId, { idkitResult: alice.prove(r, { protocol: "3.0" }) }), "WORLD_PROTOCOL_MISMATCH");
    r = h.ventures.worldRequest(a, ventureId);
    await expectCode(h.ventures.verifyWorld(a, ventureId, { idkitResult: alice.prove(r, { identifier: "selfie", issuer: 11 }) }), "WORLD_PROOF_INVALID");
    r = h.ventures.worldRequest(a, ventureId);
    // faux issuer 128 is what the staging simulator issues; accepted only because env=staging
    const ok = await h.ventures.verifyWorld(a, ventureId, { idkitResult: alice.prove(r, { issuer: 128 }) });
    expect(ok.seat.worldProofStatus).toBe("VERIFIED");
  }, 30_000);

  it("faux issuer 128 is refused in production config", async () => {
    const p = makeHarness({ world: { environment: "production" } });
    const vid = p.ventures.create(a, { name: "Prod Co", founderLabel: "ada" }).ventureId;
    const r = p.ventures.worldRequest(a, vid);
    await expectCode(p.ventures.verifyWorld(a, vid, { idkitResult: alice.prove(r, { issuer: 128 }) }), "WORLD_PROOF_INVALID");
  });

  it("ID-05e: cancelled verification (no result) leaves the seat PENDING with no attestation; expired request refused", async () => {
    h.ventures.worldRequest(a, ventureId); // user cancels in World App: client never posts
    expect(h.ventures.view(ventureId).seats[0]!.worldProofStatus).toBe("PENDING");
    expect(h.attester.submitted).toHaveLength(0);
    const r = h.ventures.worldRequest(a, ventureId);
    h.clock.advance(6 * 60_000);
    await expectCode(h.ventures.verifyWorld(a, ventureId, { idkitResult: alice.prove(r) }), "WORLD_REQUEST_INVALID");
  });

  it("only seated founders can request/verify; outsiders cannot", async () => {
    await expectCode(() => h.ventures.worldRequest(c, ventureId), "FORBIDDEN");
  });

  it("World service outage → WORLD_UNAVAILABLE, seat unchanged", async () => {
    const r = h.ventures.worldRequest(a, ventureId);
    h.portal.down = true;
    await expectCode(h.ventures.verifyWorld(a, ventureId, { idkitResult: alice.prove(r) }), "WORLD_UNAVAILABLE");
    expect(h.ventures.view(ventureId).seats[0]!.worldProofStatus).toBe("PENDING");
  });

  it("attester failure → human VERIFIED off-chain, on-chain seat FAILED (never shown as attested)", async () => {
    h.attester.failSubmit = true;
    const r = await verify(a, alice);
    expect(r.seat.worldProofStatus).toBe("VERIFIED");
    expect(r.attestation.status).toBe("FAILED");
    expect(h.ventures.view(ventureId).seats[0]!.onchainSeatStatus).toBe("FAILED");
  });

  it("server forwards exactly one PoH response with the server's own action/environment/min_protocol_version", async () => {
    const r = h.ventures.worldRequest(a, ventureId);
    const proof = alice.prove(r) as any;
    proof.responses.unshift({ identifier: "selfie", issuer_schema_id: 11, nullifier: "1", signal_hash: "0x0", proof: [], expires_at_min: 1, sybil_score: 1 });
    proof.action_description = "attacker text";
    await h.ventures.verifyWorld(a, ventureId, { idkitResult: proof });
    const sent = h.portal.calls[0]!.body;
    expect(sent.responses).toHaveLength(1);
    expect(sent.responses[0].identifier).toBe("proof_of_human");
    expect(sent.action).toBe(`vestige-founder-seat:${ventureId}`);
    expect(sent.min_protocol_version).toBe("4.0");
    expect(sent.action_description).toBeUndefined();
    expect(h.portal.calls[0]!.url).toBe("https://portal.test/api/v4/verify/rp_test");
  });
});
