/**
 * Wallet authentication: single-use EIP-4361-style challenge → bearer session.
 * PROPOSED shape (CONTRACTS "Wallet authentication" is H-owned). Bearer tokens in
 * the Authorization header are not sent automatically by browsers, so CSRF does
 * not apply; tokens are stored only as SHA-256 hashes.
 */
import { createHash, randomBytes } from "node:crypto";
import { getAddress, verifyMessage, type Address, type Hex } from "viem";
import { ENS_CHAIN_ID } from "./config";
import type { SqlDb } from "./db";
import { fail } from "./errors";
import { canonicalWallet } from "./ids";

export interface Clock {
  now(): number; // ms epoch
}
export const systemClock: Clock = { now: () => Date.now() };

/** Pluggable so smart-account (ERC-1271/6492) verification can be added via a public client. */
export type MessageVerifier = (a: { address: Address; message: string; signature: Hex }) => Promise<boolean>;
export const eoaMessageVerifier: MessageVerifier = (a) => verifyMessage(a);

export const CHALLENGE_TTL_MS = 5 * 60_000;
export const SESSION_TTL_MS = 12 * 60 * 60_000;

export function sha256(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

export interface AuthConfig {
  domain: string; // e.g. "vestige.example"
  uri: string; // e.g. "https://vestige.example"
}

export class AuthService {
  constructor(
    private db: SqlDb,
    private cfg: AuthConfig,
    private clock: Clock = systemClock,
    private verify: MessageVerifier = eoaMessageVerifier,
  ) {}

  createChallenge(walletInput: unknown): { nonce: string; message: string; expiresAt: string } {
    const wallet = canonicalWallet(walletInput);
    const now = this.clock.now();
    const nonce = randomBytes(16).toString("hex");
    const expires = now + CHALLENGE_TTL_MS;
    const message = [
      `${this.cfg.domain} wants you to sign in with your Ethereum account:`,
      getAddress(wallet),
      "",
      "Sign in to vestige. This proves you control this wallet. It does not approve any transaction or payment.",
      "",
      `URI: ${this.cfg.uri}`,
      "Version: 1",
      `Chain ID: ${ENS_CHAIN_ID}`,
      `Nonce: ${nonce}`,
      `Issued At: ${new Date(now).toISOString()}`,
      `Expiration Time: ${new Date(expires).toISOString()}`,
    ].join("\n");
    this.db.run(
      "INSERT INTO identity_auth_challenges (nonce, wallet, message, expires_at, created_at) VALUES (?,?,?,?,?)",
      nonce, wallet, message, expires, now,
    );
    return { nonce, message, expiresAt: new Date(expires).toISOString() };
  }

  /** Verifies the signed challenge (single use) and returns a bearer token. */
  async createSession(input: { nonce?: unknown; signature?: unknown }): Promise<{ token: string; wallet: Address; expiresAt: string }> {
    if (typeof input?.nonce !== "string" || typeof input?.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(input.signature)) {
      fail("BAD_REQUEST", "nonce and signature are required.");
    }
    const now = this.clock.now();
    const row = this.db.get<{ wallet: string; message: string; expires_at: number; used_at: number | null }>(
      "SELECT wallet, message, expires_at, used_at FROM identity_auth_challenges WHERE nonce = ?",
      input.nonce,
    );
    if (!row || row.used_at !== null || row.expires_at <= now) fail("CHALLENGE_INVALID", "Sign-in request expired or already used. Start again.");
    // Consume before verifying so a challenge can never be used twice, even concurrently.
    const consumed = this.db.run("UPDATE identity_auth_challenges SET used_at = ? WHERE nonce = ? AND used_at IS NULL", now, input.nonce);
    if (consumed.changes !== 1) fail("CHALLENGE_INVALID", "Sign-in request already used.");
    let ok = false;
    try {
      ok = await this.verify({ address: row.wallet as Address, message: row.message, signature: input.signature as Hex });
    } catch {
      ok = false;
    }
    if (!ok) fail("SIGNATURE_INVALID", "Signature does not match this wallet.");
    const token = randomBytes(32).toString("base64url");
    const expires = now + SESSION_TTL_MS;
    this.db.run(
      "INSERT INTO identity_sessions (token_hash, wallet, expires_at, created_at) VALUES (?,?,?,?)",
      sha256(token), row.wallet, expires, now,
    );
    return { token, wallet: row.wallet as Address, expiresAt: new Date(expires).toISOString() };
  }

  /** Resolves `Authorization: Bearer <token>` to the authenticated wallet. */
  authenticate(req: Request): Address {
    const h = req.headers.get("authorization") ?? "";
    const m = /^Bearer ([A-Za-z0-9_-]{20,})$/.exec(h);
    if (!m) fail("UNAUTHENTICATED", "Sign in with your wallet first.");
    const row = this.db.get<{ wallet: string; expires_at: number }>(
      "SELECT wallet, expires_at FROM identity_sessions WHERE token_hash = ?",
      sha256(m[1]!),
    );
    if (!row || row.expires_at <= this.clock.now()) fail("UNAUTHENTICATED", "Session expired. Sign in again.");
    return row.wallet as Address;
  }
}
