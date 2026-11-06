/**
 * World ID (IDKit 4.x) server side: RP-signed requests and proof verification.
 *
 * Verified against developer-portal source (main, 2026-11-06):
 *  - /api/v4/verify auto-creates unknown actions ("dynamic actions"), so a
 *    per-venture action string works without portal pre-registration.
 *  - The portal verifies against the CLIENT-SUPPLIED action and signal_hash and
 *    returns success:true for a reused nullifier. It does NOT enforce
 *    one-human-per-action. Therefore this module pins the action, recomputes the
 *    wallet signal hash, forwards exactly one Proof-of-Human response, and the
 *    caller's DB unique index is the sole duplicate-human gate.
 *  - World ID 3.0 and 4.0 nullifiers are produced by different schemes. Mixing
 *    them could let one human hold two seats, so ONE protocol version is pinned.
 */
import { signRequest } from "@worldcoin/idkit-core/signing";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { encodeAbiParameters, keccak256, type Address } from "viem";
import { fail, IdentityError } from "./errors";
import type { Bytes32 } from "./ids";

export type WorldEnvironment = "production" | "staging";
export type WorldProtocol = "4.0" | "3.0";

export interface WorldConfig {
  appId: string; // app_...
  rpId: string; // rp_...
  signingKeyHex: string; // server secret (env), never logged
  environment: WorldEnvironment;
  protocolVersion: WorldProtocol;
  verifyBaseUrl?: string; // default https://developer.world.org
  requestTtlSeconds?: number; // default 300
}

/** PRD hypothesis, now confirmed viable: one action per venture. */
export function worldAction(ventureId: Bytes32): string {
  return `vestige-founder-seat:${ventureId}`;
}

export interface WorldRequestParams {
  app_id: string;
  action: string;
  environment: WorldEnvironment;
  /** Signal to pass to the preset: the founder wallet (hex → hashed as raw bytes). */
  signal: Address;
  allow_legacy_proofs: boolean;
  /** "proofOfHuman" for 4.0, "orbLegacy" for 3.0. */
  preset: "proofOfHuman" | "orbLegacy";
  rp_context: { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string };
}

export function buildWorldRequest(cfg: WorldConfig, ventureId: Bytes32, wallet: Address): WorldRequestParams {
  const action = worldAction(ventureId);
  const sig = signRequest({ signingKeyHex: cfg.signingKeyHex, action, ttl: cfg.requestTtlSeconds ?? 300 });
  return {
    app_id: cfg.appId,
    action,
    environment: cfg.environment,
    signal: wallet,
    allow_legacy_proofs: cfg.protocolVersion === "3.0",
    preset: cfg.protocolVersion === "4.0" ? "proofOfHuman" : "orbLegacy",
    rp_context: { rp_id: cfg.rpId, nonce: sig.nonce, created_at: sig.createdAt, expires_at: sig.expiresAt, signature: sig.sig },
  };
}

const MAX_U256 = (1n << 256n) - 1n;

/** Canonical decimal string of a 256-bit nullifier given as hex or decimal. */
export function normalizeNullifier(v: unknown): string {
  if (typeof v !== "string" || !/^(0x[0-9a-fA-F]{1,64}|[0-9]{1,78})$/.test(v)) fail("WORLD_PROOF_INVALID", "Malformed proof.");
  const n = BigInt(v);
  if (n > MAX_U256) fail("WORLD_PROOF_INVALID", "Malformed proof.");
  return n.toString(10);
}

/**
 * CR-ID-04 (APPROVED): the ONLY nullifier-derived value that leaves C1.
 * `keccak256(abi.encode(uint256(worldNullifier)))`. The raw nullifier never enters
 * the chain, the public API or X. The digest is a public correlation value, not anonymity.
 */
export function nullifierHash(decimal: string): Bytes32 {
  return keccak256(encodeAbiParameters([{ type: "uint256" }], [BigInt(normalizeNullifier(decimal))]));
}

function sameField(a: string | undefined, b: string): boolean {
  try {
    return a !== undefined && BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
}

type AnyObj = Record<string, unknown>;

/** Selects the single Proof-of-Human response we accept for the pinned protocol. */
function pickHumanResponse(cfg: WorldConfig, responses: unknown): AnyObj {
  if (!Array.isArray(responses) || responses.length === 0) fail("WORLD_PROOF_INVALID", "Proof has no credential response.");
  const ok = (r: AnyObj) => {
    if (cfg.protocolVersion === "4.0") {
      if (r.identifier !== "proof_of_human") return false;
      // 1 = proof_of_human issuer; 128 = faux issuer the portal allows only in staging/sandbox.
      return r.issuer_schema_id === 1 || (cfg.environment === "staging" && r.issuer_schema_id === 128);
    }
    return r.identifier === "orb";
  };
  const hit = (responses as AnyObj[]).find((r) => r && typeof r === "object" && ok(r));
  if (!hit) fail("WORLD_PROOF_INVALID", "A World ID Proof of Human credential is required.");
  return hit;
}

export interface VerifiedHuman {
  nullifier: string; // decimal
  action: string;
  protocolVersion: WorldProtocol;
  environment: WorldEnvironment;
}

/**
 * Verifies an IDKit result for `wallet` taking a seat in `ventureId`.
 * `expectedNonce` must be the RP nonce this server issued (caller has consumed it).
 */
export async function verifyWorldProof(args: {
  cfg: WorldConfig;
  fetchImpl?: typeof fetch;
  ventureId: Bytes32;
  wallet: Address;
  expectedNonce: string;
  result: unknown;
}): Promise<VerifiedHuman> {
  const { cfg, ventureId, wallet, expectedNonce } = args;
  const r = args.result as AnyObj;
  if (!r || typeof r !== "object") fail("WORLD_PROOF_INVALID", "Missing World ID result.");
  if (r.protocol_version !== cfg.protocolVersion) fail("WORLD_PROTOCOL_MISMATCH", "Unsupported World ID protocol version for this app.");
  if (r.environment !== cfg.environment) fail("WORLD_ENVIRONMENT_MISMATCH", "World ID proof is from the wrong environment.");
  if ("session_id" in r && r.session_id !== undefined) fail("WORLD_PROOF_INVALID", "Session proofs are not accepted for seats.");
  const action = worldAction(ventureId);
  if (r.action !== action) fail("WORLD_ACTION_MISMATCH", "This proof was made for a different venture.");
  if (r.nonce !== expectedNonce) fail("WORLD_REQUEST_INVALID", "Proof does not match this verification request.");

  const item = pickHumanResponse(cfg, r.responses);
  const expectedSignal = hashSignal(wallet);
  if (!sameField(item.signal_hash as string | undefined, expectedSignal)) {
    fail("WORLD_SIGNAL_MISMATCH", "This proof is bound to a different wallet.");
  }
  const claimedNullifier = normalizeNullifier(item.nullifier);

  // Forward one response only, with the server's own action/environment/version.
  const body: AnyObj = {
    protocol_version: cfg.protocolVersion,
    min_protocol_version: cfg.protocolVersion,
    nonce: expectedNonce,
    action,
    environment: cfg.environment,
    responses: [item],
  };
  const url = `${cfg.verifyBaseUrl ?? "https://developer.world.org"}/api/v4/verify/${encodeURIComponent(cfg.rpId)}`;
  let res: Response;
  try {
    res = await (args.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new IdentityError("WORLD_UNAVAILABLE", "World ID verification service unreachable. Try again.");
  }
  let json: AnyObj | null = null;
  try {
    json = (await res.json()) as AnyObj;
  } catch {
    json = null;
  }
  if (res.status >= 500) fail("WORLD_UNAVAILABLE", "World ID verification service error. Try again.");
  if (!res.ok || !json || json.success !== true) fail("WORLD_PROOF_INVALID", "World ID could not verify this proof.");
  if (json.environment !== cfg.environment) fail("WORLD_ENVIRONMENT_MISMATCH", "World ID proof is from the wrong environment.");
  if (json.action !== undefined && json.action !== action) fail("WORLD_ACTION_MISMATCH", "This proof was made for a different venture.");
  if (json.protocol_version !== undefined && json.protocol_version !== cfg.protocolVersion) {
    fail("WORLD_PROTOCOL_MISMATCH", "Unsupported World ID protocol version for this app.");
  }
  const verifiedNullifier = normalizeNullifier(json.nullifier);
  if (verifiedNullifier !== claimedNullifier) fail("WORLD_PROOF_INVALID", "World ID returned an inconsistent result.");
  return { nullifier: verifiedNullifier, action, protocolVersion: cfg.protocolVersion, environment: cfg.environment };
}
