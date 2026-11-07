/**
 * Read-only Whitechain evidence for C1 seats after a SeatRegistry attestation:
 * receipt, the SeatAttested event's nullifierHash vs the hash C1 intended, and an
 * independent isSeat read. Labels each seat by basis (World digest vs MOCK_ONLY demo hash).
 */
import { parseAbi, parseEventLogs, type Address, type Hex, type PublicClient } from "viem";
import type { Bytes32 } from "../ids";
import type { VentureService } from "../ventures";

const registryAbi = parseAbi([
  "function isSeat(bytes32 ventureId, address wallet) view returns (bool)",
  "event SeatAttested(bytes32 indexed ventureId, address indexed wallet, bytes32 nullifierHash)",
]);

export async function attestationEvidence(ventures: VentureService, client: PublicClient, registry: Address, ventureIdInput: Bytes32) {
  const v = ventures.view(ventureIdInput);
  const block = await client.getBlockNumber();
  const seats = [];
  for (const s of v.seats) {
    const expected = ventures.expectedSeatHash(v.ventureId, s.wallet);
    const label = s.demoOverride ? "MOCK_ONLY demo override (not World ID)" : s.worldEnvironment === "staging" ? "HUMAN_VERIFIED + TESTED_IN_SIMULATOR" : s.worldProofStatus === "VERIFIED" ? "HUMAN_VERIFIED" : "NOT_VERIFIED";
    let receipt: { status: string; blockNumber: string; blockHash: Hex } | null = null;
    let eventHash: Hex | null = null;
    if (s.attestationTxHash) {
      const r = await client.getTransactionReceipt({ hash: s.attestationTxHash }).catch(() => null);
      if (r) {
        receipt = { status: r.status, blockNumber: r.blockNumber.toString(), blockHash: r.blockHash };
        const ev = parseEventLogs({ abi: registryAbi, logs: r.logs }).find((l) => l.address.toLowerCase() === registry.toLowerCase() && l.args.ventureId === v.ventureId && l.args.wallet.toLowerCase() === s.wallet);
        eventHash = ev?.args.nullifierHash ?? null;
      }
    }
    const isSeat = await client.readContract({ address: registry, abi: registryAbi, functionName: "isSeat", args: [v.ventureId, s.wallet] }).catch(() => null);
    seats.push({
      wallet: s.wallet, label: s.founderLabel, evidenceLabel: label,
      basis: expected?.basis ?? null, expectedSeatHash: expected?.seatHash ?? null,
      serverOnchainStatus: s.onchainSeatStatus, txHash: s.attestationTxHash ?? null, receipt,
      onchainEventHash: eventHash, eventHashMatchesExpected: eventHash !== null && eventHash === expected?.seatHash,
      isSeatAtLatest: isSeat,
    });
  }
  return { chainId: 1874, block: block.toString(), registry, ventureId: v.ventureId, ensName: v.ensName, seats };
}
