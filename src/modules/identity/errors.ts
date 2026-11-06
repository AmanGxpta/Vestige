/**
 * Typed identity/agreement errors. `code` is a stable machine string for C2;
 * `message` is safe to show users (never contains nullifiers, keys or PII).
 */
export type IdentityErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SLUG_INVALID"
  | "SLUG_TAKEN"
  | "LABEL_INVALID"
  | "LABEL_TAKEN"
  | "CHALLENGE_INVALID"
  | "SIGNATURE_INVALID"
  | "INVITE_INVALID"
  | "ALREADY_SEATED"
  | "VENTURE_FULL"
  | "WORLD_REQUEST_INVALID"
  | "WORLD_PROOF_INVALID"
  | "WORLD_PROTOCOL_MISMATCH"
  | "WORLD_ENVIRONMENT_MISMATCH"
  | "WORLD_ACTION_MISMATCH"
  | "WORLD_SIGNAL_MISMATCH"
  | "WORLD_UNAVAILABLE"
  | "ALREADY_VERIFIED"
  | "DUPLICATE_HUMAN"
  | "NOT_VERIFIED_FOUNDER"
  | "AGREEMENT_INVALID"
  | "VERSION_SUPERSEDED"
  | "NONCE_REUSED"
  | "SIGNATURE_EXPIRED"
  | "ALREADY_SIGNED"
  | "CONFIG_MISSING";

const STATUS: Record<IdentityErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SLUG_INVALID: 400,
  SLUG_TAKEN: 409,
  LABEL_INVALID: 400,
  LABEL_TAKEN: 409,
  CHALLENGE_INVALID: 401,
  SIGNATURE_INVALID: 401,
  INVITE_INVALID: 403,
  ALREADY_SEATED: 409,
  VENTURE_FULL: 409,
  WORLD_REQUEST_INVALID: 400,
  WORLD_PROOF_INVALID: 400,
  WORLD_PROTOCOL_MISMATCH: 400,
  WORLD_ENVIRONMENT_MISMATCH: 400,
  WORLD_ACTION_MISMATCH: 400,
  WORLD_SIGNAL_MISMATCH: 400,
  WORLD_UNAVAILABLE: 502,
  ALREADY_VERIFIED: 409,
  DUPLICATE_HUMAN: 409,
  NOT_VERIFIED_FOUNDER: 403,
  AGREEMENT_INVALID: 400,
  VERSION_SUPERSEDED: 409,
  NONCE_REUSED: 409,
  SIGNATURE_EXPIRED: 400,
  ALREADY_SIGNED: 409,
  CONFIG_MISSING: 503,
};

export class IdentityError extends Error {
  readonly code: IdentityErrorCode;
  readonly status: number;
  constructor(code: IdentityErrorCode, message: string) {
    super(message);
    this.name = "IdentityError";
    this.code = code;
    this.status = STATUS[code];
  }
}

export function fail(code: IdentityErrorCode, message: string): never {
  throw new IdentityError(code, message);
}
