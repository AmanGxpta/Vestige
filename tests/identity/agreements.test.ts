/** Founding agreement versions + real EIP-712 signatures (viem, throwaway keys). */
import { beforeEach, describe, expect, it } from "vitest";
import type { PrivateKeyAccount } from "viem/accounts";
import { IdentityError } from "../../src/modules/identity/errors";
import { FakeHuman, lower, makeHarness, newWallet, type Harness } from "./helpers";

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
    const signature = await acct.signTypedData(p);
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
    const p1sig = await A.signTypedData({
      ...h.agreements.signingPayload(a, vid, { nonce: "3", expiry: exp() }),
      message: { ...h.agreements.signingPayload(a, vid, { nonce: "3", expiry: exp() }).message, version: 1n, docHash: v1.docHash },
    });
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
    await expectCode(signAs(A, "9", 2, Math.floor(h.clock.now() / 1000) - 1), "SIGNATURE_EXPIRED");
    await expectCode(signAs(A, "10", 2, Math.floor(h.clock.now() / 1000) + 8 * 24 * 3600), "BAD_REQUEST");
    // B's wallet session submits A's signature
    const p = h.agreements.signingPayload(a, vid, { nonce: "11", expiry: exp() });
    const sigA = await A.signTypedData(p);
    await expectCode(h.agreements.sign(b, vid, { version: 2, nonce: "11", expiry: exp(), signature: sigA }), "SIGNATURE_INVALID");
    await expectCode(() => h.agreements.createVersion(lower(C.address), vid, terms()), "FORBIDDEN");
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
