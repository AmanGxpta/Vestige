import type { Address, TreasuryState, VentureDetail } from "./types";

export type StepState = "done" | "pending" | "todo" | "blocked";
export type VentureStep = { key: "team" | "verify" | "terms" | "treasury" | "payments"; title: string; sub: string; state: StepState };

const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function seatFor(v: VentureDetail | undefined, wallet?: Address) {
  return v?.seats.find((s) => same(s.wallet, wallet));
}

/** Signatures only count for the CURRENT version + docHash (FR-3: re-versioning invalidates). */
export function currentSignatures(v: VentureDetail | undefined) {
  const a = v?.agreement;
  if (!a) return [];
  return a.signatures.filter((s) => s.version === a.version && s.docHash === a.docHash);
}

export function termsFullySigned(v: VentureDetail | undefined): boolean {
  if (!v?.agreement || v.seats.length < 2) return false;
  const sigs = currentSignatures(v);
  return v.seats.every((seat) => sigs.some((s) => same(s.signer, seat.wallet)));
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
      sub: !tr ? "Not set up" : tr.verificationStatus === "VERIFIED" ? "Active on Whitechain" : tr.verificationStatus === "PENDING" ? "Confirming on Whitechain" : "Unverified",
      state: tr?.verificationStatus === "VERIFIED" ? "done" : tr ? "pending" : attested >= 2 ? "todo" : "blocked",
    },
    {
      key: "payments",
      title: "Payments",
      sub: executed ? `${executed} executed` : awaiting ? `${awaiting} awaiting` : "None yet",
      state: executed ? "done" : tr?.verificationStatus === "VERIFIED" ? "todo" : "blocked",
    },
  ];
}

/** Anything still confirming → caller polls. */
export function hasPending(v?: VentureDetail, t?: TreasuryState): boolean {
  return (
    !!v?.seats.some((s) => s.onchainSeatStatus === "PENDING") ||
    t?.treasury?.verificationStatus === "PENDING" ||
    !!t?.deposits.some((d) => d.status === "PENDING") ||
    !!t?.payments.some((p) => p.status === "READY" && p.executedTxHash)
  );
}
