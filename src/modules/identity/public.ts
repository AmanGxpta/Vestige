/**
 * GET /api/identity/public/:ensName — OFF-CHAIN evidence only (World + signatures).
 * Never includes: agreement text, nullifiers (full or partial), invite data, emails, names.
 * Treasury facts are NOT served here; C2 reads them from ENS + Whitechain directly.
 */
import type { Address, Hex } from "viem";
import type { AgreementService } from "../agreements/service";
import type { SqlDb } from "./db";
import { slugFromEnsName } from "./ids";
import type { EvidenceLabel, ReadStatus, VentureService } from "./ventures";

export interface PublicIdentitySummary {
  ensName: string;
  ventureId: Hex;
  status: "workspace";
  legalNotice: "Workspace — not legally incorporated";
  founders: {
    subname: string;
    wallet: Address;
    humanVerified: boolean;
    label: "HUMAN_VERIFIED" | "SELF_REPORTED";
    onchainSeatStatus: ReadStatus;
    attestationTxHash?: Hex;
    subnameStatus: ReadStatus;
    /** CR-C2-006: present once World-verified. "staging" ⇒ the UI must show TESTED_IN_SIMULATOR. */
    worldEnvironment?: "production" | "staging";
  }[];
  humansVerified: number;
  agreement: null | {
    version: number;
    docHash: Hex;
    signedBy: Address[];
    requiredSigners: number;
    complete: boolean;
    label: "SIGNED";
    ensRecordStatus: ReadStatus;
  };
  events: { kind: string; label: EvidenceLabel; status: ReadStatus; source: string; chainId?: number; txHash?: Hex; blockNumber?: number; at: string }[];
  source: "vestige-api (off-chain evidence; verify chain facts independently)";
}

const PUBLIC_EVENT_KINDS = new Set([
  "venture_created", "founder_joined", "founder_verified", "duplicate_human_refused", "seat_attestation_submitted", "seat_attested",
  "agreement_version_created", "agreement_signed", "ens_venture_registered", "ens_founder_registered", "ens_humans_record", "ens_agreement_record",
]);

export function publicSummary(db: SqlDb, ventures: VentureService, agreements: AgreementService, ensNameInput: unknown, parentName?: string): PublicIdentitySummary {
  const slug = slugFromEnsName(String(ensNameInput ?? ""), parentName);
  const ventureId = ventures.ventureIdBySlug(slug);
  const v = ventures.view(ventureId);
  const a = agreements.view(ventureId, { includeText: false });
  const events = db
    .all<{ kind: string; label: string; status: string; source: string; chain_id: number | null; tx_hash: string | null; block_number: number | null; created_at: number }>(
      "SELECT kind, label, status, source, chain_id, tx_hash, block_number, created_at FROM identity_events WHERE venture_id = ? ORDER BY id",
      ventureId,
    )
    .filter((e) => PUBLIC_EVENT_KINDS.has(e.kind))
    .map((e) => ({
      kind: e.kind,
      label: e.label as EvidenceLabel,
      status: e.status as ReadStatus,
      source: e.source,
      ...(e.chain_id !== null ? { chainId: e.chain_id } : {}),
      ...(e.tx_hash ? { txHash: e.tx_hash as Hex } : {}),
      ...(e.block_number !== null ? { blockNumber: e.block_number } : {}),
      at: new Date(e.created_at).toISOString(),
    }));
  return {
    ensName: v.ensName,
    ventureId,
    status: "workspace",
    legalNotice: "Workspace — not legally incorporated",
    founders: v.seats.map((s) => ({
      subname: s.founderSubname,
      wallet: s.wallet,
      humanVerified: s.worldProofStatus === "VERIFIED",
      label: s.worldProofStatus === "VERIFIED" ? "HUMAN_VERIFIED" : "SELF_REPORTED",
      onchainSeatStatus: s.onchainSeatStatus,
      ...(s.attestationTxHash ? { attestationTxHash: s.attestationTxHash } : {}),
      subnameStatus: s.subnameStatus,
      ...(s.worldEnvironment ? { worldEnvironment: s.worldEnvironment } : {}),
    })),
    humansVerified: v.humansVerified,
    agreement: a
      ? { version: a.version, docHash: a.docHash, signedBy: a.signatures.map((s) => s.signer), requiredSigners: a.requiredSigners.length, complete: a.complete, label: "SIGNED", ensRecordStatus: a.ensStatus }
      : null,
    events,
    source: "vestige-api (off-chain evidence; verify chain facts independently)",
  };
}
