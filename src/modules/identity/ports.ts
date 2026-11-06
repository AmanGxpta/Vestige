/**
 * Cross-workstream seams. C1 depends on these interfaces only; X implements
 * SeatAttestationPort in src/modules/treasury (CONTRACTS v0 @30d1ef6, CR-ID-03
 * APPROVED), and the ENS port is implemented here by ViemEnsRegistrar.
 *
 * Contract: a port's submit returns a tx hash; `confirm` reports CONFIRMED only
 * after a successful receipt AND an independent state read-back.
 */
import type { Address, Hex } from "viem";
import type { Bytes32 } from "./ids";

export type ChainConfirmation =
  | { state: "PENDING" }
  | { state: "CONFIRMED"; chainId: number; blockNumber: bigint; confirmedAt: number }
  | { state: "FAILED"; reason: string };

/** Verbatim CONTRACTS v0 `SeatAttestationPort` (Whitechain 1874 literal types). */
export type SeatConfirmation =
  | { state: "PENDING" }
  | { state: "CONFIRMED"; chainId: 1874; blockNumber: bigint; confirmedAt: number }
  | { state: "FAILED"; reason: string };

export interface SeatAttestationPort {
  /** SeatRegistry attestation on Whitechain 1874. nullifierHash = keccak256(abi.encode(uint256 rawNullifier)). */
  attestSeat(input: { ventureId: `0x${string}`; wallet: `0x${string}`; nullifierHash: `0x${string}` }): Promise<{ txHash: `0x${string}`; chainId: 1874 }>;
  /** CONFIRMED only after a successful receipt + independent SeatRegistry.isSeat(ventureId, wallet) read at/after it. */
  confirm(input: { ventureId: `0x${string}`; wallet: `0x${string}`; txHash: `0x${string}` }): Promise<SeatConfirmation>;
}

const TX_HASH = /^0x[0-9a-f]{64}$/i;

/**
 * C1-side defence in depth: whatever X's adapter returns is validated before it
 * changes seat state. Anything off-contract is treated as a failure, never success.
 */
export function checkAttestSubmit(r: unknown): { txHash: Hex; chainId: 1874 } {
  const o = r as { txHash?: unknown; chainId?: unknown } | null;
  if (!o || typeof o.txHash !== "string" || !TX_HASH.test(o.txHash)) throw new Error("attester returned a malformed txHash");
  if (o.chainId !== 1874) throw new Error(`attester returned chainId ${String(o.chainId)}, expected 1874`);
  return { txHash: o.txHash.toLowerCase() as Hex, chainId: 1874 };
}

export function checkSeatConfirmation(c: unknown): SeatConfirmation {
  const o = c as Record<string, unknown> | null;
  if (o?.state === "PENDING") return { state: "PENDING" };
  if (o?.state === "FAILED") return { state: "FAILED", reason: typeof o.reason === "string" ? o.reason.slice(0, 200) : "attester failure" };
  if (o?.state === "CONFIRMED") {
    if (o.chainId !== 1874) return { state: "FAILED", reason: `confirmation chainId ${String(o.chainId)}, expected 1874` };
    if (typeof o.blockNumber !== "bigint" || o.blockNumber <= 0n) return { state: "FAILED", reason: "confirmation without a block number" };
    if (typeof o.confirmedAt !== "number" || !Number.isSafeInteger(o.confirmedAt) || o.confirmedAt <= 0) return { state: "FAILED", reason: "confirmation without confirmedAt (unix ms)" };
    return { state: "CONFIRMED", chainId: 1874, blockNumber: o.blockNumber, confirmedAt: o.confirmedAt };
  }
  return { state: "FAILED", reason: "attester returned an unknown state" };
}

export interface EnsVentureRecords {
  status?: "workspace";
  /** CR-C2-002: byte-identical server ventureId, text key `vestige.ventureId`. */
  ventureId?: Bytes32;
  humans?: number;
  agreementHash?: Hex;
  guard?: Address;
  /** Whitechain Safe → addr(node, 2147485522) */
  treasury?: Address;
}

export interface EnsPort {
  /** Creates <slug>.vestige.eth with its own registry + resolver; sets vestige.status=workspace, vestige.ventureId, vestige.humans=0. */
  registerVenture(input: { slug: string; ventureId: Bytes32 }): Promise<{ txHashes: Hex[] }>;
  /** Creates <label>.<slug>.vestige.eth owned by `wallet`, non-transferable, own resolver. */
  registerFounder(input: { slug: string; label: string; wallet: Address }): Promise<{ txHashes: Hex[] }>;
  setVentureRecords(input: { slug: string; records: EnsVentureRecords }): Promise<{ txHashes: Hex[] }>;
  /** Receipt(s) + Universal Resolver read-back of the expected values. */
  confirm(input: { txHashes: Hex[]; check: () => Promise<boolean> }): Promise<ChainConfirmation>;
}

/**
 * PROPOSED CR-ID-05 (not in CONTRACTS v0): X's read-only treasury summary used to
 * fill `treasuryActive`/`funded` in the public list. Until H approves it, C1
 * registers nothing and those fields stay null ("unknown").
 */
export interface TreasurySummaryPort {
  summary(ventureId: `0x${string}`): Promise<{
    treasuryActive: boolean | null;
    funded: boolean | null;
    observedAt: string;
    source: string;
    verificationStatus: "UNKNOWN" | "PENDING" | "ACTIVE" | "UNVERIFIED" | "FAILED";
  }>;
}

/** Fail-closed port used when config/keys are absent: never fakes success. */
export class UnconfiguredPort implements SeatAttestationPort, EnsPort {
  constructor(private what: string) {}
  private err(): never {
    throw new Error(`${this.what} is not configured (missing env). Status stays UNVERIFIED.`);
  }
  attestSeat(): never { return this.err(); }
  registerVenture(): never { return this.err(); }
  registerFounder(): never { return this.err(); }
  setVentureRecords(): never { return this.err(); }
  async confirm(): Promise<{ state: "FAILED"; reason: string }> {
    return { state: "FAILED", reason: `${this.what} not configured` };
  }
}
