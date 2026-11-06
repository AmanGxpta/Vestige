import type { ReadStatus } from "@/src/modules/ui/types";
import { applicableManifest, type PublicChainReport } from "./chain-reader";

export type Check = {
  id: string;
  label: string;
  status: ReadStatus;
  detail: string;
  /**
   * "invariant": the chain itself violates the 2-human rule → NOT_ACTIVE.
   * "consistency": ENS / manifest / API / code hashes disagree or are missing → UNVERIFIED.
   */
  kind: "invariant" | "consistency" | "info";
};
export type TreasuryVerdict = {
  /** ACTIVE only when every required check is VERIFIED from independent reads (CONTRACTS v0). */
  state: "ACTIVE" | "UNVERIFIED" | "NOT_ACTIVE" | "UNRESOLVED";
  checks: Check[];
};

const eq = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function deriveTreasuryVerdict(r: PublicChainReport): TreasuryVerdict {
  const w = r.whitechain;
  const texts = r.ens.texts.value ?? {};
  const checks: Check[] = [];
  const add = (id: string, label: string, status: ReadStatus, detail: string, kind: Check["kind"] = "invariant") => checks.push({ id, label, status, detail, kind });
  const name = r.normalizedName ?? r.ensName;
  const m = applicableManifest(r.manifest, name);
  const ensVid = r.ens.ventureId.value;

  add("ens", "Name resolves on Ethereum Sepolia", r.ens.resolver.status, r.ens.resolver.note ?? `Resolver ${r.ens.resolver.value}`, "consistency");
  add(
    "link",
    "Name points to a Whitechain treasury",
    r.ens.treasury.status,
    r.ens.treasury.note ??
      (r.ens.treasury.value?.via === "TEXT_FALLBACK"
        ? "Via the vestige.treasury text record (fallback; ENSIP-11 address not set)"
        : "Via ENSIP-11 address record, coin type 2147485522"),
    "consistency",
  );

  if (!w) {
    add("safe", "Treasury is a Safe contract", "UNKNOWN", "Not read: the ENS step did not produce a treasury address.");
    // An unresolved name is not evidence of a broken treasury — it is absence of evidence.
    return { state: "UNRESOLVED", checks };
  }

  // ventureId: ENS is the source; the API value is only a cross-check (CR-C2-002).
  if (r.ens.ventureId.status !== "VERIFIED" || !ensVid) add("ventureId", "Name publishes its vestige ventureId", r.ens.ventureId.status, r.ens.ventureId.note ?? "Not read", "consistency");
  else if (r.apiVentureId && !eq(r.apiVentureId, ensVid))
    add("ventureId", "Name publishes its vestige ventureId", "FAILED", `ENS says ${ensVid.slice(0, 12)}…, the vestige API says ${r.apiVentureId.slice(0, 12)}… — they must match`, "consistency");
  else add("ventureId", "Name publishes its vestige ventureId", "VERIFIED", `vestige.ventureId ${ensVid.slice(0, 12)}…${r.apiVentureId ? " (matches the vestige API)" : ""}`, "consistency");

  // Reviewed manifest: required trust anchor for expected Guard/Registry/code hashes.
  const mf = r.manifest;
  if (mf.status === "NOT_CONFIGURED") add("manifest", "Matches the reviewed deployment manifest", "UNKNOWN", "No reviewed deployment manifest is configured, so the expected Guard and code cannot be confirmed.", "consistency");
  else if (mf.status === "UNREACHABLE") add("manifest", "Matches the reviewed deployment manifest", "UNKNOWN", `Manifest could not be loaded: ${mf.error}`, "consistency");
  else if (mf.status === "INVALID") add("manifest", "Matches the reviewed deployment manifest", "FAILED", `Manifest rejected: ${mf.problems.slice(0, 3).join("; ")}`, "consistency");
  else if (!m) add("manifest", "Matches the reviewed deployment manifest", "UNKNOWN", `The configured manifest is for ${mf.manifest.ensName}, not this name.`, "consistency");
  else {
    const issues: string[] = [];
    if (!eq(m.contracts.safe.address, r.ens.treasury.value?.address)) issues.push("Safe address differs from ENS");
    if (ensVid && !eq(m.ventureId, ensVid)) issues.push("ventureId differs from ENS");
    if (!eq(m.contracts.token.address, w.token.value?.address)) issues.push("token differs from the approved USDT");
    add(
      "manifest",
      "Matches the reviewed deployment manifest",
      issues.length ? "FAILED" : "VERIFIED",
      issues.length ? issues.join("; ") : `Manifest approved ${m.approvedAt.slice(0, 10)} · source ${m.sourceCommit.slice(0, 7)}`,
      "consistency",
    );
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

  // Guard: attached (invariant) and equal to the manifest + ENS record (consistency).
  const ensGuard = texts["vestige.guard"] ?? undefined;
  if (w.guard.status !== "VERIFIED") add("guard", "vestige Guard attached", w.guard.status, w.guard.note ?? "Unknown");
  else if (!m) add("guard", "vestige Guard attached", "UNKNOWN", `Guard ${w.guard.value} is attached, but there is no reviewed manifest to compare it with`, "consistency");
  else if (!eq(m.contracts.guard.address, w.guard.value) || (ensGuard && !eq(ensGuard, w.guard.value)))
    add("guard", "vestige Guard attached", "FAILED", `Attached Guard ${w.guard.value} does not match the ${!eq(m.contracts.guard.address, w.guard.value) ? "deployment manifest" : "ENS vestige.guard record"}`, "consistency");
  else add("guard", "vestige Guard attached", "VERIFIED", `Guard ${w.guard.value} matches the manifest${ensGuard ? " and the ENS record" : ""}`, "consistency");

  // Guard's immutable binding, read on-chain.
  const b = w.binding.value;
  if (w.binding.status !== "VERIFIED" || !b) add("binding", "Guard is bound to this Safe, registry and venture", w.binding.status, w.binding.note ?? "Not read", "consistency");
  else {
    const issues: string[] = [];
    if (!eq(b.safe, r.ens.treasury.value?.address)) issues.push("Guard.safe() is a different Safe");
    if (ensVid && !eq(b.ventureId, ensVid)) issues.push("Guard.ventureId() differs from ENS");
    if (m && !eq(b.registry, m.contracts.registry.address)) issues.push("Guard.registry() differs from the manifest");
    const unknown = !ensVid || !m;
    add(
      "binding",
      "Guard is bound to this Safe, registry and venture",
      issues.length ? "FAILED" : unknown ? "UNKNOWN" : "VERIFIED",
      issues.length ? issues.join("; ") : unknown ? "Read on-chain, but there is no ENS ventureId or manifest to compare with" : "Guard.safe(), registry() and ventureId() all match",
      "consistency",
    );
  }

  // Runtime code hashes vs the manifest (operator trust anchor, not a substitute for reads).
  const h = w.codeHashes.value;
  if (!m) add("codehash", "Contract code matches the reviewed build", "UNKNOWN", "No applicable manifest with runtime code hashes", "consistency");
  else if (w.codeHashes.status !== "VERIFIED" || !h) add("codehash", "Contract code matches the reviewed build", w.codeHashes.status, w.codeHashes.note ?? "Not read", "consistency");
  else {
    const bad = (["safe", "guard", "registry"] as const).filter((k) => !eq(h[k], m.contracts[k].runtimeCodeHash));
    add("codehash", "Contract code matches the reviewed build", bad.length ? "FAILED" : "VERIFIED", bad.length ? `Runtime code differs for: ${bad.join(", ")}` : "Safe, Guard and SeatRegistry runtime code hashes match", "consistency");
  }

  add("modules", "No Safe modules (they would bypass the Guard)", w.modules.status, w.modules.note ?? "No modules enabled");
  add("seats", "Every owner is a verified-human seat", w.seats.status, w.seats.note ?? "SeatRegistry.isSeat is true for both owners");

  const status = texts["vestige.status"];
  if (status !== undefined)
    add("status", "Labelled as a workspace, not a company", status === "workspace" ? "VERIFIED" : status ? "FAILED" : "UNKNOWN", status ? `vestige.status = "${status}"` : "vestige.status record not set", "info");

  const required = checks.filter((c) => c.kind !== "info");
  const invariantBroken = required.some((c) => c.kind === "invariant" && c.status === "FAILED");
  const state = invariantBroken ? "NOT_ACTIVE" : required.every((c) => c.status === "VERIFIED") ? "ACTIVE" : "UNVERIFIED";
  return { state, checks };
}
