/**
 * Cross-workstream seams. C1 depends on these interfaces only; X implements
 * SeatAttestationPort in src/modules/treasury (PROPOSED — CR-ID-03), and the
 * ENS port is implemented here by ViemEnsRegistrar.
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

export interface SeatAttestationPort {
  /** SeatRegistry.attestSeat(ventureId, wallet, nullifierHash) on Whitechain 1874. */
  attestSeat(input: { ventureId: Bytes32; wallet: Address; nullifierHash: Bytes32 }): Promise<{ txHash: Hex; chainId: number }>;
  /** Receipt + SeatRegistry.isSeat(ventureId, wallet) read-back. */
  confirm(input: { ventureId: Bytes32; wallet: Address; txHash: Hex }): Promise<ChainConfirmation>;
}

export interface EnsVentureRecords {
  status?: "workspace";
  humans?: number;
  agreementHash?: Hex;
  guard?: Address;
  /** Whitechain Safe → addr(node, 2147485522) */
  treasury?: Address;
}

export interface EnsPort {
  /** Creates <slug>.vestige.eth with its own registry + resolver; sets vestige.status=workspace. */
  registerVenture(input: { slug: string }): Promise<{ txHashes: Hex[] }>;
  /** Creates <label>.<slug>.vestige.eth owned by `wallet`, non-transferable, own resolver. */
  registerFounder(input: { slug: string; label: string; wallet: Address }): Promise<{ txHashes: Hex[] }>;
  setVentureRecords(input: { slug: string; records: EnsVentureRecords }): Promise<{ txHashes: Hex[] }>;
  /** Receipt(s) + Universal Resolver read-back of the expected values. */
  confirm(input: { txHashes: Hex[]; check: () => Promise<boolean> }): Promise<ChainConfirmation>;
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
  async confirm(): Promise<ChainConfirmation> {
    return { state: "FAILED", reason: `${this.what} not configured` };
  }
}
