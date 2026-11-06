/**
 * Wallet authentication (CONTRACTS v0 @30d1ef6, D-010): single-use EIP-4361-style
 * EOA challenge → 32-byte bearer session, SHA-256 at rest, 12 h, `Authorization: Bearer`.
 * - 16-byte nonce, 5-minute TTL, consumed atomically BEFORE signature verification.
 * - domain/URI come only from trusted server config (never Host headers); https
 *   is required outside localhost.
 * - Both auth endpoints are unauthenticated and rate limited (single-host, in-memory).
 * - Logout (DELETE session) revokes the token server-side.
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
  domain: string; // e.g. "vestige.example" (EIP-4361 authority, host[:port])
  uri: string; // e.g. "https://vestige.example"
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Validates trusted auth config; throws CONFIG_MISSING when unusable (fail closed). */
export function validateAuthConfig(cfg: Partial<AuthConfig> | null | undefined): AuthConfig {
  if (!cfg?.domain || !cfg?.uri) fail("CONFIG_MISSING", "Wallet sign-in is not configured on this server.");
  let u: URL;
  try {
    u = new URL(cfg.uri);
  } catch {
    fail("CONFIG_MISSING", "VESTIGE_AUTH_URI is not a valid URL.");
  }
  if (u.protocol !== "https:" && !(u.protocol === "http:" && LOCAL_HOSTS.has(u.hostname))) {
    fail("CONFIG_MISSING", "VESTIGE_AUTH_URI must use https outside localhost.");
  }
  if (cfg.domain !== u.host) fail("CONFIG_MISSING", "VESTIGE_AUTH_DOMAIN must equal the host of VESTIGE_AUTH_URI.");
  if (/[\s\n]/.test(cfg.domain)) fail("CONFIG_MISSING", "VESTIGE_AUTH_DOMAIN is invalid.");
  return { domain: cfg.domain, uri: u.origin };
}

/** Fixed-window limiter. Single host (CONTRACTS v0 persistence model); not shared across replicas. */
export class RateLimiter {
  private hits = new Map<string, { start: number; n: number }>();
  constructor(private limit: number, private windowMs: number, private clock: Clock = systemClock) {}
  take(key: string): void {
    const now = this.clock.now();
    const h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) {
      if (this.hits.size > 10_000) this.hits.clear();
      this.hits.set(key, { start: now, n: 1 });
      return;
    }
    if (++h.n > this.limit) fail("RATE_LIMITED", "Too many sign-in attempts. Wait a minute and try again.");
  }
}

export const MAX_OPEN_CHALLENGES_PER_WALLET = 5;
const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/;

export class AuthService {
  private cfg: AuthConfig | null;
  private challengeWallet: RateLimiter;
  private challengeGlobal: RateLimiter;
  private sessionGlobal: RateLimiter;
  constructor(
    private db: SqlDb,
    cfg: Partial<AuthConfig> | null,
    private clock: Clock = systemClock,
    private verify: MessageVerifier = eoaMessageVerifier,
  ) {
    // Bad config is not fatal at boot (reads still work) but every sign-in fails closed.
    try {
      this.cfg = validateAuthConfig(cfg);
    } catch {
      this.cfg = null;
    }
    this.challengeWallet = new RateLimiter(10, 60_000, clock);
    this.challengeGlobal = new RateLimiter(300, 60_000, clock);
    this.sessionGlobal = new RateLimiter(300, 60_000, clock);
  }

  /** Trusted origin for same-origin mutation checks (null when unconfigured). */
  get origin(): string | null {
    return this.cfg?.uri ?? null;
  }

  private config(): AuthConfig {
    if (!this.cfg) fail("CONFIG_MISSING", "Wallet sign-in is not configured on this server.");
    return this.cfg;
  }

  createChallenge(walletInput: unknown): { nonce: string; message: string; expiresAt: string } {
    const cfg = this.config();
    const wallet = canonicalWallet(walletInput);
    this.challengeGlobal.take("*");
    this.challengeWallet.take(wallet);
    const now = this.clock.now();
    this.db.run("DELETE FROM identity_auth_challenges WHERE expires_at <= ? OR used_at IS NOT NULL AND used_at <= ?", now, now - CHALLENGE_TTL_MS);
    const open = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM identity_auth_challenges WHERE wallet = ? AND used_at IS NULL AND expires_at > ?", wallet, now)!.n;
    if (open >= MAX_OPEN_CHALLENGES_PER_WALLET) fail("RATE_LIMITED", "Too many open sign-in requests for this wallet. Wait a few minutes.");
    const nonce = randomBytes(16).toString("hex");
    const expires = now + CHALLENGE_TTL_MS;
    const message = [
      `${cfg.domain} wants you to sign in with your Ethereum account:`,
      getAddress(wallet),
      "",
      "Sign in to vestige. This proves you control this wallet. It does not approve any transaction or payment.",
      "",
      `URI: ${cfg.uri}`,
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
    this.config();
    this.sessionGlobal.take("*");
    if (typeof input?.nonce !== "string" || !/^[0-9a-f]{32}$/.test(input.nonce) || typeof input?.signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(input.signature)) {
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

  private tokenHash(req: Request): string {
    const m = BEARER.exec(req.headers.get("authorization") ?? "");
    if (!m) fail("UNAUTHENTICATED", "Sign in with your wallet first.");
    return sha256(m[1]!);
  }

  /** Resolves `Authorization: Bearer <token>` to the authenticated wallet. Expired/revoked → 401. */
  authenticate(req: Request): Address {
    const hash = this.tokenHash(req);
    const row = this.db.get<{ wallet: string; expires_at: number }>("SELECT wallet, expires_at FROM identity_sessions WHERE token_hash = ?", hash);
    if (!row || row.expires_at <= this.clock.now()) {
      if (row) this.db.run("DELETE FROM identity_sessions WHERE token_hash = ?", hash);
      fail("UNAUTHENTICATED", "Session expired. Sign in again.");
    }
    return row.wallet as Address;
  }

  /** DELETE /api/identity/auth/session — revokes this token (idempotent for a valid-format token). */
  revoke(req: Request): void {
    const hash = this.tokenHash(req);
    this.db.run("DELETE FROM identity_sessions WHERE token_hash = ?", hash);
    this.db.run("DELETE FROM identity_sessions WHERE expires_at <= ?", this.clock.now());
  }
}
