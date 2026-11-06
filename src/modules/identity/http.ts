/**
 * Framework-neutral handlers (Web Request → Response). Next.js route files in
 * app/api/identity/** and app/api/agreements/** are thin wrappers around these.
 */
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

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

async function body(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > 64_000) throw new IdentityError("BAD_REQUEST", "Request too large.");
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* fallthrough */
  }
  throw new IdentityError("BAD_REQUEST", "Body must be a JSON object.");
}

export async function handle(fn: () => Promise<unknown> | unknown, okStatus = 200): Promise<Response> {
  try {
    return json(okStatus, await fn());
  } catch (e) {
    if (e instanceof IdentityError) return json(e.status, { error: { code: e.code, message: e.message } });
    // Unknown errors: no internals leak to clients.
    console.error("[identity] unexpected error", e instanceof Error ? e.message : e);
    return json(500, { error: { code: "INTERNAL", message: "Something went wrong." } });
  }
}

export const handlers = (s: IdentityServices) => ({
  authChallenge: (req: Request) => handle(async () => s.auth.createChallenge((await body(req)).wallet), 201),
  authSession: (req: Request) => handle(async () => s.auth.createSession(await body(req)), 201),

  createVenture: (req: Request) => handle(async () => s.ventures.create(s.auth.authenticate(req), await body(req)), 201),
  getVenture: (req: Request, id: string) =>
    handle(async () => {
      const wallet = s.auth.authenticate(req);
      s.ventures.requireSeat(id as `0x${string}`, wallet);
      for (const seat of s.ventures.view(id).seats) {
        if (seat.onchainSeatStatus === "PENDING") await s.ventures.refreshAttestation(seat.ventureId, seat.wallet).catch(() => undefined);
      }
      return { venture: s.ventures.view(id), agreement: s.agreements.view(id, { includeText: true }) };
    }),
  createInvite: (req: Request, id: string) => handle(() => s.ventures.createInvite(s.auth.authenticate(req), id), 201),
  join: (req: Request, id: string) => handle(async () => s.ventures.join(s.auth.authenticate(req), id, await body(req))),
  worldRequest: (req: Request, id: string) => handle(() => s.ventures.worldRequest(s.auth.authenticate(req), id)),
  worldVerify: (req: Request, id: string) => handle(async () => s.ventures.verifyWorld(s.auth.authenticate(req), id, await body(req))),

  createAgreementVersion: (req: Request, id: string) => handle(async () => s.agreements.createVersion(s.auth.authenticate(req), id, await body(req)), 201),
  signingPayload: (req: Request, id: string) =>
    handle(async () => {
      const u = new URL(req.url);
      return s.agreements.signingPayload(s.auth.authenticate(req), id, { nonce: u.searchParams.get("nonce") ?? undefined, expiry: Number(u.searchParams.get("expiry")) });
    }),
  signAgreement: (req: Request, id: string) => handle(async () => s.agreements.sign(s.auth.authenticate(req), id, await body(req))),

  publicSummary: (_req: Request, ensName: string) => handle(() => publicSummary(s.db, s.ventures, s.agreements, decodeURIComponent(ensName), s.parentName)),
});
