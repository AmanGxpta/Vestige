import type { TypedDataDefinition } from "viem";
import type { FoundingTermsInput } from "./agreement/terms";
import type { Address, Hex, PublicOffchainEvidence, TreasuryState, VentureDetail, VentureId, VentureSummary, WorldEnvironment } from "./types";

/**
 * The only seam between C2's views and C1/X backends. Each method maps to one
 * route in docs/CONTRACTS.md v0 @ 30d1ef6 (noted per method). Views never import
 * DB, identity or treasury modules directly.
 */

export type AdapterErrorCode =
  /** Same World ID human already holds a seat in this venture (FR-2 negative path). */
  | "DUPLICATE_HUMAN"
  /** User closed the World ID / wallet prompt. Not an error state; nothing changed. */
  | "CANCELLED"
  /** No wallet session; the user must sign in (EIP-4361-style challenge). */
  | "UNAUTHENTICATED"
  | "NOT_A_FOUNDER"
  | "NOT_VERIFIED"
  | "INVITE_INVALID"
  | "WALLET_ALREADY_SEATED"
  | "SLUG_TAKEN"
  | "INVALID_INPUT"
  /** Terms changed since the user opened them. */
  | "VERSION_SUPERSEDED"
  /** Precondition not met (e.g. deploy before 2 verified seats). */
  | "NOT_READY"
  /** Relayer simulation (eth_call) refused; nothing was submitted, no gas spent. */
  | "RELAYER_REFUSED"
  /** Wallet is on the wrong network / account; actionable, nothing was signed. */
  | "WALLET"
  /** Route not deployed / dependency not configured yet. Never shown as success. */
  | "BLOCKED"
  | "NETWORK"
  | "NOT_FOUND";

export type AdapterError = { code: AdapterErrorCode; message: string; detail?: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: AdapterError };

export const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
export const err = <T = never,>(code: AdapterErrorCode, message: string, detail?: string): Result<T> => ({
  ok: false,
  error: { code, message, detail },
});

/** C1 `WorldRequestParams` (server-pinned action/signal/environment/protocol; RP-signed). */
export type WorldRequestParams = {
  app_id: string;
  action: string;
  environment: WorldEnvironment;
  signal: Address;
  allow_legacy_proofs: boolean;
  preset: "proofOfHuman" | "orbLegacy";
  rp_context: { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string };
};
export type WorldRequest = { kind: "dev-mock" } | { kind: "idkit"; params: WorldRequestParams };
/** Proof material passed to C1's verify endpoint. Opaque to C2. */
export type WorldProofPayload = { kind: "idkit"; result: unknown } | { kind: "dev-mock"; simulatedHumanId: string };

/**
 * Asks the user's wallet to sign exact EIP-712 typed data. Resolves null if the user
 * cancels. The page binds the plain-language prompt; the adapter supplies the bytes.
 */
export type TypedDataSigner = (typedData: TypedDataDefinition) => Promise<Hex | null>;
/** personal_sign for the sign-in challenge. Resolves null if the user cancels. */
export type MessageSigner = (message: string) => Promise<Hex | null>;

export type AdapterKind = "dev-mock" | "live";

export interface VestigeClient {
  readonly kind: AdapterKind;

  // ---- C1 wallet session ---------------------------------------------------
  /** Wallet that holds the in-memory session, if any. */
  sessionWallet(): Address | null;
  /** POST /api/identity/auth/challenge → personal_sign → POST /api/identity/auth/session */
  signIn(wallet: Address, sign: MessageSigner): Promise<Result<{ wallet: Address; expiresAt: string }>>;
  /** DELETE /api/identity/auth/session; always clears the in-memory token. */
  signOut(): Promise<void>;

  // ---- C1 identity --------------------------------------------------------
  /** POST /api/identity/ventures */
  createVenture(input: { displayName: string; slug: string; founderLabel: string; wallet: Address }): Promise<Result<VentureDetail>>;
  /** GET /api/identity/ventures/:id (founders only) */
  getVenture(ventureId: VentureId, viewer?: Address): Promise<Result<VentureDetail>>;
  /** POST /api/identity/ventures/:id/invites — single-use token, returned once */
  createInvite(ventureId: VentureId, input: { wallet: Address }): Promise<Result<{ inviteCode: string }>>;
  /** POST /api/identity/ventures/:id/join */
  joinVenture(ventureId: VentureId, input: { inviteCode: string; founderLabel: string; wallet: Address }): Promise<Result<VentureDetail>>;
  /** POST /api/identity/ventures/:id/world/request */
  requestWorld(ventureId: VentureId, input: { wallet: Address }): Promise<Result<WorldRequest>>;
  /** POST /api/identity/ventures/:id/world/verify */
  verifyWorld(ventureId: VentureId, input: { wallet: Address; proof: WorldProofPayload }): Promise<Result<VentureDetail>>;
  /** GET /api/identity/public/:ensName — off-chain evidence only */
  getPublicEvidence(ensName: string): Promise<Result<PublicOffchainEvidence>>;
  /** GET /api/identity/ventures — founder-consented summaries (CR-C2-001) */
  listVentures(): Promise<Result<VentureSummary[]>>;
  /** POST /api/identity/ventures/:id/listing { listed } (CR-C2-001) */
  setListing(ventureId: VentureId, input: { listed: boolean; wallet: Address }): Promise<Result<VentureDetail>>;

  // ---- C1 agreements ------------------------------------------------------
  /** POST /api/agreements/ventures/:id/versions */
  createAgreementVersion(ventureId: VentureId, input: { terms: FoundingTermsInput; wallet: Address }): Promise<Result<VentureDetail>>;
  /** GET /api/agreements/ventures/:id/sign → wallet EIP-712 → POST /api/agreements/ventures/:id/sign */
  signAgreement(ventureId: VentureId, input: { version: number; docHash: Hex; wallet: Address }, sign: TypedDataSigner): Promise<Result<VentureDetail>>;

  // ---- X treasury ---------------------------------------------------------
  /** GET /api/treasury/ventures/:id */
  getTreasury(ventureId: VentureId): Promise<Result<TreasuryState>>;
  /** POST /api/treasury/ventures/:id/deploy {} */
  deployTreasury(ventureId: VentureId, input: { wallet: Address }): Promise<Result<TreasuryState>>;
  /** EIP-3009 authorization → POST /api/treasury/ventures/:id/fund */
  fundTreasury(ventureId: VentureId, input: { from: Address; to: Address; amountRaw: string }, sign: TypedDataSigner): Promise<Result<TreasuryState>>;
  /** POST /api/treasury/ventures/:id/payments { recipient, amountRaw, reason } */
  proposePayment(ventureId: VentureId, input: { recipient: Address; amountRaw: string; reason: string; wallet: Address }): Promise<Result<TreasuryState>>;
  /** Safe typed data from the proposal → POST /api/treasury/ventures/:id/payments/:pid/sign { signature } */
  signPayment(ventureId: VentureId, paymentId: string, input: { wallet: Address }, sign: TypedDataSigner): Promise<Result<TreasuryState>>;
  /** POST /api/treasury/ventures/:id/payments/:pid/execute {} */
  executePayment(ventureId: VentureId, paymentId: string, input: { wallet: Address }): Promise<Result<TreasuryState>>;

  /** Subscribe to state changes (mock store / session changes). Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
}
