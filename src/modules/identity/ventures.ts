/**
 * Venture + founder seat lifecycle (C1). The backend — never the client — decides
 * whether a human may take a seat. Chain-facing steps go through ports and are
 * only reported VERIFIED after receipt + read-back.
 */
import { randomBytes } from "node:crypto";
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { MAX_FOUNDER_SEATS } from "./config";
import { isUniqueViolation, type SqlDb } from "./db";
import { sha256, systemClock, type Clock } from "./auth";
import { fail, IdentityError } from "./errors";
import { assertVentureId, founderEnsName, newVentureId, toFounderLabel, toSlug, ventureEnsName, type Bytes32 } from "./ids";
import { checkAttestSubmit, checkSeatConfirmation, EnsAwaitingApproval, type EnsPort, type SeatAttestationPort, type TreasurySummaryPort } from "./ports";
import { buildWorldRequest, nullifierHash, verifyWorldProof, worldAction, type WorldConfig, type WorldRequestParams } from "./world";

/** Namespaced seat hash for demo overrides: can never collide with keccak256(abi.encode(uint256 nullifier)). */
export function demoOverrideHash(ventureId: Bytes32, wallet: Address): Bytes32 {
  return keccak256(stringToHex(`vestige.demo-override/1|${ventureId}|${wallet.toLowerCase()}`));
}

export type ReadStatus = "UNKNOWN" | "PENDING" | "VERIFIED" | "FAILED";
export type EvidenceLabel = "HUMAN_VERIFIED" | "SIGNED" | "CHAIN_VERIFIED" | "SELF_REPORTED";

/** CONTRACTS v0 `founderSeat` + `founderLabel`/`subnameStatus` (CR-ID-02). */
export interface FounderSeat {
  ventureId: Bytes32;
  wallet: Address;
  founderLabel: string;
  founderSubname: string;
  worldProofStatus: "PENDING" | "VERIFIED" | "FAILED";
  onchainSeatStatus: ReadStatus;
  subnameStatus: ReadStatus;
  attestationTxHash?: Hex;
  /** CR-C2-006 (C1-ACKed, H pending): World environment of the accepted proof. "staging" ⇒ TESTED_IN_SIMULATOR. */
  worldEnvironment?: "production" | "staging";
  /**
   * CR-ID-06 DEMO override: seat marked ready by an operator, NOT by World ID. The UI must
   * show "DEMO OVERRIDE — not World-verified"; never HUMAN_VERIFIED.
   */
  demoOverride?: true;
  /** What attestSeat writes as nullifierHash: the World digest, or the MOCK_ONLY demo-override hash. */
  attestationBasis?: "world-nullifier-digest" | "demo-override-hash";
}

/** CR-C2-001 public list item: non-PII, cached, with provenance. */
export interface VentureSummary {
  ventureId: Bytes32;
  displayName: string;
  ensName: string;
  humansVerified: number;
  termsSigned: boolean;
  /** null = unknown. Only ever joined from X's treasury read service, never invented by C1. */
  treasuryActive: boolean | null;
  funded: boolean | null;
  observedAt: string;
  source: string;
  /** ENS confirmation status of the venture name (receipt + Universal Resolver read-back). */
  verificationStatus: ReadStatus;
}

export interface VentureView {
  ventureId: Bytes32;
  slug: string;
  ensName: string;
  displayName: string;
  status: "workspace";
  ensStatus: ReadStatus;
  seats: FounderSeat[];
  humansVerified: number;
  maxSeats: number;
  /**
   * CR-C2-001; CR-C2-007 resolved to THIS shape (already consumed by C2 live-adapter @50e4cf4):
   * listed only while every current founder consents.
   */
  listing: { listed: boolean; consents: { wallet: Address; listed: boolean }[] };
}

interface VentureRow { venture_id: string; slug: string; ens_name: string; display_name: string; creator_wallet: string; status: string; ens_status: string }
interface SeatRow {
  venture_id: string; wallet: string; founder_label: string; world_status: string; onchain_status: string; subname_status: string;
  attestation_tx_hash: string | null;
}

export interface VentureDeps {
  db: SqlDb;
  world: WorldConfig | null;
  attester: SeatAttestationPort;
  ens: EnsPort;
  /** Optional X read seam for the public list (PROPOSED CR-ID-05); absent → treasury fields null. */
  treasury?: TreasurySummaryPort;
  clock?: Clock;
  fetchImpl?: typeof fetch;
  parentName?: string;
  /** Background task runner for chain work (tests pass an awaited collector). */
  defer?: (task: () => Promise<void>) => void;
}

const WORLD_REQUEST_TTL_MS = 5 * 60_000;

export class VentureService {
  private clock: Clock;
  private defer: (task: () => Promise<void>) => void;
  constructor(private d: VentureDeps) {
    this.clock = d.clock ?? systemClock;
    this.defer = d.defer ?? ((t) => void t().catch(() => undefined));
  }

  // ---------- reads ----------

  private ventureRow(ventureId: string): VentureRow {
    const v = this.d.db.get<VentureRow>("SELECT * FROM identity_ventures WHERE venture_id = ?", ventureId);
    if (!v) fail("NOT_FOUND", "Venture not found.");
    return v;
  }

  ventureIdBySlug(slug: string): Bytes32 {
    const v = this.d.db.get<{ venture_id: string }>("SELECT venture_id FROM identity_ventures WHERE slug = ?", slug);
    if (!v) fail("NOT_FOUND", "Venture not found.");
    return v.venture_id as Bytes32;
  }

  seat(ventureId: string, wallet: Address): SeatRow | undefined {
    return this.d.db.get<SeatRow>("SELECT * FROM identity_seats WHERE venture_id = ? AND wallet = ?", ventureId, wallet);
  }

  view(ventureIdInput: unknown): VentureView {
    const ventureId = assertVentureId(ventureIdInput);
    const v = this.ventureRow(ventureId);
    const envs = new Map(
      this.d.db
        .all<{ wallet: string; environment: string }>("SELECT wallet, environment FROM identity_world_nullifiers WHERE venture_id = ?", ventureId)
        .map((r) => [r.wallet, r.environment]),
    );
    const overrides = new Set(this.overriddenWallets(ventureId));
    const seats = this.d.db
      .all<SeatRow>("SELECT * FROM identity_seats WHERE venture_id = ? ORDER BY created_at, wallet", ventureId)
      .map((s): FounderSeat => ({
        ventureId: ventureId,
        wallet: s.wallet as Address,
        founderLabel: s.founder_label,
        founderSubname: founderEnsName(s.founder_label, v.slug, this.d.parentName),
        worldProofStatus: s.world_status as FounderSeat["worldProofStatus"],
        onchainSeatStatus: s.onchain_status as ReadStatus,
        subnameStatus: s.subname_status as ReadStatus,
        ...(s.attestation_tx_hash ? { attestationTxHash: s.attestation_tx_hash as Hex } : {}),
        ...(envs.get(s.wallet) === "staging" || envs.get(s.wallet) === "production" ? { worldEnvironment: envs.get(s.wallet) as "staging" | "production" } : {}),
        ...(overrides.has(s.wallet as Address) ? { demoOverride: true as const, attestationBasis: "demo-override-hash" as const } : envs.has(s.wallet) ? { attestationBasis: "world-nullifier-digest" as const } : {}),
      }));
    return {
      ventureId,
      slug: v.slug,
      ensName: v.ens_name,
      displayName: v.display_name,
      status: "workspace",
      ensStatus: v.ens_status as ReadStatus,
      seats,
      // Only real World ID proofs count as humans; demo overrides never do.
      humansVerified: seats.filter((s) => s.worldProofStatus === "VERIFIED" && !s.demoOverride).length,
      maxSeats: MAX_FOUNDER_SEATS,
      listing: this.listing(ventureId),
    };
  }

  // ---------- CR-C2-001 public-list consent ----------

  private listing(ventureId: Bytes32): VentureView["listing"] {
    const rows = this.d.db.all<{ wallet: string; listed: number | null }>(
      `SELECT s.wallet AS wallet, c.listed AS listed FROM identity_seats s
       LEFT JOIN identity_listing_consent c ON c.venture_id = s.venture_id AND c.wallet = s.wallet
       WHERE s.venture_id = ? ORDER BY s.created_at, s.wallet`,
      ventureId,
    );
    const consents = rows.map((r) => ({ wallet: r.wallet as Address, listed: r.listed === 1 }));
    return { listed: consents.length > 0 && consents.every((c) => c.listed), consents };
  }

  /** POST /api/identity/ventures/:id/listing { listed } — each founder sets only their own consent. */
  setListing(wallet: Address, ventureIdInput: unknown, input: { listed?: unknown }): VentureView["listing"] {
    const ventureId = assertVentureId(ventureIdInput);
    this.ventureRow(ventureId);
    this.requireSeat(ventureId, wallet);
    if (typeof input?.listed !== "boolean") fail("BAD_REQUEST", "listed must be true or false.");
    const now = this.clock.now();
    this.d.db.tx(() => {
      this.d.db.run(
        `INSERT INTO identity_listing_consent (venture_id, wallet, listed, updated_at) VALUES (?,?,?,?)
         ON CONFLICT (venture_id, wallet) DO UPDATE SET listed = excluded.listed, updated_at = excluded.updated_at`,
        ventureId, wallet, input.listed ? 1 : 0, now,
      );
      this.event({ ventureId, kind: input.listed ? "listing_consent_given" : "listing_consent_withdrawn", label: "SELF_REPORTED", status: "VERIFIED", actor: wallet, source: "vestige-api" });
    });
    return this.listing(ventureId);
  }

  /**
   * GET /api/identity/ventures — founder-consented ventures only, non-PII.
   * `termsSigned` comes from the caller (AgreementService) to avoid a module cycle.
   */
  async publicList(termsSigned: (ventureId: Bytes32) => boolean): Promise<VentureSummary[]> {
    const ids = this.d.db
      .all<{ venture_id: string }>(
        `SELECT v.venture_id FROM identity_ventures v
         WHERE NOT EXISTS (
           SELECT 1 FROM identity_seats s LEFT JOIN identity_listing_consent c ON c.venture_id = s.venture_id AND c.wallet = s.wallet
           WHERE s.venture_id = v.venture_id AND COALESCE(c.listed, 0) <> 1)
         AND EXISTS (SELECT 1 FROM identity_seats s WHERE s.venture_id = v.venture_id)
         ORDER BY v.created_at DESC LIMIT 200`,
      )
      .map((r) => r.venture_id as Bytes32);
    const out: VentureSummary[] = [];
    for (const id of ids) {
      const v = this.view(id);
      let t: Awaited<ReturnType<TreasurySummaryPort["summary"]>> | null = null;
      if (this.d.treasury) t = await this.d.treasury.summary(id).catch(() => null);
      out.push({
        ventureId: id,
        displayName: v.displayName,
        ensName: v.ensName,
        humansVerified: v.humansVerified,
        termsSigned: termsSigned(id),
        treasuryActive: t?.treasuryActive ?? null,
        funded: t?.funded ?? null,
        observedAt: new Date(this.clock.now()).toISOString(),
        source: t ? `vestige-api+${t.source}` : "vestige-api",
        verificationStatus: v.ensStatus,
      });
    }
    return out;
  }

  /** Founders-only view guard. */
  requireSeat(ventureId: Bytes32, wallet: Address): SeatRow {
    const s = this.seat(ventureId, wallet);
    if (!s) fail("FORBIDDEN", "Only this venture's founders can do that.");
    return s;
  }

  /**
   * Evidence source for SeatRegistry events. A demo-override seat is a real chain fact
   * (isSeat=true) built on a NON-World hash; the source says so in every event and API view.
   */
  attestationSource(ventureId: string, wallet: Address): string {
    return this.overriddenWallets(ventureId).includes(wallet)
      ? "seat-registry:demo-override-hash (MOCK_ONLY — not World ID)"
      : "seat-registry:world-nullifier-digest";
  }

  /** The exact bytes32 C1 passes to attestSeat for this seat (public digest, never the raw nullifier). */
  expectedSeatHash(ventureId: Bytes32, wallet: Address): { basis: "world-nullifier-digest" | "demo-override-hash"; seatHash: Bytes32 } | null {
    if (this.overriddenWallets(ventureId).includes(wallet)) return { basis: "demo-override-hash", seatHash: demoOverrideHash(ventureId, wallet) };
    const n = this.d.db.get<{ nullifier: string }>("SELECT nullifier FROM identity_world_nullifiers WHERE venture_id = ? AND wallet = ?", ventureId, wallet);
    return n ? { basis: "world-nullifier-digest", seatHash: nullifierHash(n.nullifier) } : null;
  }

  overriddenWallets(ventureId: string): Address[] {
    return this.d.db.all<{ wallet: string }>("SELECT wallet FROM identity_seat_overrides WHERE venture_id = ?", ventureId).map((r) => r.wallet as Address);
  }

  /** Seats backed by a real World ID proof (excludes demo overrides). Drives humansVerified / vestige.humans. */
  worldVerifiedFounders(ventureId: Bytes32): Address[] {
    return this.d.db
      .all<{ wallet: string }>(
        "SELECT s.wallet FROM identity_seats s JOIN identity_world_nullifiers n ON n.venture_id = s.venture_id AND n.wallet = s.wallet WHERE s.venture_id = ? AND s.world_status = 'VERIFIED' ORDER BY s.wallet",
        ventureId,
      )
      .map((r) => r.wallet as Address);
  }

  /** Founders who may act (sign terms, own the treasury): World-verified seats plus any demo override. */
  verifiedFounders(ventureId: Bytes32): Address[] {
    return this.d.db
      .all<{ wallet: string }>("SELECT wallet FROM identity_seats WHERE venture_id = ? AND world_status = 'VERIFIED' ORDER BY wallet", ventureId)
      .map((r) => r.wallet as Address);
  }

  event(e: { ventureId: string; kind: string; label: EvidenceLabel; status: ReadStatus; actor?: string; chainId?: number; txHash?: string; blockNumber?: bigint; confirmedAt?: number; source: string; detail?: string }) {
    this.d.db.run(
      `INSERT INTO identity_events (venture_id, kind, label, status, actor, chain_id, tx_hash, block_number, confirmed_at, source, detail, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      e.ventureId, e.kind, e.label, e.status, e.actor ?? null, e.chainId ?? null, e.txHash ?? null,
      e.blockNumber === undefined ? null : Number(e.blockNumber), e.confirmedAt ?? null, e.source, e.detail ?? null, this.clock.now(),
    );
  }

  // ---------- writes ----------

  /** POST /api/identity/ventures */
  create(wallet: Address, input: { name?: unknown; slug?: unknown; founderLabel?: unknown }): VentureView {
    if (typeof input?.name !== "string" || input.name.trim().length < 2 || input.name.length > 80) fail("BAD_REQUEST", "Venture name must be 2–80 characters.");
    const slug = toSlug(typeof input.slug === "string" && input.slug ? input.slug : input.name);
    const label = toFounderLabel(input.founderLabel as string);
    const ventureId = newVentureId();
    const ensName = ventureEnsName(slug, this.d.parentName);
    const now = this.clock.now();
    try {
      this.d.db.tx(() => {
        this.d.db.run(
          "INSERT INTO identity_ventures (venture_id, slug, ens_name, display_name, creator_wallet, created_at) VALUES (?,?,?,?,?,?)",
          ventureId, slug, ensName, input.name as string, wallet, now,
        );
        this.d.db.run("INSERT INTO identity_seats (venture_id, wallet, founder_label, created_at) VALUES (?,?,?,?)", ventureId, wallet, label, now);
        this.event({ ventureId, kind: "venture_created", label: "SELF_REPORTED", status: "VERIFIED", actor: wallet, source: "vestige-api" });
      });
    } catch (e) {
      if (isUniqueViolation(e)) fail("SLUG_TAKEN", "That venture name is taken. Choose another.");
      throw e;
    }
    this.defer(() => this.syncVentureName(ventureId));
    return this.view(ventureId);
  }

  /** Founder issues a single-use invite. Token is returned once and stored hashed. */
  createInvite(wallet: Address, ventureIdInput: unknown): { inviteToken: string } {
    const ventureId = assertVentureId(ventureIdInput);
    this.ventureRow(ventureId);
    this.requireSeat(ventureId, wallet);
    const count = this.d.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM identity_seats WHERE venture_id = ?", ventureId)!.n;
    if (count >= MAX_FOUNDER_SEATS) fail("VENTURE_FULL", "All founder seats are taken.");
    const token = randomBytes(24).toString("base64url");
    this.d.db.run("INSERT INTO identity_invites (token_hash, venture_id, created_by, created_at) VALUES (?,?,?,?)", sha256(token), ventureId, wallet, this.clock.now());
    return { inviteToken: token };
  }

  /** POST /api/identity/ventures/:id/join — consumes the invite atomically. */
  join(wallet: Address, ventureIdInput: unknown, input: { inviteToken?: unknown; founderLabel?: unknown }): VentureView {
    const ventureId = assertVentureId(ventureIdInput);
    if (typeof input?.inviteToken !== "string") fail("INVITE_INVALID", "Invite link is invalid.");
    const label = toFounderLabel(input.founderLabel as string);
    this.ventureRow(ventureId);
    const now = this.clock.now();
    try {
      this.d.db.tx(() => {
        if (this.seat(ventureId, wallet)) fail("ALREADY_SEATED", "This wallet already has a seat in this venture.");
        const count = this.d.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM identity_seats WHERE venture_id = ?", ventureId)!.n;
        if (count >= MAX_FOUNDER_SEATS) fail("VENTURE_FULL", "All founder seats are taken.");
        const used = this.d.db.run(
          "UPDATE identity_invites SET used_by = ?, used_at = ? WHERE token_hash = ? AND venture_id = ? AND used_at IS NULL",
          wallet, now, sha256(input.inviteToken as string), ventureId,
        );
        if (used.changes !== 1) fail("INVITE_INVALID", "Invite link is invalid or already used.");
        this.d.db.run("INSERT INTO identity_seats (venture_id, wallet, founder_label, created_at) VALUES (?,?,?,?)", ventureId, wallet, label, now);
        this.event({ ventureId, kind: "founder_joined", label: "SELF_REPORTED", status: "VERIFIED", actor: wallet, source: "vestige-api" });
      });
    } catch (e) {
      if (isUniqueViolation(e)) fail("LABEL_TAKEN", "That founder handle is taken in this venture.");
      throw e;
    }
    return this.view(ventureId);
  }

  private worldCfg(): WorldConfig {
    if (!this.d.world) fail("CONFIG_MISSING", "World ID is not configured on this server.");
    return this.d.world;
  }

  /** Issues RP-signed IDKit request params bound to (venture, wallet). PROPOSED endpoint (CR-ID-02). */
  worldRequest(wallet: Address, ventureIdInput: unknown): WorldRequestParams {
    const ventureId = assertVentureId(ventureIdInput);
    this.ventureRow(ventureId);
    const s = this.requireSeat(ventureId, wallet);
    if (s.world_status === "VERIFIED") fail("ALREADY_VERIFIED", "You are already verified for this venture.");
    const params = buildWorldRequest(this.worldCfg(), ventureId, wallet);
    const now = this.clock.now();
    this.d.db.run(
      "INSERT INTO identity_world_requests (nonce, venture_id, wallet, action, expires_at, created_at) VALUES (?,?,?,?,?,?)",
      params.rp_context.nonce, ventureId, wallet, params.action, now + WORLD_REQUEST_TTL_MS, now,
    );
    return params;
  }

  /**
   * POST /api/identity/ventures/:id/world/verify
   * Order: consume nonce → verify with World → atomically insert nullifier
   * (unique per venture = the duplicate-human gate) and mark seat verified →
   * submit on-chain attestation (PENDING until receipt + isSeat read-back).
   */
  async verifyWorld(wallet: Address, ventureIdInput: unknown, input: { idkitResult?: unknown }) {
    const ventureId = assertVentureId(ventureIdInput);
    const v = this.ventureRow(ventureId);
    const s = this.requireSeat(ventureId, wallet);
    if (s.world_status === "VERIFIED") fail("ALREADY_VERIFIED", "You are already verified for this venture.");
    const result = input?.idkitResult as { nonce?: unknown } | undefined;
    if (!result || typeof result.nonce !== "string") fail("WORLD_PROOF_INVALID", "Missing World ID result.");
    const now = this.clock.now();
    const req = this.d.db.get<{ venture_id: string; wallet: string; expires_at: number; used_at: number | null }>(
      "SELECT venture_id, wallet, expires_at, used_at FROM identity_world_requests WHERE nonce = ?",
      result.nonce,
    );
    if (!req || req.venture_id !== ventureId || req.wallet !== wallet || req.used_at !== null || req.expires_at <= now) {
      fail("WORLD_REQUEST_INVALID", "This verification request expired or was already used. Start again.");
    }
    const consumed = this.d.db.run("UPDATE identity_world_requests SET used_at = ? WHERE nonce = ? AND used_at IS NULL", now, result.nonce);
    if (consumed.changes !== 1) fail("WORLD_REQUEST_INVALID", "This verification request was already used.");

    const human = await verifyWorldProof({ cfg: this.worldCfg(), fetchImpl: this.d.fetchImpl, ventureId, wallet, expectedNonce: result.nonce, result });

    try {
      this.d.db.tx(() => {
        this.d.db.run(
          "INSERT INTO identity_world_nullifiers (venture_id, action, nullifier, wallet, protocol_version, environment, verified_at) VALUES (?,?,?,?,?,?,?)",
          ventureId, worldAction(ventureId), human.nullifier, wallet, human.protocolVersion, human.environment, now,
        );
        const upd = this.d.db.run(
          "UPDATE identity_seats SET world_status = 'VERIFIED', verified_at = ?, onchain_status = 'PENDING' WHERE venture_id = ? AND wallet = ? AND world_status <> 'VERIFIED'",
          now, ventureId, wallet,
        );
        if (upd.changes !== 1) fail("ALREADY_VERIFIED", "You are already verified for this venture.");
        this.event({ ventureId, kind: "founder_verified", label: "HUMAN_VERIFIED", status: "VERIFIED", actor: wallet, source: `world-id-${human.environment}-${human.protocolVersion}` });
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        this.event({ ventureId, kind: "duplicate_human_refused", label: "HUMAN_VERIFIED", status: "FAILED", actor: wallet, source: "world-id" });
        throw new IdentityError("DUPLICATE_HUMAN", `This human already holds a seat in ${v.display_name}.`);
      }
      throw e;
    }

    const attestation = await this.submitAttestation(ventureId, wallet, nullifierHash(human.nullifier));
    this.defer(() => this.syncFounderName(ventureId, wallet));
    this.defer(() => this.syncHumansRecord(ventureId));
    return { seat: this.view(ventureId).seats.find((x) => x.wallet === wallet)!, attestation };
  }

  private async submitAttestation(ventureId: Bytes32, wallet: Address, seatHash: Bytes32) {
    try {
      // CR-ID-04: only the keccak digest leaves C1; the raw nullifier never reaches X or the chain.
      const { txHash, chainId } = checkAttestSubmit(await this.d.attester.attestSeat({ ventureId, wallet, nullifierHash: seatHash }));
      this.d.db.run("UPDATE identity_seats SET attestation_tx_hash = ?, attestation_chain_id = ? WHERE venture_id = ? AND wallet = ?", txHash, chainId, ventureId, wallet);
      this.event({ ventureId, kind: "seat_attestation_submitted", label: "CHAIN_VERIFIED", status: "PENDING", actor: wallet, chainId, txHash, source: this.attestationSource(ventureId, wallet), detail: `seatHash ${seatHash}` });
      this.defer(() => this.refreshAttestation(ventureId, wallet).then(() => undefined));
      return { status: "PENDING" as ReadStatus, txHash };
    } catch (e) {
      // The human is verified off-chain; the on-chain seat is not. Never claim otherwise.
      this.d.db.run("UPDATE identity_seats SET onchain_status = 'FAILED' WHERE venture_id = ? AND wallet = ?", ventureId, wallet);
      this.event({ ventureId, kind: "seat_attestation_failed", label: "CHAIN_VERIFIED", status: "FAILED", actor: wallet, source: this.attestationSource(ventureId, wallet), detail: (e as Error).message.slice(0, 200) });
      return { status: "FAILED" as ReadStatus };
    }
  }

  /** Re-checks a PENDING attestation: VERIFIED only after receipt + isSeat read-back. */
  async refreshAttestation(ventureId: Bytes32, wallet: Address): Promise<ReadStatus> {
    const s = this.seat(ventureId, wallet);
    if (!s?.attestation_tx_hash || s.onchain_status !== "PENDING") return (s?.onchain_status as ReadStatus) ?? "UNKNOWN";
    let c;
    try {
      c = checkSeatConfirmation(await this.d.attester.confirm({ ventureId, wallet, txHash: s.attestation_tx_hash as Hex }));
    } catch {
      return "PENDING"; // transient read failure: stay PENDING, never promote
    }
    if (c.state === "PENDING") return "PENDING";
    if (c.state === "FAILED") {
      this.d.db.run("UPDATE identity_seats SET onchain_status = 'FAILED' WHERE venture_id = ? AND wallet = ?", ventureId, wallet);
      this.event({ ventureId, kind: "seat_attested", label: "CHAIN_VERIFIED", status: "FAILED", actor: wallet, txHash: s.attestation_tx_hash, source: this.attestationSource(ventureId, wallet), detail: c.reason });
      return "FAILED";
    }
    this.d.db.run(
      "UPDATE identity_seats SET onchain_status = 'VERIFIED', attestation_block = ?, attested_at = ? WHERE venture_id = ? AND wallet = ?",
      Number(c.blockNumber), c.confirmedAt, ventureId, wallet,
    );
    this.event({ ventureId, kind: "seat_attested", label: "CHAIN_VERIFIED", status: "VERIFIED", actor: wallet, chainId: c.chainId, txHash: s.attestation_tx_hash, blockNumber: c.blockNumber, confirmedAt: c.confirmedAt, source: this.attestationSource(ventureId, wallet) });
    return "VERIFIED";
  }

  /**
   * Re-submits an attestation that FAILED before any tx hash was recorded (e.g. X
   * was unconfigured). Never re-submits when a tx hash exists: that tx must be
   * reconciled via refreshAttestation first, to avoid double submission.
   */
  async retryAttestation(ventureId: Bytes32, wallet: Address): Promise<ReadStatus> {
    const s = this.seat(ventureId, wallet);
    if (!s || s.world_status !== "VERIFIED") fail("NOT_VERIFIED_FOUNDER", "Seat is not World-verified.");
    if (s.attestation_tx_hash) return this.refreshAttestation(ventureId, wallet);
    const n = this.d.db.get<{ nullifier: string }>("SELECT nullifier FROM identity_world_nullifiers WHERE venture_id = ? AND wallet = ?", ventureId, wallet);
    const isOverride = this.overriddenWallets(ventureId).includes(wallet);
    if (!n && !isOverride) fail("NOT_VERIFIED_FOUNDER", "Seat is not World-verified.");
    this.d.db.run("UPDATE identity_seats SET onchain_status = 'PENDING' WHERE venture_id = ? AND wallet = ?", ventureId, wallet);
    return (await this.submitAttestation(ventureId, wallet, n ? nullifierHash(n.nullifier) : demoOverrideHash(ventureId, wallet))).status;
  }

  /**
   * Durable-job reconciliation after restart (CONTRACTS: pending ENS writes are
   * durable jobs). Read-only first: a PENDING/FAILED ENS step is promoted to
   * VERIFIED only when the independent read-back already matches; nothing is
   * re-broadcast here. PENDING attestations are re-confirmed through X.
   */
  async reconcile(): Promise<{ attestations: number; ensVerified: number; stillOpen: string[] }> {
    let attestations = 0, ensVerified = 0;
    const stillOpen: string[] = [];
    for (const s of this.d.db.all<{ venture_id: string; wallet: string }>("SELECT venture_id, wallet FROM identity_seats WHERE onchain_status = 'PENDING'")) {
      attestations++;
      const st = await this.refreshAttestation(s.venture_id as Bytes32, s.wallet as Address);
      if (st !== "VERIFIED") stillOpen.push(`attestation:${s.venture_id}:${s.wallet}:${st}`);
    }
    for (const v of this.d.db.all<VentureRow>("SELECT * FROM identity_ventures WHERE ens_status IN ('PENDING','FAILED','UNKNOWN')")) {
      const ok = await (this.checks.ventureName?.(v.ens_name, v.venture_id as Bytes32) ?? Promise.resolve(false)).catch(() => false);
      if (ok) {
        ensVerified++;
        this.d.db.run("UPDATE identity_ventures SET ens_status = 'VERIFIED' WHERE venture_id = ?", v.venture_id);
        this.event({ ventureId: v.venture_id, kind: "ens_venture_registered", label: "CHAIN_VERIFIED", status: "VERIFIED", chainId: 11155111, source: "ens-sepolia-readback" });
      } else stillOpen.push(`ens-venture:${v.ens_name}:${v.ens_status}`);
    }
    for (const s of this.d.db.all<SeatRow & { slug: string }>(
      "SELECT s.*, v.slug AS slug FROM identity_seats s JOIN identity_ventures v USING (venture_id) WHERE s.world_status = 'VERIFIED' AND s.subname_status IN ('PENDING','FAILED','UNKNOWN') AND NOT EXISTS (SELECT 1 FROM identity_seat_overrides o WHERE o.venture_id = s.venture_id AND o.wallet = s.wallet)",
    )) {
      const name = founderEnsName(s.founder_label, s.slug, this.d.parentName);
      const ok = await (this.checks.founderName?.(name, s.wallet as Address) ?? Promise.resolve(false)).catch(() => false);
      if (ok) {
        ensVerified++;
        this.d.db.run("UPDATE identity_seats SET subname_status = 'VERIFIED' WHERE venture_id = ? AND wallet = ?", s.venture_id, s.wallet);
        this.event({ ventureId: s.venture_id, kind: "ens_founder_registered", label: "CHAIN_VERIFIED", status: "VERIFIED", chainId: 11155111, source: "ens-sepolia-readback" });
      } else stillOpen.push(`ens-founder:${name}:${s.subname_status}`);
    }
    // vestige.humans must equal the live verified count (derived, never from a request).
    for (const v of this.d.db.all<VentureRow>("SELECT * FROM identity_ventures WHERE ens_status = 'VERIFIED'")) {
      const n = this.worldVerifiedFounders(v.venture_id as Bytes32).length;
      const ok = await (this.checks.humans?.(v.ens_name, n) ?? Promise.resolve(false)).catch(() => false);
      if (!ok) stillOpen.push(`ens-humans:${v.ens_name}:expected=${n}`);
    }
    return { attestations, ensVerified, stillOpen };
  }

  /**
   * Explicit operator retry (never automatic): re-runs an ENS step only when its
   * read-back is still false AND no transaction was ever recorded for it, so a
   * step whose tx may have landed is never re-broadcast blindly. Humans records
   * are idempotent setText writes and are re-sent when the read-back mismatches.
   */
  async retryEns(): Promise<{ retried: string[]; skipped: string[] }> {
    const retried: string[] = [], skipped: string[] = [];
    const hadTx = (ventureId: string, kind: string, actor?: string) =>
      !!this.d.db.get(
        `SELECT 1 AS x FROM identity_events WHERE venture_id = ? AND kind = ? AND tx_hash IS NOT NULL ${actor ? "AND (actor = ? OR actor IS NULL)" : ""}`,
        ...(actor ? [ventureId, kind, actor] : [ventureId, kind]),
      );
    for (const v of this.d.db.all<VentureRow>("SELECT * FROM identity_ventures WHERE ens_status IN ('FAILED','UNKNOWN')")) {
      const ok = await (this.checks.ventureName?.(v.ens_name, v.venture_id as Bytes32) ?? Promise.resolve(false)).catch(() => false);
      if (ok) continue;
      if (hadTx(v.venture_id, "ens_venture_registered")) { skipped.push(`ens-venture:${v.ens_name}:tx-recorded-needs-manual-review`); continue; }
      await this.syncVentureName(v.venture_id as Bytes32);
      retried.push(`ens-venture:${v.ens_name}`);
    }
    for (const s of this.d.db.all<SeatRow & { slug: string }>(
      "SELECT s.*, v.slug AS slug FROM identity_seats s JOIN identity_ventures v USING (venture_id) WHERE v.ens_status = 'VERIFIED' AND s.world_status = 'VERIFIED' AND s.subname_status IN ('FAILED','UNKNOWN') AND NOT EXISTS (SELECT 1 FROM identity_seat_overrides o WHERE o.venture_id = s.venture_id AND o.wallet = s.wallet)",
    )) {
      const name = founderEnsName(s.founder_label, s.slug, this.d.parentName);
      const ok = await (this.checks.founderName?.(name, s.wallet as Address) ?? Promise.resolve(false)).catch(() => false);
      if (ok) continue;
      if (hadTx(s.venture_id, "ens_founder_registered", s.wallet)) { skipped.push(`ens-founder:${name}:tx-recorded-needs-manual-review`); continue; }
      await this.syncFounderName(s.venture_id as Bytes32, s.wallet as Address);
      retried.push(`ens-founder:${name}`);
    }
    for (const v of this.d.db.all<VentureRow>("SELECT * FROM identity_ventures WHERE ens_status = 'VERIFIED'")) {
      const n = this.worldVerifiedFounders(v.venture_id as Bytes32).length;
      const ok = await (this.checks.humans?.(v.ens_name, n) ?? Promise.resolve(false)).catch(() => false);
      if (ok) continue;
      await this.syncHumansRecord(v.venture_id as Bytes32);
      retried.push(`ens-humans:${v.ens_name}`);
    }
    return { retried, skipped };
  }

  /**
   * CR-ID-06 DEMO override (H-requested, time-boxed): an OPERATOR marks one PENDING seat ready
   * so the terms/treasury flow can be demonstrated while only one founder can produce a World
   * staging proof. Operator CLI only (no HTTP route). Refuses unless:
   *   - World is not production for this venture: every real proof in it is `staging`,
   *   - at least one OTHER seat holds a real World proof,
   *   - the target seat is PENDING and no override exists yet in this venture.
   * Effects: seat world_status=VERIFIED (so it can sign/own), override row + SELF_REPORTED event;
   * no World nullifier row, no ENS subname, not counted in humansVerified / vestige.humans.
   * The SeatRegistry attestation (if X is wired) uses demoOverrideHash, never a World digest.
   */
  async demoOverrideSeat(ventureIdInput: unknown, walletInput: unknown, a: { reason: string; operator: string }) {
    const ventureId = assertVentureId(ventureIdInput);
    const wallet = String(walletInput ?? "").toLowerCase() as Address;
    this.ventureRow(ventureId);
    const s = this.seat(ventureId, wallet);
    if (!s) fail("NOT_FOUND", "No seat for that wallet in this venture.");
    if (s.world_status === "VERIFIED") fail("ALREADY_VERIFIED", "Seat is already verified.");
    if (!a.reason?.trim() || !a.operator?.trim()) fail("BAD_REQUEST", "reason and operator are required.");
    const envs = this.d.db.all<{ environment: string; wallet: string }>("SELECT environment, wallet FROM identity_world_nullifiers WHERE venture_id = ?", ventureId);
    if (envs.length === 0) fail("FORBIDDEN", "Demo override needs one founder with a real World ID proof first.");
    if (envs.some((e) => e.environment !== "staging")) fail("FORBIDDEN", "Demo override is never allowed for a production World ID venture.");
    if (this.d.world && this.d.world.environment !== "staging") fail("FORBIDDEN", "Demo override is disabled when World is configured for production.");
    if (this.overriddenWallets(ventureId).length > 0) fail("FORBIDDEN", "This venture already has a demo override.");
    const now = this.clock.now();
    this.d.db.tx(() => {
      this.d.db.run("INSERT INTO identity_seat_overrides (venture_id, wallet, reason, operator, created_at) VALUES (?,?,?,?,?)", ventureId, wallet, a.reason.slice(0, 300), a.operator.slice(0, 80), now);
      const upd = this.d.db.run("UPDATE identity_seats SET world_status = 'VERIFIED', verified_at = ?, onchain_status = 'PENDING' WHERE venture_id = ? AND wallet = ? AND world_status = 'PENDING'", now, ventureId, wallet);
      if (upd.changes !== 1) fail("ALREADY_VERIFIED", "Seat changed while overriding.");
      this.event({ ventureId, kind: "founder_demo_override", label: "SELF_REPORTED", status: "VERIFIED", actor: wallet, source: "operator-demo-override (MOCK_ONLY, not World ID)", detail: a.reason.slice(0, 200) });
    });
    const attestation = await this.submitAttestation(ventureId, wallet, demoOverrideHash(ventureId, wallet));
    return { seat: this.view(ventureId).seats.find((x) => x.wallet === wallet)!, attestation };
  }

  // ---------- ENS sync (registrar-signed, never client-triggered values) ----------

  private async ensStep(ventureId: string, kind: string, run: () => Promise<{ txHashes: Hex[] }>, check: () => Promise<boolean>, onStatus: (s: ReadStatus) => void, actor?: Address) {
    onStatus("PENDING");
    try {
      const { txHashes } = await run();
      const c = await this.d.ens.confirm({ txHashes, check });
      if (c.state === "CONFIRMED") {
        onStatus("VERIFIED");
        this.event({ ventureId, kind, label: "CHAIN_VERIFIED", status: "VERIFIED", actor, chainId: c.chainId, txHash: txHashes.at(-1), blockNumber: c.blockNumber, confirmedAt: c.confirmedAt, source: "ens-sepolia" });
      } else {
        onStatus(c.state === "PENDING" ? "PENDING" : "FAILED");
        this.event({ ventureId, kind, label: "CHAIN_VERIFIED", status: c.state === "PENDING" ? "PENDING" : "FAILED", actor, txHash: txHashes.at(-1), source: "ens-sepolia", detail: c.state === "FAILED" ? c.reason : undefined });
      }
    } catch (e) {
      if (e instanceof EnsAwaitingApproval) {
        onStatus("PENDING");
        this.event({ ventureId, kind, label: "CHAIN_VERIFIED", status: "PENDING", actor, source: "ens-sepolia", detail: "awaiting H-approved ENS plan (no broadcast)" });
        return;
      }
      onStatus("FAILED");
      this.event({ ventureId, kind, label: "CHAIN_VERIFIED", status: "FAILED", actor, source: "ens-sepolia", detail: (e as Error).message.slice(0, 200) });
    }
  }

  /** Optional independent ENS read-back hooks (set by the container when an EnsReader exists). */
  checks: {
    /** Must confirm vestige.status=workspace AND vestige.ventureId === ventureId byte-for-byte. */
    ventureName?: (ensName: string, ventureId: Bytes32) => Promise<boolean>;
    founderName?: (name: string, wallet: Address) => Promise<boolean>;
    humans?: (ensName: string, n: number) => Promise<boolean>;
  } = {};

  async syncVentureName(ventureId: Bytes32) {
    const v = this.ventureRow(ventureId);
    await this.ensStep(
      ventureId, "ens_venture_registered",
      () => this.d.ens.registerVenture({ slug: v.slug, ventureId }),
      () => this.checks.ventureName?.(v.ens_name, ventureId) ?? Promise.resolve(false),
      (st) => this.d.db.run("UPDATE identity_ventures SET ens_status = ? WHERE venture_id = ?", st, ventureId),
    );
  }

  async syncFounderName(ventureId: Bytes32, wallet: Address) {
    const v = this.ventureRow(ventureId);
    const s = this.seat(ventureId, wallet);
    if (!s || s.world_status !== "VERIFIED") return; // subnames only for verified humans
    if (this.overriddenWallets(ventureId).includes(wallet)) return; // never mint a subname for a demo override
    const name = founderEnsName(s.founder_label, v.slug, this.d.parentName);
    await this.ensStep(
      ventureId, "ens_founder_registered",
      () => this.d.ens.registerFounder({ slug: v.slug, label: s.founder_label, wallet }),
      () => this.checks.founderName?.(name, wallet) ?? Promise.resolve(false),
      (st) => this.d.db.run("UPDATE identity_seats SET subname_status = ? WHERE venture_id = ? AND wallet = ?", st, ventureId, wallet),
      wallet,
    );
  }

  async syncHumansRecord(ventureId: Bytes32) {
    const v = this.ventureRow(ventureId);
    const n = this.worldVerifiedFounders(ventureId).length; // real World proofs only; never demo overrides
    await this.ensStep(
      ventureId, "ens_humans_record",
      () => this.d.ens.setVentureRecords({ slug: v.slug, records: { humans: n } }),
      () => this.checks.humans?.(v.ens_name, n) ?? Promise.resolve(false),
      () => undefined,
    );
  }
}
