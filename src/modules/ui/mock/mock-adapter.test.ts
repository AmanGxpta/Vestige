import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createMockAdapter } from "./mock-adapter";
import { currentSignatures, termsFullySigned } from "../progress";
import type { Address } from "../types";
import type { FoundingTermsInput } from "../agreement/terms";
import type { TypedDataSigner } from "../adapter";

const A = "0xAaAa000000000000000000000000000000000001" as Address;
const A2 = "0xAaAa000000000000000000000000000000000005" as Address;
const B = "0xbBbB000000000000000000000000000000000002" as Address;
const F = "0xFfFF000000000000000000000000000000000003" as Address;
const PAYEE = "0xCcCC000000000000000000000000000000000004" as Address;
/** Records every typed-data request so tests can assert the exact shapes signed. */
const signed: { primaryType: string; chainId?: number }[] = [];
const signOk: TypedDataSigner = async (td) => {
  signed.push({ primaryType: String(td.primaryType), chainId: td.domain && "chainId" in td.domain ? Number(td.domain.chainId) : undefined });
  return `0x${"11".repeat(65)}`;
};
const cancel: TypedDataSigner = async () => null;
const terms = (rule = "Both founders approve every payment."): FoundingTermsInput => ({
  effectiveDate: "2026-11-06",
  decisionRule: rule,
  founders: [
    { wallet: A, role: "CEO", contribution: "Product", ownershipBps: 5000, vestingIntent: "4y" },
    { wallet: B, role: "COO", contribution: "GTM", ownershipBps: 5000, vestingIntent: "4y" },
  ],
});

function must<T>(r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

async function setupTwoFounders() {
  const c = createMockAdapter({ latencyMs: 0 });
  const v = must(await c.createVenture({ displayName: "Northstar Labs", slug: "northstar", founderLabel: "asha", wallet: A }));
  const { inviteCode } = must(await c.createInvite(v.ventureId, { wallet: A }));
  must(await c.joinVenture(v.ventureId, { inviteCode, founderLabel: "ravi", wallet: B }));
  return { c, id: v.ventureId, invite: inviteCode };
}

describe("DEV MOCK adapter", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("labels everything DEV_MOCK", async () => {
    const { c, id } = await setupTwoFounders();
    expect(must(await c.getVenture(id)).source).toBe("DEV_MOCK");
    expect(must(await c.getTreasury(id)).source).toBe("DEV_MOCK");
  });

  it("invite is single-use, only founders can invite, a full venture refuses invites, slug collisions are refused", async () => {
    const { c, id, invite } = await setupTwoFounders();
    const again = await c.joinVenture(id, { inviteCode: invite, founderLabel: "eve", wallet: F });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("INVITE_INVALID");
    expect((await c.createInvite(id, { wallet: F })).ok).toBe(false);
    const full = await c.createInvite(id, { wallet: A });
    expect(!full.ok && full.error.code).toBe("NOT_READY");
    const dup = await c.createVenture({ displayName: "Other", slug: "northstar", founderLabel: "zed", wallet: F });
    expect(!dup.ok && dup.error.code).toBe("SLUG_TAKEN");
  });

  it("refuses the same human for a second seat and leaves the seat unverified", async () => {
    const { c, id } = await setupTwoFounders();
    must(await c.verifyWorld(id, { wallet: A, proof: { kind: "dev-mock", simulatedHumanId: "h1" } }));
    const r = await c.verifyWorld(id, { wallet: B, proof: { kind: "dev-mock", simulatedHumanId: "h1" } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("DUPLICATE_HUMAN");
      expect(r.error.message).toBe("This human already holds a seat in Northstar Labs.");
    }
    const v = must(await c.getVenture(id));
    expect(v.seats.find((s) => s.wallet === B)!.worldProofStatus).toBe("FAILED");
    expect(v.seats.find((s) => s.wallet === B)!.onchainSeatStatus).toBe("UNKNOWN");
    // a different human can then take it
    must(await c.verifyWorld(id, { wallet: B, proof: { kind: "dev-mock", simulatedHumanId: "h2" } }));
  });

  it("same human may found a different venture", async () => {
    const { c, id } = await setupTwoFounders();
    must(await c.verifyWorld(id, { wallet: A, proof: { kind: "dev-mock", simulatedHumanId: "h1" } }));
    const other = must(await c.createVenture({ displayName: "Other", slug: "otherco", founderLabel: "asha", wallet: A2 }));
    const r = await c.verifyWorld(other.ventureId, { wallet: A2, proof: { kind: "dev-mock", simulatedHumanId: "h1" } });
    expect(r.ok).toBe(true);
  });

  it("re-versioning terms invalidates earlier signatures", async () => {
    const { c, id } = await setupTwoFounders();
    must(await c.verifyWorld(id, { wallet: A, proof: { kind: "dev-mock", simulatedHumanId: "h1" } }));
    must(await c.verifyWorld(id, { wallet: B, proof: { kind: "dev-mock", simulatedHumanId: "h2" } }));
    let v = must(await c.createAgreementVersion(id, { terms: terms(), wallet: A }));
    const v1 = v.agreement!;
    expect(v1.canonicalJson).toContain('"schema":"vestige.founding-terms/1"');
    signed.length = 0;
    must(await c.signAgreement(id, { version: 1, docHash: v1.docHash, wallet: A }, signOk));
    expect(signed[0]).toEqual({ primaryType: "FoundingTerms", chainId: 11155111 });
    v = must(await c.signAgreement(id, { version: 1, docHash: v1.docHash, wallet: B }, signOk));
    expect(termsFullySigned(v)).toBe(true);
    v = must(await c.createAgreementVersion(id, { terms: terms("Unanimous."), wallet: B }));
    expect(v.agreement!.version).toBe(2);
    expect(v.agreement!.docHash).not.toBe(v1.docHash);
    expect(currentSignatures(v)).toHaveLength(0);
    expect(termsFullySigned(v)).toBe(false);
    const stale = await c.signAgreement(id, { version: 1, docHash: v1.docHash, wallet: A }, signOk);
    expect(!stale.ok && stale.error.code).toBe("VERSION_SUPERSEDED");
    const cancelled = await c.signAgreement(id, { version: 2, docHash: v.agreement!.docHash, wallet: A }, cancel);
    expect(!cancelled.ok && cancelled.error.code).toBe("CANCELLED");
    const same = await c.createAgreementVersion(id, { terms: terms("Unanimous."), wallet: A });
    expect(!same.ok && same.error.message).toMatch(/No changes/);
    const bad = await c.createAgreementVersion(id, { terms: { ...terms(), founders: [terms().founders[0], { ...terms().founders[1], ownershipBps: 4000 }] }, wallet: A });
    expect(!bad.ok && bad.error.code).toBe("INVALID_INPUT");
  });

  it("terms need both founders verified; non-founders cannot draft or sign", async () => {
    const { c, id } = await setupTwoFounders();
    const r0 = await c.createAgreementVersion(id, { terms: terms(), wallet: A });
    expect(!r0.ok && r0.error.code).toBe("NOT_VERIFIED");
    must(await c.verifyWorld(id, { wallet: A, proof: { kind: "dev-mock", simulatedHumanId: "h1" } }));
    const r1 = await c.createAgreementVersion(id, { terms: terms(), wallet: A });
    expect(!r1.ok && r1.error.code).toBe("NOT_READY");
    must(await c.verifyWorld(id, { wallet: B, proof: { kind: "dev-mock", simulatedHumanId: "h2" } }));
    const v = must(await c.createAgreementVersion(id, { terms: terms(), wallet: A }));
    const r2 = await c.signAgreement(id, { version: 1, docHash: v.agreement!.docHash, wallet: F }, signOk);
    expect(!r2.ok && r2.error.code).toBe("NOT_A_FOUNDER");
  });

  it("public listing needs every founder's consent and any founder can withdraw", async () => {
    const { c, id } = await setupTwoFounders();
    expect(must(await c.listVentures())).toHaveLength(0);
    let v = must(await c.setListing(id, { listed: true, wallet: A }));
    expect(v.listing).toEqual({ listed: false, consents: [{ wallet: A, listed: true }, { wallet: B, listed: false }] });
    expect(must(await c.listVentures())).toHaveLength(0);
    v = must(await c.setListing(id, { listed: true, wallet: B }));
    expect(v.listing!.listed).toBe(true);
    const list = must(await c.listVentures());
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(["displayName", "ensName", "funded", "humansVerified", "observedAt", "source", "termsSigned", "treasuryActive", "ventureId", "verificationStatus"]);
    must(await c.setListing(id, { listed: false, wallet: B }));
    expect(must(await c.listVentures())).toHaveLength(0);
    expect((await c.setListing(id, { listed: true, wallet: F })).ok).toBe(false);
  });

  it("treasury: requires two attested seats, becomes VERIFIED only after confirmation, relayer refuses 1-of-2", async () => {
    const { c, id } = await setupTwoFounders();
    const early = await c.deployTreasury(id, { wallet: A });
    expect(!early.ok && early.error.code).toBe("NOT_READY");
    must(await c.verifyWorld(id, { wallet: A, proof: { kind: "dev-mock", simulatedHumanId: "h1" } }));
    must(await c.verifyWorld(id, { wallet: B, proof: { kind: "dev-mock", simulatedHumanId: "h2" } }));
    const pendingSeat = await c.deployTreasury(id, { wallet: A });
    expect(!pendingSeat.ok && pendingSeat.error.code).toBe("NOT_READY"); // attestation still PENDING
    vi.advanceTimersByTime(3000);
    let t = must(await c.deployTreasury(id, { wallet: A }));
    expect(t.treasury!.verificationStatus).toBe("PENDING");
    const notYet = await c.fundTreasury(id, { from: F, to: t.treasury!.safeAddress, amountRaw: "1000000000" }, signOk);
    expect(!notYet.ok && notYet.error.code).toBe("NOT_READY");
    vi.advanceTimersByTime(4000);
    t = must(await c.getTreasury(id));
    expect(t.treasury!.verificationStatus).toBe("ACTIVE");
    expect(t.treasury!.threshold).toBe(2);
    expect(t.treasury!.ownerAddresses).toEqual([A, B]);

    const wrongTo = await c.fundTreasury(id, { from: F, to: PAYEE, amountRaw: "1000000000" }, signOk);
    expect(!wrongTo.ok && wrongTo.error.code).toBe("INVALID_INPUT");
    signed.length = 0;
    must(await c.fundTreasury(id, { from: F, to: t.treasury!.safeAddress, amountRaw: "1000000000" }, signOk));
    expect(signed[0]).toEqual({ primaryType: "TransferWithAuthorization", chainId: 1874 });
    vi.advanceTimersByTime(3000);
    t = must(await c.proposePayment(id, { recipient: PAYEE, amountRaw: "500000000", reason: "design", wallet: A }));
    const pid = t.payments[0].paymentId;
    must(await c.signPayment(id, pid, { wallet: A }, signOk));
    expect(signed.at(-1)).toEqual({ primaryType: "SafeTx", chainId: 1874 });
    const refused = await c.executePayment(id, pid, { wallet: A });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("RELAYER_REFUSED");
      expect(refused.error.message).toContain("GS020");
    }
    expect(must(await c.getTreasury(id)).payments[0].status).toBe("AWAITING_APPROVALS");
    const outsider = await c.signPayment(id, pid, { wallet: F }, signOk);
    expect(!outsider.ok && outsider.error.code).toBe("NOT_A_FOUNDER");
    t = must(await c.signPayment(id, pid, { wallet: B }, signOk));
    expect(t.payments[0].status).toBe("READY");
    must(await c.executePayment(id, pid, { wallet: B }));
    vi.advanceTimersByTime(3000);
    t = must(await c.getTreasury(id));
    expect(t.payments[0].status).toBe("EXECUTED");
    expect(t.balanceRaw).toBe("500000000");
  });
});
