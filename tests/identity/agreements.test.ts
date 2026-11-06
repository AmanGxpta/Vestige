/** Founding agreement versions + real EIP-712 signatures (viem, throwaway keys). */
import { beforeEach, describe, expect, it } from "vitest";
import type { PrivateKeyAccount } from "viem/accounts";
import { IdentityError } from "../../src/modules/identity/errors";
import { FakeHuman, lower, makeHarness, newWallet, toTypedData, type Harness } from "./helpers";

async function expectCode(p: Promise<unknown> | (() => unknown), c: string) {
  try { await (typeof p === "function" ? p() : p); } catch (e) { expect((e as IdentityError).code).toBe(c); return; }
  throw new Error(`expected ${c}`);
}

describe("founding agreement", () => {
  let h: Harness;
  let vid: `0x${string}`;
  const A = newWallet(), B = newWallet(), C = newWallet();
  const a = lower(A.address), b = lower(B.address);
  const terms = (decisionRule = "Both founders must approve spending.") => ({
    effectiveDate: "2026-11-06",
    decisionRule,
    founders: [
      { wallet: A.address, role: "CEO", contribution: "Product", ownershipBps: 5000, vestingIntent: "4y, 1y cliff" },
      { wallet: B.address, role: "CTO", contribution: "Engineering", ownershipBps: 5000, vestingIntent: "4y, 1y cliff" },
    ],
  });
  const exp = () => Math.floor(h.clock.now() / 1000) + 3600;

  async function signAs(acct: PrivateKeyAccount, nonce: string, version: number, expiry = exp()) {
    const p = h.agreements.signingPayload(lower(acct.address), vid, { nonce, expiry });
    const signature = await acct.signTypedData(toTypedData(p));
    return h.agreements.sign(lower(acct.address), vid, { version, nonce, expiry, signature });
  }

  beforeEach(async () => {
    h = makeHarness();
    vid = h.ventures.create(a, { name: "Northstar Labs", founderLabel: "ada" }).ventureId;
    const { inviteToken } = h.ventures.createInvite(a, vid);
    h.ventures.join(b, vid, { inviteToken, founderLabel: "bob" });
    for (const [w, hu] of [[a, new FakeHuman()], [b, new FakeHuman()]] as const) {
      const r = h.ventures.worldRequest(w, vid);
      await h.ventures.verifyWorld(w, vid, { idkitResult: hu.prove(r) });
    }
    await h.flush();
  });

  it("ID-06: both sign v1 → complete → ENS vestige.agreement = docHash (after receipt+read-back)", async () => {
    const v1 = h.agreements.createVersion(a, vid, terms());
    expect(v1.version).toBe(1);
    expect(v1.docHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect((await signAs(A, "1", 1)).complete).toBe(false);
    const done = await signAs(B, "1", 1);
    expect(done.complete).toBe(true);
    await h.flush();
    expect(h.ens.records.at(-1)!.records.agreementHash).toBe(v1.docHash);
    expect(h.agreements.view(vid, { includeText: false })!.ensStatus).toBe("VERIFIED");
  });

  it("changing one word → new hash, v1 signatures no longer count, v1 signature cannot be submitted for v2", async () => {
    const v1 = h.agreements.createVersion(a, vid, terms());
    await signAs(A, "1", 1);
    await signAs(B, "1", 1);
    const v2 = h.agreements.createVersion(b, vid, terms("Both founders must approve all spending."));
    expect(v2.version).toBe(2);
    expect(v2.docHash).not.toBe(v1.docHash);
    expect(v2.signatures).toHaveLength(0);
    expect(v2.complete).toBe(false);
    // stale client still holding v1 payload
    await expectCode(signAs(A, "2", 1), "VERSION_SUPERSEDED");
    // v1-typed signature replayed as v2 → recovers to a different address → invalid
    const p3 = toTypedData(h.agreements.signingPayload(a, vid, { nonce: "3", expiry: exp() }));
    const p1sig = await A.signTypedData({ ...p3, message: { ...p3.message, version: 1n, docHash: v1.docHash } });
    await expectCode(h.agreements.sign(a, vid, { version: 2, nonce: "3", expiry: exp(), signature: p1sig }), "SIGNATURE_INVALID");
    await signAs(A, "4", 2);
    expect((await signAs(B, "4", 2)).complete).toBe(true);
  });

  it("superseded version never publishes its hash to ENS", async () => {
    h.agreements.createVersion(a, vid, terms());
    await signAs(A, "1", 1);
    await signAs(B, "1", 1); // queues ENS sync for v1
    h.agreements.createVersion(a, vid, terms("changed"));
    const before = h.ens.records.filter((r) => r.records.agreementHash).length;
    await h.agreements.syncAgreementRecord(vid, 1);
    expect(h.ens.records.filter((r) => r.records.agreementHash).length).toBe(before);
  });

  it("rejects: nonce reuse, expired, too-far expiry, double sign, wrong signer, unverified/outsider", async () => {
    h.agreements.createVersion(a, vid, terms());
    await signAs(A, "7", 1);
    await expectCode(signAs(A, "8", 1), "ALREADY_SIGNED");
    h.agreements.createVersion(a, vid, terms("v2 text"));
    await expectCode(signAs(A, "7", 2), "NONCE_REUSED");
    // expiry hints outside [now+60s, now+7d] are refused when the payload is built
    await expectCode(signAs(A, "9", 2, Math.floor(h.clock.now() / 1000) - 1), "BAD_REQUEST");
    await expectCode(signAs(A, "10", 2, Math.floor(h.clock.now() / 1000) + 8 * 24 * 3600), "BAD_REQUEST");
    // a payload that was valid when issued but expired before submission
    const pe = h.agreements.signingPayload(a, vid, { nonce: "12", expiry: Math.floor(h.clock.now() / 1000) + 120 });
    const sigE = await A.signTypedData(toTypedData(pe));
    h.clock.advance(121_000);
    await expectCode(h.agreements.sign(a, vid, { version: 2, nonce: "12", expiry: pe.expiry, signature: sigE }), "SIGNATURE_EXPIRED");
    // B's wallet session submits A's signature
    const p = h.agreements.signingPayload(a, vid, { nonce: "11", expiry: exp() });
    const sigA = await A.signTypedData(toTypedData(p));
    // nonce never issued to B → refused before any signature check
    await expectCode(h.agreements.sign(b, vid, { version: 2, nonce: "11", expiry: exp(), signature: sigA }), "NONCE_INVALID");
    // B fetches its own payload with the same nonce, then submits A's signature → wrong signer
    h.agreements.signingPayload(b, vid, { nonce: "11", expiry: exp() });
    await expectCode(h.agreements.sign(b, vid, { version: 2, nonce: "11", expiry: exp(), signature: sigA }), "SIGNATURE_INVALID");
    // expiry tampered after issue → NONCE_INVALID (server binds the issued expiry)
    await expectCode(h.agreements.sign(a, vid, { version: 2, nonce: "11", expiry: exp() + 5, signature: sigA }), "NONCE_INVALID");
    await expectCode(() => h.agreements.createVersion(lower(C.address), vid, terms()), "FORBIDDEN");
  });

  it("signing payload: server-picked nonce/expiry by default, JSON-safe, exact current version + docHash", async () => {
    const v1 = h.agreements.createVersion(a, vid, terms());
    const p = h.agreements.signingPayload(a, vid, {});
    const nowS = Math.floor(h.clock.now() / 1000);
    expect(p.expiry).toBe(nowS + 3600);
    expect(p.nonce).toMatch(/^[0-9]{1,78}$/);
    expect(p.message).toEqual({ ventureId: vid, agreementId: v1.agreementId, version: "1", docHash: v1.docHash, nonce: p.nonce, expiry: String(p.expiry) });
    expect(p.domain).toEqual({ name: "vestige", version: "1", chainId: 11155111 });
    expect(p.primaryType).toBe("FoundingTerms");
    expect(p.types.FoundingTerms.map((f) => `${f.type} ${f.name}`)).toEqual(["bytes32 ventureId", "bytes32 agreementId", "uint256 version", "bytes32 docHash", "uint256 nonce", "uint256 expiry"]);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p); // no bigint
    // signing a payload whose version was superseded before submit
    const sig = await A.signTypedData(toTypedData(p));
    h.agreements.createVersion(a, vid, terms("changed"));
    await expectCode(h.agreements.sign(a, vid, { version: 1, nonce: p.nonce, expiry: p.expiry, signature: sig }), "VERSION_SUPERSEDED");
    await expectCode(h.agreements.sign(a, vid, { version: 2, nonce: p.nonce, expiry: p.expiry, signature: sig }), "NONCE_INVALID");
    // malformed hints
    await expectCode(() => h.agreements.signingPayload(a, vid, { nonce: "-1" }), "BAD_REQUEST");
    await expectCode(() => h.agreements.signingPayload(a, vid, { nonce: (1n << 256n).toString() }), "BAD_REQUEST");
    await expectCode(() => h.agreements.signingPayload(a, vid, { expiry: "soon" }), "BAD_REQUEST");
    // a signed nonce can never be re-issued
    const q = h.agreements.signingPayload(a, vid, {});
    await h.agreements.sign(a, vid, { version: 2, nonce: q.nonce, expiry: q.expiry, signature: await A.signTypedData(toTypedData(q)) });
    await expectCode(() => h.agreements.signingPayload(a, vid, { nonce: q.nonce }), "NONCE_REUSED");
  });

  it("terms must cover exactly the verified founders and total 100%", async () => {
    const t = terms();
    await expectCode(() => h.agreements.createVersion(a, vid, { ...t, founders: [t.founders[0]] }), "AGREEMENT_INVALID");
    await expectCode(() => h.agreements.createVersion(a, vid, { ...t, founders: [t.founders[0], { ...t.founders[1], ownershipBps: 4000 }] }), "AGREEMENT_INVALID");
    await expectCode(() => h.agreements.createVersion(a, vid, { ...t, founders: [t.founders[0], { ...t.founders[1], wallet: C.address }] }), "AGREEMENT_INVALID");
    await expectCode(() => h.agreements.createVersion(a, vid, { ...t, effectiveDate: "06/11/2026" }), "AGREEMENT_INVALID");
    await expectCode(() => h.agreements.createVersion(a, vid, { ...t, founders: [t.founders[0], { ...t.founders[1], ownershipBps: 5000.5 }] }), "AGREEMENT_INVALID");
  });

  it("canonical JSON is wallet-order independent (same terms → same hash)", async () => {
    const v1 = h.agreements.createVersion(a, vid, terms());
    const t = terms();
    await expectCode(() => h.agreements.createVersion(a, vid, { ...t, founders: [t.founders[1], t.founders[0]] }), "AGREEMENT_INVALID"); // "No changes"
    expect(v1.canonicalJson).toContain('"schema":"vestige.founding-terms/1"');
  });
});
