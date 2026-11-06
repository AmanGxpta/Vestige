/**
 * Venture + founder seat lifecycle (C1). The backend — never the client — decides
 * whether a human may take a seat. Chain-facing steps go through ports and are
 * only reported VERIFIED after receipt + read-back.
 */
import { randomBytes } from "node:crypto";
import type { Address, Hex } from "viem";
import { MAX_FOUNDER_SEATS } from "./config";
import { isUniqueViolation, type SqlDb } from "./db";
import { sha256, systemClock, type Clock } from "./auth";
import { fail, IdentityError } from "./errors";
import { assertVentureId, founderEnsName, newVentureId, toFounderLabel, toSlug, ventureEnsName, type Bytes32 } from "./ids";
import type { EnsPort, SeatAttestationPort } from "./ports";
import { buildWorldRequest, nullifierToBytes32, verifyWorldProof, worldAction, type WorldConfig, type WorldRequestParams } from "./world";

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
      }));
    return {
      ventureId,
      slug: v.slug,
      ensName: v.ens_name,
      displayName: v.display_name,
      status: "workspace",
      ensStatus: v.ens_status as ReadStatus,
      seats,
      humansVerified: seats.filter((s) => s.worldProofStatus === "VERIFIED").length,
      maxSeats: MAX_FOUNDER_SEATS,
    };
  }

  /** Founders-only view guard. */
  requireSeat(ventureId: Bytes32, wallet: Address): SeatRow {
    const s = this.seat(ventureId, wallet);
    if (!s) fail("FORBIDDEN", "Only this venture's founders can do that.");
    return s;
  }

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

    const attestation = await this.submitAttestation(ventureId, wallet, human.nullifier);
    this.defer(() => this.syncFounderName(ventureId, wallet));
    this.defer(() => this.syncHumansRecord(ventureId));
    return { seat: this.view(ventureId).seats.find((x) => x.wallet === wallet)!, attestation };
  }

  private async submitAttestation(ventureId: Bytes32, wallet: Address, nullifier: string) {
    try {
      const { txHash, chainId } = await this.d.attester.attestSeat({ ventureId, wallet, nullifierHash: nullifierToBytes32(nullifier) });
      this.d.db.run("UPDATE identity_seats SET attestation_tx_hash = ?, attestation_chain_id = ? WHERE venture_id = ? AND wallet = ?", txHash, chainId, ventureId, wallet);
      this.event({ ventureId, kind: "seat_attestation_submitted", label: "CHAIN_VERIFIED", status: "PENDING", actor: wallet, chainId, txHash, source: "seat-registry" });
      this.defer(() => this.refreshAttestation(ventureId, wallet).then(() => undefined));
      return { status: "PENDING" as ReadStatus, txHash };
    } catch (e) {
      // The human is verified off-chain; the on-chain seat is not. Never claim otherwise.
      this.d.db.run("UPDATE identity_seats SET onchain_status = 'FAILED' WHERE venture_id = ? AND wallet = ?", ventureId, wallet);
      this.event({ ventureId, kind: "seat_attestation_failed", label: "CHAIN_VERIFIED", status: "FAILED", actor: wallet, source: "seat-registry", detail: (e as Error).message.slice(0, 200) });
      return { status: "FAILED" as ReadStatus };
    }
  }

  /** Re-checks a PENDING attestation: VERIFIED only after receipt + isSeat read-back. */
  async refreshAttestation(ventureId: Bytes32, wallet: Address): Promise<ReadStatus> {
    const s = this.seat(ventureId, wallet);
    if (!s?.attestation_tx_hash || s.onchain_status !== "PENDING") return (s?.onchain_status as ReadStatus) ?? "UNKNOWN";
    const c = await this.d.attester.confirm({ ventureId, wallet, txHash: s.attestation_tx_hash as Hex });
    if (c.state === "PENDING") return "PENDING";
    if (c.state === "FAILED") {
      this.d.db.run("UPDATE identity_seats SET onchain_status = 'FAILED' WHERE venture_id = ? AND wallet = ?", ventureId, wallet);
      this.event({ ventureId, kind: "seat_attested", label: "CHAIN_VERIFIED", status: "FAILED", actor: wallet, txHash: s.attestation_tx_hash, source: "seat-registry", detail: c.reason });
      return "FAILED";
    }
    this.d.db.run(
      "UPDATE identity_seats SET onchain_status = 'VERIFIED', attestation_block = ?, attested_at = ? WHERE venture_id = ? AND wallet = ?",
      Number(c.blockNumber), c.confirmedAt, ventureId, wallet,
    );
    this.event({ ventureId, kind: "seat_attested", label: "CHAIN_VERIFIED", status: "VERIFIED", actor: wallet, chainId: c.chainId, txHash: s.attestation_tx_hash, blockNumber: c.blockNumber, confirmedAt: c.confirmedAt, source: "seat-registry" });
    return "VERIFIED";
  }

  // ---------- ENS sync (registrar-signed, never client-triggered values) ----------

  private async ensStep(ventureId: string, kind: string, run: () => Promise<{ txHashes: Hex[] }>, check: () => Promise<boolean>, onStatus: (s: ReadStatus) => void) {
    onStatus("PENDING");
    try {
      const { txHashes } = await run();
      const c = await this.d.ens.confirm({ txHashes, check });
      if (c.state === "CONFIRMED") {
        onStatus("VERIFIED");
        this.event({ ventureId, kind, label: "CHAIN_VERIFIED", status: "VERIFIED", chainId: c.chainId, txHash: txHashes.at(-1), blockNumber: c.blockNumber, confirmedAt: c.confirmedAt, source: "ens-sepolia" });
      } else {
        onStatus(c.state === "PENDING" ? "PENDING" : "FAILED");
        this.event({ ventureId, kind, label: "CHAIN_VERIFIED", status: c.state === "PENDING" ? "PENDING" : "FAILED", txHash: txHashes.at(-1), source: "ens-sepolia", detail: c.state === "FAILED" ? c.reason : undefined });
      }
    } catch (e) {
      onStatus("FAILED");
      this.event({ ventureId, kind, label: "CHAIN_VERIFIED", status: "FAILED", source: "ens-sepolia", detail: (e as Error).message.slice(0, 200) });
    }
  }

  /** Optional independent ENS read-back hooks (set by the container when an EnsReader exists). */
  checks: {
    ventureName?: (ensName: string) => Promise<boolean>;
    founderName?: (name: string, wallet: Address) => Promise<boolean>;
    humans?: (ensName: string, n: number) => Promise<boolean>;
  } = {};

  async syncVentureName(ventureId: Bytes32) {
    const v = this.ventureRow(ventureId);
    await this.ensStep(
      ventureId, "ens_venture_registered",
      () => this.d.ens.registerVenture({ slug: v.slug }),
      () => this.checks.ventureName?.(v.ens_name) ?? Promise.resolve(false),
      (st) => this.d.db.run("UPDATE identity_ventures SET ens_status = ? WHERE venture_id = ?", st, ventureId),
    );
  }

  async syncFounderName(ventureId: Bytes32, wallet: Address) {
    const v = this.ventureRow(ventureId);
    const s = this.seat(ventureId, wallet);
    if (!s || s.world_status !== "VERIFIED") return; // subnames only for verified humans
    const name = founderEnsName(s.founder_label, v.slug, this.d.parentName);
    await this.ensStep(
      ventureId, "ens_founder_registered",
      () => this.d.ens.registerFounder({ slug: v.slug, label: s.founder_label, wallet }),
      () => this.checks.founderName?.(name, wallet) ?? Promise.resolve(false),
      (st) => this.d.db.run("UPDATE identity_seats SET subname_status = ? WHERE venture_id = ? AND wallet = ?", st, ventureId, wallet),
    );
  }

  async syncHumansRecord(ventureId: Bytes32) {
    const v = this.ventureRow(ventureId);
    const n = this.verifiedFounders(ventureId).length; // derived from live state, never from the request
    await this.ensStep(
      ventureId, "ens_humans_record",
      () => this.d.ens.setVentureRecords({ slug: v.slug, records: { humans: n } }),
      () => this.checks.humans?.(v.ens_name, n) ?? Promise.resolve(false),
      () => undefined,
    );
  }
}
