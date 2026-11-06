/**
 * LIVE adapter: typed client for the CONTRACTS v0 routes (H-approved @ 30d1ef6).
 *
 *  - C1 identity/agreement routes are mapped from C1's handlers at agent/identity@1b502e6.
 *  - X treasury routes follow CONTRACTS; X has not shipped HTTP handlers yet, so they
 *    currently resolve to BLOCKED (a missing route is never shown as success).
 *  - The bearer token lives only in this closure (memory): never localStorage, URLs or logs.
 *  - Every server-built payload is checked against what the user reviewed BEFORE the
 *    wallet is asked to sign (venture, version, docHash, domain, Safe, token).
 */
import { getAddress, type TypedDataDefinition } from "viem";
import { err, ok, type AdapterErrorCode, type MessageSigner, type Result, type TypedDataSigner, type VestigeClient, type WorldRequestParams } from "./adapter";
import { FOUNDING_TERMS_DOMAIN } from "./agreement/terms";
import type { DeploymentManifestV1 } from "@/src/modules/public-view/manifest";
import type {
  Address,
  Agreement,
  Evidence,
  EvidenceKind,
  EvidenceLabel,
  FounderSeat,
  Hex,
  Payment,
  PublicOffchainEvidence,
  ReadStatus,
  Treasury,
  TreasuryState,
  TreasuryStatus,
  VentureDetail,
  VentureId,
  VentureSummary,
  WorldEnvironment,
} from "./types";
import { SEPOLIA_CHAIN_ID, WHITECHAIN_CHAIN_ID } from "./types";

export type LiveDeps = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Reviewed deployment manifest (needed for funding domain checks). */
  getManifest?: () => Promise<DeploymentManifestV1 | null>;
  /** Approved test USDT anchor (CONTRACTS "Network and approved runtime anchors"). */
  usdtAddress?: Address;
  now?: () => number;
};

type C1Seat = {
  ventureId: VentureId;
  wallet: Address;
  founderLabel: string;
  founderSubname: string;
  worldProofStatus: "PENDING" | "VERIFIED" | "FAILED";
  onchainSeatStatus: ReadStatus;
  subnameStatus: ReadStatus;
  attestationTxHash?: Hex;
  worldEnvironment?: WorldEnvironment;
};
type C1Venture = { ventureId: VentureId; slug: string; ensName: string; displayName: string; status: "workspace"; ensStatus: ReadStatus; seats: C1Seat[]; humansVerified: number; maxSeats: number };
type C1Agreement = {
  ventureId: VentureId;
  agreementId: Hex;
  version: number;
  docHash: Hex;
  canonicalJson?: string;
  signatures: { signer: Address; verifiedAt: string; label: "SIGNED" }[];
  requiredSigners: Address[];
  complete: boolean;
  ensStatus: ReadStatus;
};
type C1Public = {
  ensName: string;
  ventureId: VentureId;
  founders: { subname: string; wallet: Address; humanVerified: boolean; onchainSeatStatus: ReadStatus; attestationTxHash?: Hex; subnameStatus: ReadStatus; worldEnvironment?: WorldEnvironment }[];
  humansVerified: number;
  agreement: null | { version: number; docHash: Hex; signedBy: Address[]; requiredSigners: number; complete: boolean; ensRecordStatus: ReadStatus };
  events: { kind: string; label: EvidenceLabel; status: ReadStatus; chainId?: number; txHash?: Hex; blockNumber?: number; at: string; source?: string }[];
};

const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const isHex32 = (v: unknown): v is Hex => typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
const isAddr = (v: unknown): v is Address => typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
const randomUint = () => {
  const a = new Uint32Array(2);
  globalThis.crypto.getRandomValues(a);
  return (BigInt(a[0]) << 32n) | BigInt(a[1]);
};
const randomBytes32 = (): Hex => {
  const a = new Uint8Array(32);
  globalThis.crypto.getRandomValues(a);
  return `0x${Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
};
const idemKey = () => globalThis.crypto.randomUUID();

/** C1/X error codes → stable UI codes. Message is user-safe per CONTRACTS. */
const CODE_MAP: Record<string, AdapterErrorCode> = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "NOT_A_FOUNDER",
  NOT_FOUND: "NOT_FOUND",
  BAD_REQUEST: "INVALID_INPUT",
  SLUG_INVALID: "INVALID_INPUT",
  LABEL_INVALID: "INVALID_INPUT",
  LABEL_TAKEN: "INVALID_INPUT",
  AGREEMENT_INVALID: "INVALID_INPUT",
  SLUG_TAKEN: "SLUG_TAKEN",
  INVITE_INVALID: "INVITE_INVALID",
  ALREADY_SEATED: "WALLET_ALREADY_SEATED",
  VENTURE_FULL: "NOT_READY",
  DUPLICATE_HUMAN: "DUPLICATE_HUMAN",
  NOT_VERIFIED_FOUNDER: "NOT_VERIFIED",
  VERSION_SUPERSEDED: "VERSION_SUPERSEDED",
  CHALLENGE_INVALID: "INVALID_INPUT",
  SIGNATURE_INVALID: "INVALID_INPUT",
  SIGNATURE_EXPIRED: "INVALID_INPUT",
  NONCE_REUSED: "INVALID_INPUT",
  WORLD_REQUEST_INVALID: "INVALID_INPUT",
  WORLD_PROOF_INVALID: "INVALID_INPUT",
  WORLD_PROTOCOL_MISMATCH: "INVALID_INPUT",
  WORLD_ENVIRONMENT_MISMATCH: "INVALID_INPUT",
  WORLD_ACTION_MISMATCH: "INVALID_INPUT",
  WORLD_SIGNAL_MISMATCH: "INVALID_INPUT",
  WORLD_UNAVAILABLE: "BLOCKED",
  CONFIG_MISSING: "BLOCKED",
  ALREADY_VERIFIED: "NOT_READY",
  ALREADY_SIGNED: "NOT_READY",
};

const KIND_MAP: Record<string, EvidenceKind> = {
  venture_created: "VENTURE_CREATED",
  founder_joined: "FOUNDER_JOINED",
  founder_verified: "FOUNDER_VERIFIED",
  duplicate_human_refused: "DUPLICATE_REFUSED",
  seat_attestation_submitted: "SEAT_ATTESTED",
  seat_attested: "SEAT_ATTESTED",
  agreement_version_created: "AGREEMENT_VERSION",
  agreement_signed: "AGREEMENT_SIGNED",
  ens_venture_registered: "ENS_REGISTERED",
  ens_founder_registered: "ENS_REGISTERED",
  ens_humans_record: "ENS_RECORD",
  ens_agreement_record: "ENS_RECORD",
};

const TREASURY_STATUSES: TreasuryStatus[] = ["UNKNOWN", "PENDING", "ACTIVE", "UNVERIFIED", "FAILED"];

export function createLiveAdapter(deps: LiveDeps = {}): VestigeClient {
  const base = deps.baseUrl ?? "";
  const doFetch = deps.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = deps.now ?? Date.now;
  const listeners = new Set<() => void>();
  let session: { token: string; wallet: Address; expiresAt: string } | null = null;
  const emit = () => listeners.forEach((l) => l());
  const clearSession = () => {
    if (session) {
      session = null;
      emit();
    }
  };
  const activeSession = () => {
    if (session && Date.parse(session.expiresAt) <= now()) clearSession();
    return session;
  };

  async function call<T>(method: string, route: string, path: string, opts: { body?: unknown; auth?: boolean; idempotent?: boolean } = {}): Promise<Result<T>> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    if (opts.auth) {
      const s = activeSession();
      if (!s) return err("UNAUTHENTICATED", "Sign in with your wallet first.");
      headers.authorization = `Bearer ${s.token}`;
    }
    if (opts.idempotent) headers["idempotency-key"] = idemKey();
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
        cache: "no-store",
        credentials: "same-origin",
      });
    } catch (e) {
      return err("NETWORK", "Could not reach the vestige API.", e instanceof Error ? e.message : String(e));
    }
    if (res.status === 204) return ok(undefined as T);
    const ctype = res.headers.get("content-type") ?? "";
    let json: unknown = undefined;
    if (ctype.includes("application/json")) {
      try {
        json = await res.json();
      } catch {
        json = undefined;
      }
    }
    if (json === undefined) {
      // Next.js answers an absent route with an HTML 404 / empty 405: the backend is not deployed here.
      if (res.status === 404 || res.status === 405 || res.status === 501)
        return err("BLOCKED", "Not connected yet", `${route} is not deployed in this build (HTTP ${res.status}).`);
      return err("NETWORK", `Unexpected response from ${route} (HTTP ${res.status}).`);
    }
    if (res.ok) return ok(json as T);
    const e = (json as { error?: { code?: string; message?: string } }).error;
    const code = (e?.code && CODE_MAP[e.code]) || (e?.code?.startsWith("RELAY") ? "RELAYER_REFUSED" : "NETWORK");
    if (code === "UNAUTHENTICATED") clearSession();
    return err(code, e?.message ?? `Request failed (HTTP ${res.status}).`, e?.code ? `server code ${e.code}` : undefined);
  }

  const requireSessionFor = (wallet?: Address): Result<Address> => {
    const s = activeSession();
    if (!s) return err("UNAUTHENTICATED", "Sign in with your wallet to continue.");
    if (wallet && !same(wallet, s.wallet)) {
      clearSession();
      return err("UNAUTHENTICATED", "Your wallet account changed. Sign in again with the connected account.");
    }
    return ok(s.wallet);
  };

  const toSeat = (s: C1Seat): FounderSeat => ({
    ventureId: s.ventureId,
    wallet: getAddress(s.wallet),
    founderLabel: s.founderLabel,
    founderSubname: s.founderSubname,
    // C1 "PENDING" = not yet verified (default state), not "verification in flight".
    worldProofStatus: s.worldProofStatus === "PENDING" ? "UNKNOWN" : s.worldProofStatus,
    onchainSeatStatus: s.onchainSeatStatus,
    subnameStatus: s.subnameStatus,
    ...(s.attestationTxHash ? { attestationTxHash: s.attestationTxHash } : {}),
    ...(s.worldEnvironment ? { worldEnvironment: s.worldEnvironment } : {}),
  });

  const toAgreement = (a: C1Agreement): Agreement => ({
    ventureId: a.ventureId,
    agreementId: a.agreementId,
    version: a.version,
    docHash: a.docHash,
    ...(a.canonicalJson ? { canonicalJson: a.canonicalJson } : {}),
    signatures: a.signatures.map((g) => ({ signer: getAddress(g.signer), signedAt: g.verifiedAt, version: a.version, docHash: a.docHash })),
    requiredSigners: a.requiredSigners,
    complete: a.complete,
    ensStatus: a.ensStatus,
  });

  const toDetail = (venture: C1Venture, agreement: C1Agreement | null): VentureDetail => ({
    ventureId: venture.ventureId,
    slug: venture.slug,
    displayName: venture.displayName,
    ensName: venture.ensName,
    ensStatus: venture.ensStatus,
    seats: venture.seats.map(toSeat),
    ...(agreement ? { agreement: toAgreement(agreement) } : {}),
    listing: null, // C1 does not report listing state yet (CR-C2-001 follow-through)
    source: "API",
  });

  const ventureDetail = async (id: VentureId): Promise<Result<VentureDetail>> => {
    const r = await call<{ venture: C1Venture; agreement: C1Agreement | null }>("GET", "GET /api/identity/ventures/:id", `/api/identity/ventures/${id}`, { auth: true });
    return r.ok ? ok(toDetail(r.value.venture, r.value.agreement)) : r;
  };

  const treasuryState = async (id: VentureId): Promise<Result<TreasuryState>> => {
    const r = await call<Record<string, unknown>>("GET", "GET /api/treasury/ventures/:id", `/api/treasury/ventures/${id}`);
    if (!r.ok) return r;
    return ok(toTreasuryState(r.value));
  };

  const client: VestigeClient = {
    kind: "live",
    sessionWallet: () => activeSession()?.wallet ?? null,

    async signIn(wallet: Address, sign: MessageSigner) {
      const ch = await call<{ nonce: string; message: string; expiresAt: string }>("POST", "POST /api/identity/auth/challenge", "/api/identity/auth/challenge", { body: { wallet } });
      if (!ch.ok) return ch;
      // Defence in depth: only sign a challenge that names this wallet and Sepolia (CONTRACTS auth).
      if (!ch.value.message.includes(getAddress(wallet)) || !ch.value.message.includes(`Chain ID: ${SEPOLIA_CHAIN_ID}`))
        return err("INVALID_INPUT", "The sign-in message did not match your wallet and network. Nothing was signed.");
      const signature = await sign(ch.value.message);
      if (!signature) return err("CANCELLED", "Sign-in cancelled.");
      const s = await call<{ token: string; wallet: Address; expiresAt: string }>("POST", "POST /api/identity/auth/session", "/api/identity/auth/session", {
        body: { nonce: ch.value.nonce, signature },
      });
      if (!s.ok) return s;
      if (!same(s.value.wallet, wallet)) return err("INVALID_INPUT", "The server signed in a different wallet. Sign-in refused.");
      session = { token: s.value.token, wallet: getAddress(s.value.wallet), expiresAt: s.value.expiresAt };
      emit();
      return ok({ wallet: session.wallet, expiresAt: session.expiresAt });
    },

    async signOut() {
      if (activeSession()) await call("DELETE", "DELETE /api/identity/auth/session", "/api/identity/auth/session", { auth: true });
      clearSession();
    },

    async createVenture({ displayName, slug, founderLabel, wallet }) {
      const s = requireSessionFor(wallet);
      if (!s.ok) return s;
      const r = await call<C1Venture>("POST", "POST /api/identity/ventures", "/api/identity/ventures", {
        auth: true,
        idempotent: true,
        body: { name: displayName, slug, founderLabel },
      });
      return r.ok ? ok(toDetail(r.value, null)) : r;
    },

    async getVenture(ventureId, viewer) {
      const s = requireSessionFor(viewer);
      if (!s.ok) return s;
      return ventureDetail(ventureId);
    },

    async createInvite(ventureId, { wallet }) {
      const s = requireSessionFor(wallet);
      if (!s.ok) return s;
      const r = await call<{ inviteToken: string }>("POST", "POST /api/identity/ventures/:id/invites", `/api/identity/ventures/${ventureId}/invites`, { auth: true });
      return r.ok ? ok({ inviteCode: r.value.inviteToken }) : r;
    },

    async joinVenture(ventureId, { inviteCode, founderLabel, wallet }) {
      const s = requireSessionFor(wallet);
      if (!s.ok) return s;
      const r = await call<C1Venture>("POST", "POST /api/identity/ventures/:id/join", `/api/identity/ventures/${ventureId}/join`, {
        auth: true,
        body: { inviteToken: inviteCode, founderLabel },
      });
      return r.ok ? ok(toDetail(r.value, null)) : r;
    },

    async requestWorld(ventureId, { wallet }) {
      const s = requireSessionFor(wallet);
      if (!s.ok) return s;
      const r = await call<WorldRequestParams>("POST", "POST /api/identity/ventures/:id/world/request", `/api/identity/ventures/${ventureId}/world/request`, { auth: true });
      if (!r.ok) return r;
      const p = r.value;
      // The server pins these; refuse to open World ID with anything else.
      if (p.action !== `vestige-founder-seat:${ventureId}`) return err("INVALID_INPUT", "World ID request was for a different venture. Not opened.");
      if (!same(p.signal, s.value)) return err("INVALID_INPUT", "World ID request was bound to a different wallet. Not opened.");
      if (p.environment !== "production" && p.environment !== "staging") return err("INVALID_INPUT", "World ID request has an unknown environment. Not opened.");
      if (!p.app_id?.startsWith("app_") || !p.rp_context?.signature) return err("INVALID_INPUT", "World ID request is incomplete. Not opened.");
      return ok({ kind: "idkit" as const, params: p });
    },

    async verifyWorld(ventureId, { wallet, proof }) {
      const s = requireSessionFor(wallet);
      if (!s.ok) return s;
      if (proof.kind !== "idkit") return err("INVALID_INPUT", "Simulated proofs are only accepted by the DEV MOCK adapter.");
      const r = await call<unknown>("POST", "POST /api/identity/ventures/:id/world/verify", `/api/identity/ventures/${ventureId}/world/verify`, {
        auth: true,
        body: { idkitResult: proof.result },
      });
      if (!r.ok) return r;
      return ventureDetail(ventureId);
    },

    async getPublicEvidence(ensName) {
      const r = await call<C1Public>("GET", "GET /api/identity/public/:ensName", `/api/identity/public/${encodeURIComponent(ensName)}`);
      if (!r.ok) return r;
      return ok(toPublic(r.value));
    },

    async listVentures() {
      const r = await call<VentureSummary[] | { ventures: VentureSummary[] }>("GET", "GET /api/identity/ventures", "/api/identity/ventures");
      if (!r.ok) return r;
      const raw = Array.isArray(r.value) ? r.value : r.value.ventures;
      if (!Array.isArray(raw)) return err("NETWORK", "Unexpected venture list shape.");
      return ok(
        raw
          .filter((v) => isHex32(v.ventureId) && typeof v.ensName === "string")
          .map((v) => ({
            ventureId: v.ventureId,
            displayName: String(v.displayName ?? v.ensName),
            ensName: v.ensName,
            humansVerified: Number(v.humansVerified) || 0,
            termsSigned: v.termsSigned === true,
            // Unknown stays unknown: never coerce null/undefined into false or true.
            treasuryActive: typeof v.treasuryActive === "boolean" ? v.treasuryActive : null,
            funded: typeof v.funded === "boolean" ? v.funded : null,
            observedAt: typeof v.observedAt === "string" ? v.observedAt : undefined,
            verificationStatus: v.verificationStatus,
            source: "API" as const,
          })),
      );
    },

    async setListing(ventureId, { listed, wallet }) {
      const s = requireSessionFor(wallet);
      if (!s.ok) return s;
      const r = await call<unknown>("POST", "POST /api/identity/ventures/:id/listing", `/api/identity/ventures/${ventureId}/listing`, { auth: true, body: { listed } });
      if (!r.ok) return r;
      return ventureDetail(ventureId);
    },

    async createAgreementVersion(ventureId, { terms, wallet }) {
      const s = requireSessionFor(wallet);
      if (!s.ok) return s;
      const r = await call<C1Agreement>("POST", "POST /api/agreements/ventures/:id/versions", `/api/agreements/ventures/${ventureId}/versions`, {
        auth: true,
        idempotent: true,
        body: { effectiveDate: terms.effectiveDate, decisionRule: terms.decisionRule, founders: terms.founders, notes: terms.notes ?? "" },
      });
      if (!r.ok) return r;
      return ventureDetail(ventureId);
    },

    async signAgreement(ventureId, { version, docHash, wallet }, sign: TypedDataSigner) {
      const s = requireSessionFor(wallet);
      if (!s.ok) return s;
      const nonce = randomUint().toString();
      const expiry = Math.floor(now() / 1000) + 30 * 60;
      const p = await call<{ domain: Record<string, unknown>; types: Record<string, unknown>; primaryType: string; message: Record<string, unknown> }>(
        "GET",
        "GET /api/agreements/ventures/:id/sign",
        `/api/agreements/ventures/${ventureId}/sign?nonce=${nonce}&expiry=${expiry}`,
        { auth: true },
      );
      if (!p.ok) return p;
      const { domain, types, primaryType, message } = p.value;
      // Sign only what the founder reviewed: exact domain, this venture, this version, this hash.
      if (domain?.name !== FOUNDING_TERMS_DOMAIN.name || domain?.version !== FOUNDING_TERMS_DOMAIN.version || Number(domain?.chainId) !== SEPOLIA_CHAIN_ID || "verifyingContract" in (domain ?? {}))
        return err("INVALID_INPUT", "The signing request used an unexpected EIP-712 domain. Nothing was signed.");
      if (primaryType !== "FoundingTerms" || !types?.FoundingTerms) return err("INVALID_INPUT", "The signing request was not FoundingTerms. Nothing was signed.");
      if (!same(String(message?.ventureId), ventureId)) return err("INVALID_INPUT", "The signing request was for a different venture. Nothing was signed.");
      if (String(message?.version) !== String(version) || !same(String(message?.docHash), docHash))
        return err("VERSION_SUPERSEDED", "These terms changed since you opened them. Review the current version before signing.");
      const typed = {
        domain: { name: FOUNDING_TERMS_DOMAIN.name, version: FOUNDING_TERMS_DOMAIN.version, chainId: SEPOLIA_CHAIN_ID },
        types: { FoundingTerms: types.FoundingTerms },
        primaryType: "FoundingTerms",
        message: {
          ventureId: message.ventureId,
          agreementId: message.agreementId,
          version: BigInt(String(message.version)),
          docHash: message.docHash,
          nonce: BigInt(String(message.nonce)),
          expiry: BigInt(String(message.expiry)),
        },
      } as unknown as TypedDataDefinition;
      const signature = await sign(typed);
      if (!signature) return err("CANCELLED", "Signature cancelled. Nothing was signed.");
      const r = await call<C1Agreement>("POST", "POST /api/agreements/ventures/:id/sign", `/api/agreements/ventures/${ventureId}/sign`, {
        auth: true,
        body: { version, nonce: String(message.nonce), expiry: Number(message.expiry), signature },
      });
      if (!r.ok && r.error.detail !== "server code ALREADY_SIGNED") return r;
      return ventureDetail(ventureId);
    },

    // ---- X treasury (routes per CONTRACTS; BLOCKED until X deploys them) ----
    getTreasury: (ventureId) => treasuryState(ventureId),

    async deployTreasury(ventureId, { wallet }) {
      const s = requireSessionFor(wallet);
      if (!s.ok) return s;
      const r = await call<unknown>("POST", "POST /api/treasury/ventures/:id/deploy", `/api/treasury/ventures/${ventureId}/deploy`, { auth: true, idempotent: true, body: {} });
      return r.ok ? treasuryState(ventureId) : r;
    },

    async fundTreasury(ventureId, { from, to, amountRaw }, sign) {
      const s = requireSessionFor(from);
      if (!s.ok) return s;
      // Check the route and the treasury BEFORE asking for any signature.
      const t = await treasuryState(ventureId);
      if (!t.ok) return t;
      const tr = t.value.treasury;
      if (!tr || tr.verificationStatus !== "ACTIVE") return err("NOT_READY", "This venture's treasury is not active yet.");
      if (!same(tr.safeAddress, to)) return err("INVALID_INPUT", "The destination does not match this venture's treasury. Nothing was signed.");
      if (!/^\d+$/.test(amountRaw) || BigInt(amountRaw) <= 0n) return err("INVALID_INPUT", "Enter an amount greater than zero.");
      const m = (await deps.getManifest?.()) ?? null;
      if (!m) return err("BLOCKED", "Not connected yet", "Funding needs the reviewed deployment manifest (NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL).");
      const tok = m.contracts.token;
      const d = tok.eip712Domain;
      if (
        !same(m.contracts.safe.address, to) ||
        !same(tok.address, deps.usdtAddress ?? tok.address) ||
        d.name !== "Tether USD" ||
        d.version !== "1" ||
        d.chainId !== WHITECHAIN_CHAIN_ID ||
        !same(d.verifyingContract, tok.address)
      )
        return err("INVALID_INPUT", "The deployment manifest does not match the approved token or this treasury. Nothing was signed.");
      const validBefore = BigInt(Math.floor(now() / 1000) + 60 * 60);
      const nonce = randomBytes32();
      const typed = {
        domain: { name: d.name, version: d.version, chainId: d.chainId, verifyingContract: d.verifyingContract },
        types: {
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        message: { from, to, value: BigInt(amountRaw), validAfter: 0n, validBefore, nonce },
      } as const;
      const signature = await sign(typed);
      if (!signature) return err("CANCELLED", "Signature cancelled. No money moved.");
      const r = await call<unknown>("POST", "POST /api/treasury/ventures/:id/fund", `/api/treasury/ventures/${ventureId}/fund`, {
        auth: true,
        idempotent: true,
        body: { from, to, value: amountRaw, validAfter: "0", validBefore: validBefore.toString(), nonce, signature },
      });
      return r.ok ? treasuryState(ventureId) : r;
    },

    async proposePayment(ventureId, { recipient, amountRaw, reason, wallet }) {
      const s = requireSessionFor(wallet);
      if (!s.ok) return s;
      const r = await call<unknown>("POST", "POST /api/treasury/ventures/:id/payments", `/api/treasury/ventures/${ventureId}/payments`, {
        auth: true,
        idempotent: true,
        body: { recipient, amountRaw, reason },
      });
      return r.ok ? treasuryState(ventureId) : r;
    },

    async signPayment(ventureId, paymentId, { wallet }, sign) {
      const s = requireSessionFor(wallet);
      if (!s.ok) return s;
      const t = await treasuryState(ventureId);
      if (!t.ok) return t;
      const tr = t.value.treasury;
      const p = t.value.payments.find((x) => x.paymentId === paymentId);
      if (!tr || !p) return err("NOT_FOUND", "No such payment.");
      const td = p.safeTypedData as TypedDataDefinition | undefined;
      const dom = (td?.domain ?? {}) as { chainId?: number | string; verifyingContract?: string };
      const msg = (td?.message ?? {}) as { to?: string; operation?: number | string; value?: string | number };
      if (!td || td.primaryType !== "SafeTx" || Number(dom.chainId) !== WHITECHAIN_CHAIN_ID || !same(dom.verifyingContract, tr.safeAddress))
        return err("INVALID_INPUT", "The payment approval was not a SafeTx for this treasury on Whitechain. Nothing was signed.");
      if (!same(msg.to, p.tokenAddress) || Number(msg.operation) !== 0 || String(msg.value ?? "0") !== "0")
        return err("INVALID_INPUT", "The payment approval is not a plain USDT transfer. Nothing was signed.");
      const signature = await sign(td);
      if (!signature) return err("CANCELLED", "Approval cancelled. Nothing was signed.");
      const r = await call<unknown>("POST", "POST /api/treasury/ventures/:id/payments/:pid/sign", `/api/treasury/ventures/${ventureId}/payments/${paymentId}/sign`, {
        auth: true,
        body: { signature },
      });
      return r.ok ? treasuryState(ventureId) : r;
    },

    async executePayment(ventureId, paymentId, { wallet }) {
      const s = requireSessionFor(wallet);
      if (!s.ok) return s;
      const r = await call<unknown>("POST", "POST /api/treasury/ventures/:id/payments/:pid/execute", `/api/treasury/ventures/${ventureId}/payments/${paymentId}/execute`, {
        auth: true,
        idempotent: true,
        body: {},
      });
      return r.ok ? treasuryState(ventureId) : r;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return client;
}

/** C1 public summary → view shape. HUMAN_VERIFIED from staging carries TESTED_IN_SIMULATOR. */
export function toPublic(p: C1Public): PublicOffchainEvidence {
  const envByWallet = new Map(p.founders.map((f) => [f.wallet.toLowerCase(), f.worldEnvironment]));
  const evidence: Evidence[] = p.events
    .filter((e) => KIND_MAP[e.kind])
    .map((e, i) => {
      const staging = e.source?.includes("staging");
      return {
        id: `${i}-${e.kind}`,
        ventureId: p.ventureId,
        kind: KIND_MAP[e.kind],
        label: e.label,
        status: e.status,
        ...(e.chainId ? { chainId: e.chainId } : {}),
        ...(e.txHash ? { txHash: e.txHash } : {}),
        ...(e.blockNumber !== undefined ? { blockNumber: e.blockNumber } : {}),
        confirmedAt: e.at,
        source: "API" as const,
        ...(staging ? { qualifier: "TESTED_IN_SIMULATOR" as const } : {}),
      };
    });
  return {
    ensName: p.ensName,
    ventureId: p.ventureId,
    humansVerified: p.humansVerified,
    founders: p.founders.map((f) => ({
      founderSubname: f.subname,
      wallet: f.wallet,
      worldProofStatus: f.humanVerified ? "VERIFIED" : "UNKNOWN",
      onchainSeatStatus: f.onchainSeatStatus,
      ...(f.attestationTxHash ? { attestationTxHash: f.attestationTxHash } : {}),
      ...(envByWallet.get(f.wallet.toLowerCase()) ? { worldEnvironment: envByWallet.get(f.wallet.toLowerCase()) } : {}),
    })),
    agreement: p.agreement
      ? {
          version: p.agreement.version,
          docHash: p.agreement.docHash,
          signaturesForCurrentVersion: p.agreement.signedBy.length,
          requiredSignatures: Math.max(p.agreement.requiredSigners, 2),
          complete: p.agreement.complete,
          ensRecordStatus: p.agreement.ensRecordStatus,
        }
      : undefined,
    evidence,
    source: "API",
  };
}

/** Tolerant mapping of X's readback; anything unrecognised stays UNKNOWN, never ACTIVE. */
export function toTreasuryState(raw: Record<string, unknown>): TreasuryState {
  const t = (raw.treasury ?? null) as Record<string, unknown> | null;
  const status = TREASURY_STATUSES.includes(t?.verificationStatus as TreasuryStatus) ? (t!.verificationStatus as TreasuryStatus) : "UNKNOWN";
  const treasury: Treasury | undefined =
    t && isAddr(t.safeAddress)
      ? {
          ventureId: t.ventureId as VentureId,
          safeAddress: t.safeAddress,
          chainId: WHITECHAIN_CHAIN_ID,
          ownerAddresses: Array.isArray(t.ownerAddresses) ? (t.ownerAddresses as Address[]) : [],
          threshold: Number(t.threshold) || 0,
          guardAddress: t.guardAddress as Address,
          registryAddress: t.registryAddress as Address,
          verificationStatus: status,
          deploymentTxHash: t.deploymentTxHash as Hex,
          ...(t.deploymentBlock !== undefined ? { deploymentBlock: String(t.deploymentBlock) } : {}),
        }
      : undefined;
  return {
    treasury,
    balanceRaw: typeof raw.balanceRaw === "string" ? raw.balanceRaw : undefined,
    tokenDecimals: typeof raw.tokenDecimals === "number" ? raw.tokenDecimals : undefined,
    payments: Array.isArray(raw.payments) ? (raw.payments as Payment[]) : [],
    deposits: Array.isArray(raw.deposits) ? (raw.deposits as TreasuryState["deposits"]) : [],
    evidence: Array.isArray(raw.evidence)
      ? (raw.evidence as Evidence[]).filter((e) => e && typeof e.kind === "string" && (!e.txHash || isHex32(e.txHash))).map((e) => ({ ...e, source: "API" as const }))
      : undefined,
    source: "API",
  };
}
