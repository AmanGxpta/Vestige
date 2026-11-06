/**
 * Framework-neutral handlers (Web Request → Response). Next.js route files in
 * app/api/identity/** and app/api/agreements/** are thin wrappers around these.
 *
 * CONTRACTS v0 @30d1ef6 transport rules implemented here:
 * - errors are `{ error: { code, message } }`, `Cache-Control: no-store`, no CORS headers
 * - mutations reject cross-origin browser requests (Origin / Sec-Fetch-Site)
 * - retryable writes honour `Idempotency-Key`, scoped to session wallet + route +
 *   canonical body digest: identical retry → original response; changed body → 409
 */
import { createHash } from "node:crypto";
import type { AgreementService } from "../agreements/service";
import type { AuthService } from "./auth";
import type { SqlDb } from "./db";
import { IdentityError } from "./errors";
import { publicSummary } from "./public";
import type { VentureService } from "./ventures";

export interface IdentityServices {
  db: SqlDb;
  auth: AuthService;
  ventures: VentureService;
  agreements: AgreementService;
  parentName?: string;
}

const MAX_BODY = 64_000;
const IDEM_KEY = /^[A-Za-z0-9_.:-]{8,128}$/;

const serialize = (body: unknown) => JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  status === 204
    ? new Response(null, { status, headers: { "cache-control": "no-store", ...extra } })
    : new Response(serialize(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY) throw new IdentityError("BAD_REQUEST", "Request too large.");
  const text = await req.text();
  if (text.length > MAX_BODY) throw new IdentityError("BAD_REQUEST", "Request too large.");
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fallthrough */
  }
  throw new IdentityError("BAD_REQUEST", "Body must be a JSON object.");
}

/** Stable digest of a parsed JSON body (sorted keys, no whitespace). */
function bodyDigest(v: unknown): string {
  const stable = (x: unknown): unknown =>
    Array.isArray(x) ? x.map(stable) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, stable((x as Record<string, unknown>)[k])])) : x;
  return createHash("sha256").update(JSON.stringify(stable(v))).digest("hex");
}

function errorResponse(e: unknown): Response {
  if (e instanceof IdentityError) return json(e.status, { error: { code: e.code, message: e.message } });
  // Unknown errors: no internals leak to clients (and no tokens/nullifiers in logs).
  console.error("[identity] unexpected error", e instanceof Error ? e.name : typeof e);
  return json(500, { error: { code: "INTERNAL", message: "Something went wrong." } });
}

export async function handle(fn: () => Promise<unknown> | unknown, okStatus = 200): Promise<Response> {
  try {
    return json(okStatus, await fn());
  } catch (e) {
    return errorResponse(e);
  }
}

/** Same-origin mutation check. Non-browser clients (no Origin) are allowed; bearer auth still applies. */
export function assertSameOrigin(req: Request, trustedOrigin: string | null): void {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new IdentityError("ORIGIN_FORBIDDEN", "Cross-site requests are not allowed.");
  const origin = req.headers.get("origin");
  if (origin === null) return;
  if (!trustedOrigin || origin !== trustedOrigin) throw new IdentityError("ORIGIN_FORBIDDEN", "Cross-site requests are not allowed.");
}

export const handlers = (s: IdentityServices) => {
  /**
   * Authenticated mutation with optional Idempotency-Key. The key row is claimed
   * (IN_PROGRESS) before running, so concurrent duplicates get 409 instead of
   * double-executing. 5xx results are not cached, so the client may retry.
   */
  async function mutate(req: Request, route: string, okStatus: number, run: (wallet: `0x${string}`, body: Record<string, unknown>) => Promise<unknown> | unknown): Promise<Response> {
    try {
      assertSameOrigin(req, s.auth.origin);
      const wallet = s.auth.authenticate(req);
      const body = req.method === "DELETE" ? {} : await readBody(req);
      const key = req.headers.get("idempotency-key");
      if (key === null) return json(okStatus, await run(wallet, body));
      if (!IDEM_KEY.test(key)) throw new IdentityError("BAD_REQUEST", "Idempotency-Key must be 8–128 URL-safe characters.");
      const digest = bodyDigest(body);
      const prior = s.db.get<{ body_digest: string; state: string; status_code: number | null; response_json: string | null }>(
        "SELECT body_digest, state, status_code, response_json FROM identity_idempotency WHERE wallet = ? AND route = ? AND idem_key = ?",
        wallet, route, key,
      );
      if (prior) {
        if (prior.body_digest !== digest) throw new IdentityError("IDEMPOTENCY_CONFLICT", "This Idempotency-Key was used with a different request.");
        if (prior.state !== "DONE") throw new IdentityError("IDEMPOTENCY_CONFLICT", "The original request is still in progress.");
        return new Response(prior.response_json, { status: prior.status_code!, headers: { "content-type": "application/json", "cache-control": "no-store", "idempotent-replayed": "true" } });
      }
      try {
        s.db.run(
          "INSERT INTO identity_idempotency (wallet, route, idem_key, body_digest, state, created_at) VALUES (?,?,?,?, 'IN_PROGRESS', ?)",
          wallet, route, key, digest, Date.now(),
        );
      } catch {
        throw new IdentityError("IDEMPOTENCY_CONFLICT", "The original request is still in progress.");
      }
      let res: Response;
      try {
        res = json(okStatus, await run(wallet, body));
      } catch (e) {
        res = errorResponse(e);
      }
      if (res.status >= 500) {
        s.db.run("DELETE FROM identity_idempotency WHERE wallet = ? AND route = ? AND idem_key = ?", wallet, route, key);
        return res;
      }
      const text = await res.clone().text();
      s.db.run(
        "UPDATE identity_idempotency SET state = 'DONE', status_code = ?, response_json = ? WHERE wallet = ? AND route = ? AND idem_key = ?",
        res.status, text, wallet, route, key,
      );
      return res;
    } catch (e) {
      return errorResponse(e);
    }
  }

  /** Unauthenticated auth bootstrap: same-origin + rate limits (in AuthService). */
  const bootstrap = (req: Request, fn: (b: Record<string, unknown>) => Promise<unknown> | unknown) =>
    handle(async () => {
      assertSameOrigin(req, s.auth.origin);
      return fn(await readBody(req));
    }, 201);

  return {
    authChallenge: (req: Request) => bootstrap(req, (b) => s.auth.createChallenge(b.wallet)),
    authSession: (req: Request) => bootstrap(req, (b) => s.auth.createSession(b)),
    authLogout: async (req: Request) => {
      try {
        assertSameOrigin(req, s.auth.origin);
        s.auth.revoke(req);
        return json(204, null);
      } catch (e) {
        return errorResponse(e);
      }
    },

    createVenture: (req: Request) => mutate(req, "POST /identity/ventures", 201, (w, b) => s.ventures.create(w, b)),
    listVentures: (_req: Request) => handle(() => s.ventures.publicList((id) => s.agreements.termsSigned(id))),
    getVenture: (req: Request, id: string) =>
      handle(async () => {
        const wallet = s.auth.authenticate(req);
        s.ventures.requireSeat(id as `0x${string}`, wallet);
        for (const seat of s.ventures.view(id).seats) {
          if (seat.onchainSeatStatus === "PENDING") await s.ventures.refreshAttestation(seat.ventureId, seat.wallet).catch(() => undefined);
        }
        return { venture: s.ventures.view(id), agreement: s.agreements.view(id, { includeText: true }) };
      }),
    createInvite: (req: Request, id: string) => mutate(req, `POST /identity/ventures/${id}/invites`, 201, (w) => s.ventures.createInvite(w, id)),
    join: (req: Request, id: string) => mutate(req, `POST /identity/ventures/${id}/join`, 200, (w, b) => s.ventures.join(w, id, b)),
    setListing: (req: Request, id: string) => mutate(req, `POST /identity/ventures/${id}/listing`, 200, (w, b) => s.ventures.setListing(w, id, b)),
    worldRequest: (req: Request, id: string) => mutate(req, `POST /identity/ventures/${id}/world/request`, 200, (w) => s.ventures.worldRequest(w, id)),
    worldVerify: (req: Request, id: string) => mutate(req, `POST /identity/ventures/${id}/world/verify`, 200, (w, b) => s.ventures.verifyWorld(w, id, b)),

    createAgreementVersion: (req: Request, id: string) => mutate(req, `POST /agreements/ventures/${id}/versions`, 201, (w, b) => s.agreements.createVersion(w, id, b)),
    signingPayload: (req: Request, id: string) =>
      handle(async () => {
        const u = new URL(req.url);
        return s.agreements.signingPayload(s.auth.authenticate(req), id, { nonce: u.searchParams.get("nonce") ?? undefined, expiry: u.searchParams.get("expiry") ?? undefined });
      }),
    signAgreement: (req: Request, id: string) => mutate(req, `POST /agreements/ventures/${id}/sign`, 200, (w, b) => s.agreements.sign(w, id, b)),

    publicSummary: (_req: Request, ensName: string) => handle(() => publicSummary(s.db, s.ventures, s.agreements, decodeURIComponent(ensName), s.parentName)),
  };
};
