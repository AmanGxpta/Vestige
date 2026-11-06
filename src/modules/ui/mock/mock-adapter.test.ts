import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createMockAdapter } from "./mock-adapter";
import { currentSignatures, termsFullySigned } from "../progress";
import type { Address, AgreementFields } from "../types";

const A = "0xAaAa000000000000000000000000000000000001" as Address;
const A2 = "0xAaAa000000000000000000000000000000000005" as Address;
const B = "0xbBbB000000000000000000000000000000000002" as Address;
const F = "0xFfFF000000000000000000000000000000000003" as Address;
const PAYEE = "0xCcCC000000000000000000000000000000000004" as Address;
const sig = (signer: Address) => ({ signer, signature: `0x${"11".repeat(65)}` as `0x${string}` });
const FIELDS: AgreementFields = { contributions: "a", roles: "b", ownershipSplit: "50/50", vestingIntent: "4y", decisionRule: "both", effectiveDate: "2026-11-06" };

function must<T>(r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

async function setupTwoFounders() {
  const c = createMockAdapter({ latencyMs: 0 });
  const v = must(await c.createVenture({ displayName: "Northstar Labs", slug: "northstar", founderLabel: "asha", wallet: A }));
  must(await c.joinVenture(v.ventureId, { inviteCode: v.invite!.code, founderLabel: "ravi", wallet: B }));
  return { c, id: v.ventureId, invite: v.invite!.code };
}

describe("DEV MOCK adapter", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it("labels everything DEV_MOCK", async () => {
    const { c, id } = await setupTwoFounders();
    expect(must(await c.getVenture(id)).source).toBe("DEV_MOCK");
    expect(must(await c.getTreasury(id)).source).toBe("DEV_MOCK");
  });

  it("invite is single-use and slug collisions are refused", async () => {
    const { c, id, invite } = await setupTwoFounders();
    const again = await c.joinVenture(id, { inviteCode: invite, founderLabel: "eve", wallet: F });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("INVITE_INVALID");
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
    let v = must(await c.createAgreementVersion(id, { fields: FIELDS, wallet: A }));
    const v1 = v.agreement!;
    must(await c.signAgreement(id, { version: 1, docHash: v1.docHash, sig: sig(A) }));
    v = must(await c.signAgreement(id, { version: 1, docHash: v1.docHash, sig: sig(B) }));
    expect(termsFullySigned(v)).toBe(true);
    v = must(await c.createAgreementVersion(id, { fields: { ...FIELDS, ownershipSplit: "60/40" }, wallet: B }));
    expect(v.agreement!.version).toBe(2);
    expect(v.agreement!.docHash).not.toBe(v1.docHash);
    expect(currentSignatures(v)).toHaveLength(0);
    expect(termsFullySigned(v)).toBe(false);
    const stale = await c.signAgreement(id, { version: 1, docHash: v1.docHash, sig: sig(A) });
    expect(!stale.ok && stale.error.code).toBe("NOT_READY");
  });

  it("unverified founders cannot sign; non-founders cannot sign", async () => {
    const { c, id } = await setupTwoFounders();
    const v = must(await c.createAgreementVersion(id, { fields: FIELDS, wallet: A }));
    const r1 = await c.signAgreement(id, { version: 1, docHash: v.agreement!.docHash, sig: sig(A) });
    expect(!r1.ok && r1.error.code).toBe("NOT_VERIFIED");
    const r2 = await c.signAgreement(id, { version: 1, docHash: v.agreement!.docHash, sig: sig(F) });
    expect(!r2.ok && r2.error.code).toBe("NOT_A_FOUNDER");
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
    const notYet = await c.fundTreasury(id, { amountRaw: "1000000000", sig: sig(F) });
    expect(!notYet.ok && notYet.error.code).toBe("NOT_READY");
    vi.advanceTimersByTime(4000);
    t = must(await c.getTreasury(id));
    expect(t.treasury!.verificationStatus).toBe("VERIFIED");
    expect(t.treasury!.threshold).toBe(2);
    expect(t.treasury!.ownerAddresses).toEqual([A, B]);

    must(await c.fundTreasury(id, { amountRaw: "1000000000", sig: sig(F) }));
    vi.advanceTimersByTime(3000);
    t = must(await c.proposePayment(id, { recipient: PAYEE, amountRaw: "500000000", reason: "design", wallet: A }));
    const pid = t.payments[0].paymentId;
    must(await c.signPayment(id, pid, { sig: sig(A) }));
    const refused = await c.executePayment(id, pid, { wallet: A });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.code).toBe("RELAYER_REFUSED");
      expect(refused.error.message).toContain("GS020");
    }
    expect(must(await c.getTreasury(id)).payments[0].status).toBe("AWAITING_APPROVALS");
    const outsider = await c.signPayment(id, pid, { sig: sig(F) });
    expect(!outsider.ok && outsider.error.code).toBe("NOT_A_FOUNDER");
    t = must(await c.signPayment(id, pid, { sig: sig(B) }));
    expect(t.payments[0].status).toBe("READY");
    must(await c.executePayment(id, pid, { wallet: B }));
    vi.advanceTimersByTime(3000);
    t = must(await c.getTreasury(id));
    expect(t.payments[0].status).toBe("EXECUTED");
    expect(t.balanceRaw).toBe("500000000");
  });
});
