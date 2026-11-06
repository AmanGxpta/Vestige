"use client";

import { EvidenceBadge, HashLink, StatusPill } from "./ui";
import type { FounderSeat, DataSource, Address } from "@/src/modules/ui/types";
import { shortHex } from "@/src/modules/ui/format";

const worldText: Record<string, string> = { VERIFIED: "Human verified", PENDING: "Verifying", FAILED: "Refused", UNKNOWN: "Not verified" };
const chainText: Record<string, string> = { VERIFIED: "Seat attested", PENDING: "Attesting on Whitechain", FAILED: "Attestation failed", UNKNOWN: "Not attested" };

export function SeatList({ seats, source, me }: { seats: FounderSeat[]; source: DataSource; me?: Address }) {
  return (
    <div className="table-wrap">
      <table className="table" data-testid="seat-list">
        <thead>
          <tr>
            <th>Founder seat</th>
            <th>World ID</th>
            <th>On-chain seat (Whitechain)</th>
          </tr>
        </thead>
        <tbody>
          {seats.map((s) => (
            <tr key={s.wallet} data-testid="seat-row" data-world={s.worldProofStatus} data-chain={s.onchainSeatStatus}>
              <td>
                <div className="stack-sm" style={{ gap: 2 }}>
                  <span className="mono small">{s.founderSubname}</span>
                  <span className="tiny faint mono">
                    {shortHex(s.wallet)} {me && s.wallet.toLowerCase() === me.toLowerCase() && <strong style={{ color: "var(--accent)" }}>· you</strong>}
                  </span>
                </div>
              </td>
              <td>
                {s.worldProofStatus === "VERIFIED" ? (
                  <EvidenceBadge label="HUMAN_VERIFIED" source={source} />
                ) : (
                  <StatusPill status={s.worldProofStatus === "UNKNOWN" ? "NONE" : s.worldProofStatus}>{worldText[s.worldProofStatus]}</StatusPill>
                )}
              </td>
              <td>
                <div className="row" style={{ gap: 8 }}>
                  <StatusPill status={s.onchainSeatStatus === "UNKNOWN" ? "NONE" : s.onchainSeatStatus}>{chainText[s.onchainSeatStatus]}</StatusPill>
                  {s.attestationTxHash && <HashLink value={s.attestationTxHash} chainId={1874} source={source} />}
                </div>
              </td>
            </tr>
          ))}
          {seats.length < 2 && (
            <tr>
              <td colSpan={3} className="muted small">
                Seat 2 is empty — waiting for your co-founder to accept the invite.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
