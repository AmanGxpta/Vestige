import type { Address, Treasury, TreasuryState, VentureDetail } from "./types";

export type StepState = "done" | "pending" | "todo" | "blocked";
export type VentureStep = { key: "team" | "verify" | "terms" | "treasury" | "payments"; title: string; sub: string; state: StepState };

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function seatFor(v: VentureDetail | undefined, wallet?: Address) {
  return v?.seats.find((s) => same(s.wallet, wallet));
}

/** CONTRACTS v0: ACTIVE only after complete independent chain read-back. */
export const isTreasuryActive = (tr?: Treasury) => tr?.verificationStatus === "ACTIVE";

export function treasuryStatusText(tr?: Treasury): string {
  if (!tr) return "Not set up";
  return { ACTIVE: "Active on Whitechain", PENDING: "Confirming on Whitechain", UNVERIFIED: "Unverified", FAILED: "Failed", UNKNOWN: "Unknown" }[tr.verificationStatus];
}

/** Signatures only count for the CURRENT version + docHash (FR-3: re-versioning invalidates). */
export function currentSignatures(v: VentureDetail | undefined) {
  const a = v?.agreement;
  if (!a) return [];
  return a.signatures.filter((s) => s.version === a.version && s.docHash === a.docHash);
}

/** Server is the authority (C1 AgreementView.complete: every verified founder signed this version). */
export function termsFullySigned(v: VentureDetail | undefined): boolean {
  return !!v?.agreement?.complete && v.seats.length >= 2;
}

export function verifiedSeats(v: VentureDetail | undefined) {
  return (v?.seats ?? []).filter((s) => s.worldProofStatus === "VERIFIED");
}

export function attestedSeats(v: VentureDetail | undefined) {
  return verifiedSeats(v).filter((s) => s.onchainSeatStatus === "VERIFIED");
}

export function ventureSteps(v: VentureDetail | undefined, t: TreasuryState | undefined): VentureStep[] {
  const seats = v?.seats.length ?? 0;
  const verified = verifiedSeats(v).length;
  const attested = attestedSeats(v).length;
  const tr = t?.treasury;
  const executed = (t?.payments ?? []).filter((p) => p.status === "EXECUTED").length;
  const awaiting = (t?.payments ?? []).filter((p) => p.status === "AWAITING_APPROVALS" || p.status === "READY").length;
  const sigs = currentSignatures(v).length;

  return [
    { key: "team", title: "Founders", sub: `${seats} of 2 seats taken`, state: seats >= 2 ? "done" : "todo" },
    {
      key: "verify",
      title: "Prove you're human",
      sub: `${verified} verified · ${attested} attested on-chain`,
      state: attested >= 2 ? "done" : verified > attested ? "pending" : "todo",
    },
    {
      key: "terms",
      title: "Founding terms",
      sub: v?.agreement ? `v${v.agreement.version} · ${sigs} of ${Math.max(seats, 2)} signed` : "Not drafted",
      state: termsFullySigned(v) ? "done" : "todo",
    },
    {
      key: "treasury",
      title: "Treasury",
      sub: treasuryStatusText(tr),
      state: isTreasuryActive(tr) ? "done" : tr ? "pending" : attested >= 2 ? "todo" : "blocked",
    },
    {
      key: "payments",
      title: "Payments",
      sub: executed ? `${executed} executed` : awaiting ? `${awaiting} awaiting` : "None yet",
      state: executed ? "done" : isTreasuryActive(tr) ? "todo" : "blocked",
    },
  ];
}

/** Anything still confirming → caller polls. */
export function hasPending(v?: VentureDetail, t?: TreasuryState): boolean {
  return (
    !!v?.seats.some((s) => s.onchainSeatStatus === "PENDING") ||
    t?.treasury?.verificationStatus === "PENDING" ||
    !!t?.deposits.some((d) => d.status === "PENDING") ||
    !!t?.payments.some((p) => (p.status === "READY" && p.executedTxHash) || p.relay?.status === "SUBMITTED" || p.relay?.status === "RESERVED")
  );
}
