/**
 * Agreement versions + EIP-712 signatures.
 * - A new version supersedes the old one; old signatures stay as history but are
 *   never counted toward the current version (signatures are bound to version + docHash).
 * - The server rebuilds the typed message from its own stored version; the client
 *   supplies only nonce/expiry/signature.
 */
import { randomBytes } from "node:crypto";
import { verifyTypedData, type Address, type Hex } from "viem";
import { systemClock, type Clock } from "../identity/auth";
import { isUniqueViolation, type SqlDb } from "../identity/db";
import { fail } from "../identity/errors";
import { assertVentureId, newBytes32, type Bytes32 } from "../identity/ids";
import type { EnsPort } from "../identity/ports";
import type { ReadStatus, VentureService } from "../identity/ventures";
import { canonicalize, docHash } from "./canonical";
import { buildTermsDoc, FOUNDING_TERMS_DOMAIN, FOUNDING_TERMS_TYPES, typedDataFor, type FoundingTermsMessage } from "./terms";

export type TypedDataVerifier = (a: { address: Address; message: FoundingTermsMessage; signature: Hex }) => Promise<boolean>;
export const eoaTypedDataVerifier: TypedDataVerifier = ({ address, message, signature }) =>
  verifyTypedData({ address, domain: FOUNDING_TERMS_DOMAIN, types: FOUNDING_TERMS_TYPES, primaryType: "FoundingTerms", message, signature });

export const MAX_SIGNATURE_TTL_S = 7 * 24 * 3600;
export const DEFAULT_SIGNATURE_TTL_S = 3600;
export const MIN_SIGNATURE_TTL_S = 60;
const UINT256_MAX = (1n << 256n) - 1n;

/** JSON-safe signing payload: uint256 fields are decimal strings (CONTRACTS JSON convention). */
export interface SigningPayload {
  domain: typeof FOUNDING_TERMS_DOMAIN;
  types: typeof FOUNDING_TERMS_TYPES;
  primaryType: "FoundingTerms";
  message: { ventureId: Bytes32; agreementId: Bytes32; version: string; docHash: Hex; nonce: string; expiry: string };
  version: number;
  docHash: Hex;
  nonce: string;
  expiry: number;
  expiresAt: string;
}

interface VersionRow {
  venture_id: string; agreement_id: string; version: number; canonical_json: string; doc_hash: string;
  created_by: string; created_at: number; superseded_at: number | null; ens_status: string;
}

/** CONTRACTS v0 `agreement` (canonicalJson only returned to founders). */
export interface AgreementView {
  ventureId: Bytes32;
  agreementId: Bytes32;
  version: number;
  docHash: Hex;
  canonicalJson?: string;
  signatures: { signer: Address; verifiedAt: string; label: "SIGNED" }[];
  requiredSigners: Address[];
  complete: boolean;
  ensStatus: ReadStatus;
}

function parseUint(v: unknown, field: string): string {
  const str = typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? String(v) : v;
  if (typeof str !== "string" || !/^[0-9]{1,78}$/.test(str) || BigInt(str) > UINT256_MAX) fail("BAD_REQUEST", `${field} must be a decimal uint256 string.`);
  return BigInt(str).toString(10);
}

export class AgreementService {
  private clock: Clock;
  constructor(
    private db: SqlDb,
    private ventures: VentureService,
    private ens: EnsPort,
    private opts: { clock?: Clock; verify?: TypedDataVerifier; defer?: (t: () => Promise<void>) => void; checkAgreementRecord?: (ensName: string, hash: Hex) => Promise<boolean> } = {},
  ) {
    this.clock = opts.clock ?? systemClock;
  }

  private current(ventureId: string): VersionRow | undefined {
    return this.db.get<VersionRow>("SELECT * FROM agreement_versions WHERE venture_id = ? AND superseded_at IS NULL", ventureId);
  }

  view(ventureIdInput: unknown, opts: { includeText: boolean }): AgreementView | null {
    const ventureId = assertVentureId(ventureIdInput);
    const cur = this.current(ventureId);
    if (!cur) return null;
    const required = this.ventures.verifiedFounders(ventureId);
    const sigs = this.db.all<{ signer: string; verified_at: number }>(
      "SELECT signer, verified_at FROM agreement_signatures WHERE venture_id = ? AND version = ? AND doc_hash = ? ORDER BY signer",
      ventureId, cur.version, cur.doc_hash,
    );
    const signed = new Set(sigs.map((s) => s.signer));
    return {
      ventureId,
      agreementId: cur.agreement_id as Bytes32,
      version: cur.version,
      docHash: cur.doc_hash as Hex,
      ...(opts.includeText ? { canonicalJson: cur.canonical_json } : {}),
      signatures: sigs.map((s) => ({ signer: s.signer as Address, verifiedAt: new Date(s.verified_at).toISOString(), label: "SIGNED" as const })),
      requiredSigners: required,
      complete: required.length >= 2 && required.every((w) => signed.has(w)),
      ensStatus: cur.ens_status as ReadStatus,
    };
  }

  /** Current version fully signed by every verified founder (public list `termsSigned`). */
  termsSigned(ventureId: Bytes32): boolean {
    return this.view(ventureId, { includeText: false })?.complete ?? false;
  }

  private requireVerifiedFounder(ventureId: Bytes32, wallet: Address) {
    const s = this.ventures.requireSeat(ventureId, wallet);
    if (s.world_status !== "VERIFIED") fail("NOT_VERIFIED_FOUNDER", "Verify with World ID before working on the agreement.");
  }

  /** POST /api/agreements/ventures/:id/versions — new version; previous signatures no longer count. */
  createVersion(wallet: Address, ventureIdInput: unknown, input: unknown): AgreementView {
    const ventureId = assertVentureId(ventureIdInput);
    this.requireVerifiedFounder(ventureId, wallet);
    const founders = this.ventures.verifiedFounders(ventureId);
    if (founders.length < 2) fail("AGREEMENT_INVALID", "Both founders must be verified before drafting terms.");
    const doc = buildTermsDoc(ventureId, founders, input);
    const json = canonicalize(doc);
    const hash = docHash(json);
    const now = this.clock.now();
    this.db.tx(() => {
      const cur = this.current(ventureId);
      if (cur && cur.doc_hash === hash) fail("AGREEMENT_INVALID", "No changes from the current version.");
      if (cur) this.db.run("UPDATE agreement_versions SET superseded_at = ? WHERE venture_id = ? AND version = ?", now, ventureId, cur.version);
      const agreementId = cur?.agreement_id ?? newBytes32();
      const version = (cur?.version ?? 0) + 1;
      this.db.run(
        "INSERT INTO agreement_versions (venture_id, agreement_id, version, canonical_json, doc_hash, created_by, created_at) VALUES (?,?,?,?,?,?,?)",
        ventureId, agreementId, version, json, hash, wallet, now,
      );
      this.ventures.event({ ventureId, kind: "agreement_version_created", label: "SELF_REPORTED", status: "VERIFIED", actor: wallet, source: "vestige-api", detail: `v${version} ${hash}` });
    });
    return this.view(ventureId, { includeText: true })!;
  }

  /**
   * GET /api/agreements/ventures/:id/sign?nonce=&expiry=
   * Server-constructed EIP-712 payload for the CURRENT version. nonce/expiry are
   * optional bounded hints: absent → server picks (random uint256, now+1h); a
   * hinted nonce must be unused by this signer; expiry must be now+60s … now+7d.
   * The nonce is recorded as issued to (signer, version, docHash); `sign` accepts
   * nothing else.
   */
  signingPayload(wallet: Address, ventureIdInput: unknown, input: { nonce?: unknown; expiry?: unknown }): SigningPayload {
    const ventureId = assertVentureId(ventureIdInput);
    this.requireVerifiedFounder(ventureId, wallet);
    const cur = this.current(ventureId);
    if (!cur) fail("NOT_FOUND", "No agreement drafted yet.");
    const nowS = Math.floor(this.clock.now() / 1000);
    const nonce = input.nonce === undefined || input.nonce === null || input.nonce === "" ? BigInt(`0x${randomBytes(32).toString("hex")}`).toString(10) : parseUint(input.nonce, "nonce");
    let expiry = nowS + DEFAULT_SIGNATURE_TTL_S;
    if (input.expiry !== undefined && input.expiry !== null && input.expiry !== "") {
      const e = Number(input.expiry);
      if (!Number.isSafeInteger(e)) fail("BAD_REQUEST", "expiry must be unix seconds.");
      if (e < nowS + MIN_SIGNATURE_TTL_S || e > nowS + MAX_SIGNATURE_TTL_S) fail("BAD_REQUEST", "expiry must be between 1 minute and 7 days from now.");
      expiry = e;
    }
    const used = this.db.get("SELECT 1 AS x FROM agreement_signatures WHERE signer = ? AND nonce = ?", wallet, nonce);
    if (used) fail("NONCE_REUSED", "This signature nonce was already used.");
    const issued = this.db.get<{ venture_id: string; version: number; doc_hash: string; used_at: number | null }>(
      "SELECT venture_id, version, doc_hash, used_at FROM agreement_sign_nonces WHERE signer = ? AND nonce = ?", wallet, nonce,
    );
    if (issued && (issued.used_at !== null || issued.venture_id !== ventureId || issued.version !== cur.version || issued.doc_hash !== cur.doc_hash)) {
      fail("NONCE_REUSED", "This signature nonce was already issued for other terms.");
    }
    if (issued) {
      this.db.run("UPDATE agreement_sign_nonces SET expiry = ? WHERE signer = ? AND nonce = ?", expiry, wallet, nonce);
    } else {
      this.db.run(
        "INSERT INTO agreement_sign_nonces (venture_id, signer, nonce, version, doc_hash, expiry, issued_at) VALUES (?,?,?,?,?,?,?)",
        ventureId, wallet, nonce, cur.version, cur.doc_hash, expiry, this.clock.now(),
      );
    }
    const m = this.message(cur, { nonce, expiry });
    const td = typedDataFor(m);
    return {
      domain: td.domain,
      types: td.types,
      primaryType: td.primaryType,
      message: { ventureId: m.ventureId, agreementId: m.agreementId, version: m.version.toString(), docHash: m.docHash, nonce: m.nonce.toString(), expiry: m.expiry.toString() },
      version: cur.version,
      docHash: cur.doc_hash as Hex,
      nonce,
      expiry,
      expiresAt: new Date(expiry * 1000).toISOString(),
    };
  }

  private message(cur: VersionRow, input: { nonce?: unknown; expiry?: unknown }): FoundingTermsMessage {
    if (typeof input.nonce !== "string" || !/^[0-9]{1,78}$/.test(input.nonce) || BigInt(input.nonce) > UINT256_MAX) fail("BAD_REQUEST", "nonce must be a decimal uint256 string.");
    if (typeof input.expiry !== "number" || !Number.isSafeInteger(input.expiry)) fail("BAD_REQUEST", "expiry must be unix seconds.");
    return {
      ventureId: cur.venture_id as Bytes32,
      agreementId: cur.agreement_id as Bytes32,
      version: BigInt(cur.version),
      docHash: cur.doc_hash as Hex,
      nonce: BigInt(input.nonce),
      expiry: BigInt(input.expiry),
    };
  }

  /** POST /api/agreements/ventures/:id/sign */
  async sign(wallet: Address, ventureIdInput: unknown, input: { version?: unknown; nonce?: unknown; expiry?: unknown; signature?: unknown }): Promise<AgreementView> {
    const ventureId = assertVentureId(ventureIdInput);
    this.requireVerifiedFounder(ventureId, wallet);
    const cur = this.current(ventureId);
    if (!cur) fail("NOT_FOUND", "No agreement drafted yet.");
    if (input.version !== cur.version) fail("VERSION_SUPERSEDED", `Terms changed. Review and sign version ${cur.version}.`);
    // EOA only (v0): exactly 65 bytes. ERC-1271/6492 are out of scope.
    if (typeof input.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(input.signature)) fail("SIGNATURE_INVALID", "Signature is missing or malformed.");
    const nonceStr = typeof input.nonce === "string" ? input.nonce : typeof input.nonce === "number" && Number.isSafeInteger(input.nonce) ? String(input.nonce) : input.nonce;
    const expiryNum = typeof input.expiry === "string" && /^[0-9]{1,15}$/.test(input.expiry) ? Number(input.expiry) : input.expiry;
    const msg = this.message(cur, { nonce: nonceStr, expiry: expiryNum });
    const nowS = Math.floor(this.clock.now() / 1000);
    if (msg.expiry <= BigInt(nowS)) fail("SIGNATURE_EXPIRED", "Signature expired. Sign again.");
    if (msg.expiry > BigInt(nowS + MAX_SIGNATURE_TTL_S)) fail("BAD_REQUEST", "Signature expiry is too far in the future.");
    const used = this.db.get("SELECT 1 AS x FROM agreement_signatures WHERE signer = ? AND nonce = ?", wallet, msg.nonce.toString());
    if (used) {
      const dupSigner = this.db.get("SELECT 1 AS x FROM agreement_signatures WHERE venture_id = ? AND version = ? AND signer = ?", ventureId, cur.version, wallet);
      if (dupSigner) fail("ALREADY_SIGNED", "You already signed this version.");
      fail("NONCE_REUSED", "This signature nonce was already used.");
    }
    const issued = this.db.get<{ venture_id: string; version: number; doc_hash: string; expiry: number; used_at: number | null }>(
      "SELECT venture_id, version, doc_hash, expiry, used_at FROM agreement_sign_nonces WHERE signer = ? AND nonce = ?", wallet, msg.nonce.toString(),
    );
    if (!issued || issued.used_at !== null || issued.venture_id !== ventureId || issued.version !== cur.version || issued.doc_hash !== cur.doc_hash || BigInt(issued.expiry) !== msg.expiry) {
      fail("NONCE_INVALID", "Fetch a fresh signing payload for the current terms and sign that.");
    }
    let ok = false;
    try {
      ok = await (this.opts.verify ?? eoaTypedDataVerifier)({ address: wallet, message: msg, signature: input.signature as Hex });
    } catch {
      ok = false;
    }
    if (!ok) fail("SIGNATURE_INVALID", "Signature does not match your wallet and these terms.");
    const now = this.clock.now();
    try {
      this.db.tx(() => {
        // Re-check inside the transaction: a concurrent new version must win.
        const still = this.current(ventureId);
        if (!still || still.version !== cur.version || still.doc_hash !== cur.doc_hash) fail("VERSION_SUPERSEDED", "Terms changed while signing. Sign the new version.");
        const burned = this.db.run("UPDATE agreement_sign_nonces SET used_at = ? WHERE signer = ? AND nonce = ? AND used_at IS NULL", now, wallet, msg.nonce.toString());
        if (burned.changes !== 1) fail("NONCE_REUSED", "This signature nonce was already used.");
        this.db.run(
          "INSERT INTO agreement_signatures (venture_id, version, agreement_id, doc_hash, signer, nonce, expiry, signature, verified_at) VALUES (?,?,?,?,?,?,?,?,?)",
          ventureId, cur.version, cur.agreement_id, cur.doc_hash, wallet, msg.nonce.toString(), Number(msg.expiry), input.signature as string, now,
        );
        this.ventures.event({ ventureId, kind: "agreement_signed", label: "SIGNED", status: "VERIFIED", actor: wallet, source: "eip712", detail: `v${cur.version}` });
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        const dupSigner = this.db.get("SELECT 1 AS x FROM agreement_signatures WHERE venture_id = ? AND version = ? AND signer = ?", ventureId, cur.version, wallet);
        if (dupSigner) fail("ALREADY_SIGNED", "You already signed this version.");
        fail("NONCE_REUSED", "This signature nonce was already used.");
      }
      throw e;
    }
    const v = this.view(ventureId, { includeText: false })!;
    if (v.complete) (this.opts.defer ?? ((t) => void t().catch(() => undefined)))(() => this.syncAgreementRecord(ventureId, cur.version));
    return v;
  }

  /** Writes the fully-signed docHash to `vestige.agreement`; VERIFIED only after receipt + read-back. */
  async syncAgreementRecord(ventureId: Bytes32, version: number) {
    const cur = this.current(ventureId);
    if (!cur || cur.version !== version) return; // superseded meanwhile: never publish stale hash
    const v = this.ventures.view(ventureId);
    const set = (s: ReadStatus) => this.db.run("UPDATE agreement_versions SET ens_status = ? WHERE venture_id = ? AND version = ?", s, ventureId, version);
    set("PENDING");
    try {
      const { txHashes } = await this.ens.setVentureRecords({ slug: v.slug, records: { agreementHash: cur.doc_hash as Hex } });
      const c = await this.ens.confirm({ txHashes, check: () => this.opts.checkAgreementRecord?.(v.ensName, cur.doc_hash as Hex) ?? Promise.resolve(false) });
      set(c.state === "CONFIRMED" ? "VERIFIED" : c.state === "PENDING" ? "PENDING" : "FAILED");
      this.ventures.event({
        ventureId, kind: "ens_agreement_record", label: "CHAIN_VERIFIED", status: c.state === "CONFIRMED" ? "VERIFIED" : c.state === "PENDING" ? "PENDING" : "FAILED",
        txHash: txHashes.at(-1), ...(c.state === "CONFIRMED" ? { chainId: c.chainId, blockNumber: c.blockNumber, confirmedAt: c.confirmedAt } : {}), source: "ens-sepolia",
      });
    } catch (e) {
      set("FAILED");
      this.ventures.event({ ventureId, kind: "ens_agreement_record", label: "CHAIN_VERIFIED", status: "FAILED", source: "ens-sepolia", detail: (e as Error).message.slice(0, 200) });
    }
  }
}
