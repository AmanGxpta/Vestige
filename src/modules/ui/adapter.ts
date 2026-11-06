import type {
  Address,
  AgreementFields,
  Hex,
  PublicOffchainEvidence,
  TreasuryState,
  VentureDetail,
  VentureId,
  VentureSummary,
} from "./types";

/**
 * The only seam between C2's views and C1/X backends. Each method maps to one
 * route in docs/CONTRACTS.md v0 (noted per method). Views never import DB,
 * identity or treasury modules directly.
 */

export type AdapterErrorCode =
  /** Same World ID human already holds a seat in this venture (FR-2 negative path). */
  | "DUPLICATE_HUMAN"
  /** User closed the World ID / wallet prompt. Not an error state; nothing changed. */
  | "CANCELLED"
  | "NOT_A_FOUNDER"
  | "NOT_VERIFIED"
  | "INVITE_INVALID"
  | "WALLET_ALREADY_SEATED"
  | "SLUG_TAKEN"
  | "INVALID_INPUT"
  /** Precondition not met (e.g. deploy before 2 verified seats). */
  | "NOT_READY"
  /** Relayer simulation (eth_call) refused; nothing was submitted, no gas spent. */
  | "RELAYER_REFUSED"
  /** Contract endpoint not locked/implemented yet. Never shown as success. */
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

/** Proof material passed to C1's verify endpoint. Opaque to C2. */
export type WorldProofPayload = { kind: "idkit"; payload: unknown } | { kind: "dev-mock"; simulatedHumanId: string };

/** Typed-data signature produced by the user's wallet (founder keys never touch our backend). */
export type WalletSignature = { signer: Address; signature: Hex };

export type AdapterKind = "dev-mock" | "live";

export interface VestigeClient {
  readonly kind: AdapterKind;

  // ---- C1 identity --------------------------------------------------------
  /** POST /api/identity/ventures */
  createVenture(input: { displayName: string; slug: string; founderLabel: string; wallet: Address }): Promise<Result<VentureDetail>>;
  /** GET /api/identity/ventures/:id */
  getVenture(ventureId: VentureId, viewer?: Address): Promise<Result<VentureDetail>>;
  /** POST /api/identity/ventures/:id/join */
  joinVenture(ventureId: VentureId, input: { inviteCode: string; founderLabel: string; wallet: Address }): Promise<Result<VentureDetail>>;
  /** POST /api/identity/ventures/:id/world/verify */
  verifyWorld(ventureId: VentureId, input: { wallet: Address; proof: WorldProofPayload }): Promise<Result<VentureDetail>>;
  /** GET /api/identity/public/:ensName */
  getPublicEvidence(ensName: string): Promise<Result<PublicOffchainEvidence>>;
  /** NOT IN CONTRACT v0 — proposed CR-C2-001. */
  listVentures(): Promise<Result<VentureSummary[]>>;

  // ---- C1 agreements ------------------------------------------------------
  /** POST /api/agreements/ventures/:id/versions */
  createAgreementVersion(ventureId: VentureId, input: { fields: AgreementFields; wallet: Address }): Promise<Result<VentureDetail>>;
  /** POST /api/agreements/ventures/:id/sign */
  signAgreement(ventureId: VentureId, input: { version: number; docHash: Hex; sig: WalletSignature }): Promise<Result<VentureDetail>>;

  // ---- X treasury ---------------------------------------------------------
  /** GET /api/treasury/ventures/:id */
  getTreasury(ventureId: VentureId): Promise<Result<TreasuryState>>;
  /** POST /api/treasury/ventures/:id/deploy */
  deployTreasury(ventureId: VentureId, input: { wallet: Address }): Promise<Result<TreasuryState>>;
  /** POST /api/treasury/ventures/:id/fund */
  fundTreasury(ventureId: VentureId, input: { amountRaw: string; sig: WalletSignature }): Promise<Result<TreasuryState>>;
  /** POST /api/treasury/ventures/:id/payments */
  proposePayment(ventureId: VentureId, input: { recipient: Address; amountRaw: string; reason: string; wallet: Address }): Promise<Result<TreasuryState>>;
  /** POST /api/treasury/ventures/:id/payments/:pid/sign */
  signPayment(ventureId: VentureId, paymentId: string, input: { sig: WalletSignature }): Promise<Result<TreasuryState>>;
  /** POST /api/treasury/ventures/:id/payments/:pid/execute */
  executePayment(ventureId: VentureId, paymentId: string, input: { wallet: Address }): Promise<Result<TreasuryState>>;

  /** Subscribe to state changes (mock store / polling). Returns unsubscribe. */
  subscribe(listener: () => void): () => void;
}
