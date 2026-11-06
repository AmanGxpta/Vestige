"use client";

import Link from "next/link";
import { AdapterErrorNotice, Button, Card, HashLink, Notice, StatusPill } from "@/components/ui";
import { SeatList } from "@/components/SeatList";
import { ADAPTER_KIND } from "@/src/modules/ui/config";
import { useVestige } from "@/src/modules/ui/provider";
import { attestedSeats, seatFor } from "@/src/modules/ui/progress";
import { useAction } from "@/src/modules/ui/useAction";
import { useVenture } from "@/src/modules/ui/venture/VentureContext";
import type { VentureDetail } from "@/src/modules/ui/types";

export default function VerifyPage() {
  const { venture, ventureId, refreshAll } = useVenture();
  const { client, address, requestWorldProof } = useVestige();
  const action = useAction<VentureDetail>();
  if (venture.status !== "ok") return null;
  const v = venture.data;
  const seat = seatFor(v, address);
  const duplicate = action.error?.code === "DUPLICATE_HUMAN";

  const verify = async () => {
    if (!address) return;
    const r = await action.run(async () => {
      const proof = await requestWorldProof({ ventureName: v.displayName, wallet: address });
      if (!proof) return null;
      return client.verifyWorld(v.ventureId, { wallet: address, proof });
    });
    if (r) refreshAll();
  };

  const disabledReason = !seat
    ? "Only a founder with a pending seat can verify."
    : ADAPTER_KIND !== "dev-mock"
      ? "World ID (IDKit) is rendered from C1's identity module — not connected yet."
      : null;

  return (
    <>
      <Card title="Prove you're a unique human" testId="card-verify">
        <div className="stack">
          <p>
            A 2-of-2 treasury only protects a funder if the two signers are <strong>two different people</strong>. Before you take a seat, you prove
            with World ID that you haven&apos;t already taken one in {v.displayName}.
          </p>
          <div className="grid-2 small">
            <div className="stack-sm">
              <strong>Why Proof of Human — and nothing more</strong>
              <span className="muted">
                The question is &ldquo;are these two distinct people?&rdquo;, not &ldquo;who are they?&rdquo;. Proof of Human answers exactly that. A
                passport check would collect far more personal data than this needs.
              </span>
            </div>
            <div className="stack-sm">
              <strong>What becomes public</strong>
              <span className="muted">Only that seat {seat ? <span className="mono">{seat.founderSubname}</span> : "this seat"} is held by a verified unique human. No name, no document, no raw nullifier.</span>
            </div>
          </div>

          {seat?.worldProofStatus === "VERIFIED" ? (
            <div className="stack">
              <Notice tone="success" title="You're verified as a unique human" testId="verify-success">
                The vestige server checked your World ID proof for this venture.
              </Notice>
              <div className="row">
                <span className="small">Seat on Whitechain:</span>
                <StatusPill status={seat.onchainSeatStatus}>{seat.onchainSeatStatus === "VERIFIED" ? "Attested in SeatRegistry" : seat.onchainSeatStatus === "PENDING" ? "Attesting…" : "Not attested"}</StatusPill>
                {seat.attestationTxHash && <HashLink value={seat.attestationTxHash} chainId={1874} source={v.source} />}
              </div>
              <p className="tiny faint">
                World ID verification (off-chain, HUMAN_VERIFIED) and the SeatRegistry attestation (on-chain, CHAIN_VERIFIED) are separate facts. The
                treasury only accepts wallets with both.
              </p>
            </div>
          ) : (
            <div className="stack">
              {duplicate && (
                <div className="notice notice-error" role="alert" data-testid="duplicate-refusal" style={{ padding: 18 }}>
                  <span aria-hidden style={{ fontSize: 22, lineHeight: 1 }}>✕</span>
                  <div className="notice-body">
                    <strong style={{ fontSize: 17 }}>{action.error!.message}</strong>
                    <span>The seat stays empty. One person can&apos;t hold both seats, even with a different wallet.</span>
                    <span className="small">The same person can still found a different venture.</span>
                  </div>
                </div>
              )}
              {action.cancelled && (
                <Notice tone="info" title="Verification cancelled" testId="verify-cancelled">
                  Nothing changed. Your seat is waiting — verify whenever you&apos;re ready.
                </Notice>
              )}
              {action.error && !duplicate && <AdapterErrorNotice error={action.error} />}
              <div>
                <Button onClick={verify} loading={action.busy} disabledReason={disabledReason} data-testid="verify-start">
                  {duplicate || action.cancelled ? "Try again" : "Verify with World ID"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="Seats" testId="card-seats">
        <SeatList seats={v.seats} source={v.source} me={address} />
      </Card>

      {attestedSeats(v).length >= 2 && (
        <div className="row">
          <Link className="btn" href={`/founder/${ventureId}/terms`} data-testid="next-terms">
            Next: founding terms →
          </Link>
        </div>
      )}
    </>
  );
}
