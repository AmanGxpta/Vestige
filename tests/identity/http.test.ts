/** Route-level tests: auth required, error shapes, public summary privacy. */
import { describe, expect, it } from "vitest";
import { handlers } from "../../src/modules/identity/http";
import { FakeHuman, lower, makeHarness, newWallet, req, signIn } from "./helpers";

describe("HTTP handlers", () => {
  it("wallet challenge/session: single-use, signer-bound, expiring", async () => {
    const h = makeHarness();
    const api = handlers(h);
    const A = newWallet(), B = newWallet();
    const ch = await (await api.authChallenge(req({}, { wallet: A.address }))).json();
    expect(ch.message).toContain("does not approve any transaction");
    const badSig = await B.signMessage({ message: ch.message });
    expect((await api.authSession(req({}, { nonce: ch.nonce, signature: badSig }))).status).toBe(401);
    const sig = await A.signMessage({ message: ch.message });
    // challenge consumed by the failed attempt → cannot be retried
    expect((await api.authSession(req({}, { nonce: ch.nonce, signature: sig }))).status).toBe(401);
    const ch2 = h.auth.createChallenge(A.address);
    h.clock.advance(6 * 60_000);
    expect((await api.authSession(req({}, { nonce: ch2.nonce, signature: await A.signMessage({ message: ch2.message }) }))).status).toBe(401);
  });

  it("write routes require a session; client-supplied wallet is ignored", async () => {
    const h = makeHarness();
    const api = handlers(h);
    const res = await api.createVenture(req({}, { name: "Northstar", founderLabel: "ada" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
    const A = newWallet(), X = newWallet();
    const auth = await signIn(h, A);
    const created = await (await api.createVenture(req(auth, { name: "Northstar", founderLabel: "ada", founderWallet: X.address }))).json();
    expect(created.seats[0].wallet).toBe(lower(A.address));
  });

  it("end-to-end over routes, then public summary contains no PII/nullifier/agreement text", async () => {
    const h = makeHarness();
    const api = handlers(h);
    const A = newWallet(), B = newWallet();
    const authA = await signIn(h, A), authB = await signIn(h, B);
    const v = await (await api.createVenture(req(authA, { name: "Northstar Labs", founderLabel: "ada" }))).json();
    const { inviteToken } = await (await api.createInvite(req(authA, {}), v.ventureId)).json();
    expect((await api.join(req(authB, { inviteToken, founderLabel: "bob" }), v.ventureId)).status).toBe(200);
    const humans = [new FakeHuman(), new FakeHuman()];
    const nullifiers: string[] = [];
    for (const [i, auth] of [authA, authB].entries()) {
      const wr = await (await api.worldRequest(req(auth, {}), v.ventureId)).json();
      expect(wr.rp_context.signature).toMatch(/^0x[0-9a-f]{130}$/);
      expect(JSON.stringify(wr)).not.toContain(h.world.signingKeyHex.slice(2));
      const proof = humans[i]!.prove(wr);
      nullifiers.push(proof.responses[0]!.nullifier);
      const vr = await api.worldVerify(req(auth, { idkitResult: proof }), v.ventureId);
      expect(vr.status).toBe(200);
    }
    // duplicate over HTTP → 409 with the PRD copy
    const third = makeHarness();
    void third;
    const terms = {
      effectiveDate: "2026-11-06", decisionRule: "Both sign.", notes: "PRIVATE-NOTE-XYZ",
      founders: [
        { wallet: A.address, role: "CEO", contribution: "c", ownershipBps: 6000, vestingIntent: "v" },
        { wallet: B.address, role: "CTO", contribution: "c", ownershipBps: 4000, vestingIntent: "v" },
      ],
    };
    expect((await api.createAgreementVersion(req(authA, terms), v.ventureId)).status).toBe(201);
    await h.flush();
    const pub = await (await api.publicSummary(req(), "northstar-labs.vestige.eth")).json();
    expect(pub.humansVerified).toBe(2);
    expect(pub.legalNotice).toBe("Workspace · not legally incorporated");
    expect(pub.agreement.version).toBe(1);
    const s = JSON.stringify(pub);
    expect(s).not.toContain("PRIVATE-NOTE-XYZ");
    expect(s).not.toContain("canonicalJson");
    for (const n of nullifiers) {
      expect(s).not.toContain(n);
      expect(s).not.toContain(BigInt(n).toString(16));
    }
    expect(s).not.toContain(inviteToken);
    expect((await api.publicSummary(req(), "nope.vestige.eth")).status).toBe(404);
    // founders-only detail view
    expect((await api.getVenture(req(await signIn(h, newWallet())), v.ventureId)).status).toBe(403);
    expect((await api.getVenture(req(authA), v.ventureId)).status).toBe(200);
  });

  it("duplicate human over HTTP returns 409 DUPLICATE_HUMAN with the PRD message", async () => {
    const h = makeHarness();
    const api = handlers(h);
    const A = newWallet(), B = newWallet();
    const authA = await signIn(h, A), authB = await signIn(h, B);
    const v = await (await api.createVenture(req(authA, { name: "Northstar Labs", founderLabel: "ada" }))).json();
    const { inviteToken } = await (await api.createInvite(req(authA, {}), v.ventureId)).json();
    await api.join(req(authB, { inviteToken, founderLabel: "bob" }), v.ventureId);
    const same = new FakeHuman();
    for (const auth of [authA]) {
      const wr = await (await api.worldRequest(req(auth, {}), v.ventureId)).json();
      await api.worldVerify(req(auth, { idkitResult: same.prove(wr) }), v.ventureId);
    }
    const wr = await (await api.worldRequest(req(authB, {}), v.ventureId)).json();
    const res = await api.worldVerify(req(authB, { idkitResult: same.prove(wr) }), v.ventureId);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: { code: "DUPLICATE_HUMAN", message: "This human already holds a seat in Northstar Labs." } });
  });

  it("malformed JSON → 400, unknown errors → opaque 500", async () => {
    const h = makeHarness();
    const api = handlers(h);
    const r = new Request("https://x/api", { method: "POST", body: "{nope", headers: { "content-type": "application/json" } });
    expect((await api.authChallenge(r)).status).toBe(400);
  });
});
