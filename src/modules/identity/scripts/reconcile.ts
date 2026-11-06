/**
 * Restart reconciliation / resync for C1's durable chain-facing jobs (CONTRACTS v0:
 * "Pending ENS writes are durable jobs reconciled after restart").
 *
 * Default (no flags): READ-ONLY with respect to chains — re-confirms PENDING seat
 * attestations through X's port and promotes ENS steps only on independent
 * Universal Resolver read-back. Nothing is broadcast.
 * `retry: true` (operator decision): additionally re-runs ENS steps that FAILED
 * before any tx was recorded, re-sends mismatched idempotent records (humans,
 * agreement), and re-submits attestations that failed before a tx existed.
 * Steps with a recorded tx and no matching read-back are reported for manual review.
 */
import type { IdentityServices } from "../http";

export interface ReconcileReport {
  mode: "read-only" | "retry";
  at: string;
  attestationsChecked: number;
  ensVerifiedByReadback: number;
  agreementsVerifiedByReadback: string[];
  retried: string[];
  needsManualReview: string[];
  stillOpen: string[];
}

export async function reconcileIdentity(s: IdentityServices, opts: { retry?: boolean; now?: () => number } = {}): Promise<ReconcileReport> {
  const base = await s.ventures.reconcile();
  const agr = await s.agreements.reconcile({ retry: opts.retry });
  const retried = [...agr.retried];
  const needsManualReview: string[] = [];
  if (opts.retry) {
    const ens = await s.ventures.retryEns();
    retried.push(...ens.retried);
    needsManualReview.push(...ens.skipped);
    for (const r of s.db.all<{ venture_id: string; wallet: string }>(
      "SELECT venture_id, wallet FROM identity_seats WHERE world_status = 'VERIFIED' AND onchain_status = 'FAILED' AND attestation_tx_hash IS NULL",
    )) {
      await s.ventures.retryAttestation(r.venture_id as `0x${string}`, r.wallet as `0x${string}`);
      retried.push(`attestation:${r.venture_id}:${r.wallet}`);
    }
  }
  return {
    mode: opts.retry ? "retry" : "read-only",
    at: new Date((opts.now ?? Date.now)()).toISOString(),
    attestationsChecked: base.attestations,
    ensVerifiedByReadback: base.ensVerified,
    agreementsVerifiedByReadback: agr.verified,
    retried,
    needsManualReview,
    stillOpen: [...base.stillOpen, ...agr.stillOpen],
  };
}
