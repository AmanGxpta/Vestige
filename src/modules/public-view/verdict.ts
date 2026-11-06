import type { Address, ReadStatus } from "@/src/modules/ui/types";
import type { PublicChainReport } from "./chain-reader";

export type Check = { id: string; label: string; status: ReadStatus; detail: string };
export type TreasuryVerdict = {
  /** ACTIVE only when every required check is VERIFIED from chain reads (MASTER §3). */
  state: "ACTIVE" | "UNVERIFIED" | "NOT_ACTIVE" | "UNRESOLVED";
  checks: Check[];
};

const eq = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function deriveTreasuryVerdict(r: PublicChainReport, opts: { expectedGuard?: Address } = {}): TreasuryVerdict {
  const w = r.whitechain;
  const texts = r.ens.texts.value ?? {};
  const checks: Check[] = [];
  const add = (id: string, label: string, status: ReadStatus, detail: string) => checks.push({ id, label, status, detail });

  add("ens", "Name resolves on Ethereum Sepolia", r.ens.resolver.status, r.ens.resolver.note ?? `Resolver ${r.ens.resolver.value}`);
  add(
    "link",
    "Name points to a Whitechain treasury",
    r.ens.treasury.status,
    r.ens.treasury.note ??
      (r.ens.treasury.value?.via === "TEXT_FALLBACK"
        ? "Via the vestige.treasury text record (fallback; ENSIP-11 address not set)"
        : "Via ENSIP-11 address record, coin type 2147485522"),
  );

  if (!w) {
    add("safe", "Treasury is a Safe contract", "UNKNOWN", "Not read: the ENS step did not produce a treasury address.");
    // An unresolved name is not evidence of a broken treasury — it is absence of evidence.
    return { state: "UNRESOLVED", checks };
  }

  add("safe", "Treasury is a Safe contract", w.safeCode.status, w.safeCode.note ?? `Safe ${w.version.value ?? ""}`.trim());

  const owners = w.owners.value;
  if (w.owners.status !== "VERIFIED" || !owners) add("owners", "Exactly two owners", w.owners.status, w.owners.note ?? "Owners unknown");
  else {
    const distinct = new Set(owners.map((o) => o.toLowerCase())).size;
    add("owners", "Exactly two owners", distinct === 2 && owners.length === 2 ? "VERIFIED" : "FAILED", `${owners.length} owner(s) on chain`);
  }

  if (w.threshold.status !== "VERIFIED") add("threshold", "Both owners must sign (threshold 2)", w.threshold.status, w.threshold.note ?? "Unknown");
  else add("threshold", "Both owners must sign (threshold 2)", w.threshold.value === 2 ? "VERIFIED" : "FAILED", `Threshold is ${w.threshold.value}`);

  const ensGuard = texts["vestige.guard"] ?? undefined;
  if (w.guard.status !== "VERIFIED") add("guard", "vestige Guard attached", w.guard.status, w.guard.note ?? "Unknown");
  else {
    const expected = [ensGuard, opts.expectedGuard].filter(Boolean) as string[];
    if (!expected.length) add("guard", "vestige Guard attached", "UNKNOWN", `Guard ${w.guard.value} is attached, but there is no expected Guard to compare against`);
    else if (expected.every((g) => eq(g, w.guard.value)))
      add("guard", "vestige Guard attached", "VERIFIED", `Guard ${w.guard.value} matches ${opts.expectedGuard ? "the deployment manifest" : "the ENS record"}`);
    else add("guard", "vestige Guard attached", "FAILED", `Attached Guard ${w.guard.value} does not match the expected vestige Guard`);
  }

  add("modules", "No Safe modules (they would bypass the Guard)", w.modules.status, w.modules.note ?? "No modules enabled");
  add("seats", "Every owner is a verified-human seat", w.seats.status, w.seats.note ?? "SeatRegistry.isSeat is true for both owners");

  const status = texts["vestige.status"];
  if (status !== undefined)
    add(
      "status",
      "Labelled as a workspace, not a company",
      status === "workspace" ? "VERIFIED" : status ? "FAILED" : "UNKNOWN",
      status ? `vestige.status = "${status}"` : "vestige.status record not set",
    );

  const required = checks.filter((c) => c.id !== "status");
  const state = required.every((c) => c.status === "VERIFIED") ? "ACTIVE" : required.some((c) => c.status === "FAILED") ? "NOT_ACTIVE" : "UNVERIFIED";
  return { state, checks };
}
