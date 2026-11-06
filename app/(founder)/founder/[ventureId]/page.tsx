"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, Notice } from "@/components/ui";
import { SeatList } from "@/components/SeatList";
import { useVestige } from "@/src/modules/ui/provider";
import { seatFor } from "@/src/modules/ui/progress";
import { useVenture } from "@/src/modules/ui/venture/VentureContext";

export default function TeamPage() {
  const { venture, ventureId } = useVenture();
  const { address } = useVestige();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);
  if (venture.status !== "ok") return null;
  const v = venture.data;
  const mySeat = seatFor(v, address);
  const inviteUrl = v.invite ? `${origin}/join/${ventureId}?code=${v.invite.code}` : null;

  return (
    <>
      <Card title="Founders" testId="card-founders">
        <SeatList seats={v.seats} source={v.source} me={address} />
      </Card>

      {v.invite ? (
        <Card title="Invite your co-founder" testId="card-invite">
          {v.invite.used ? (
            <Notice tone="success" title="Invite accepted">
              Your co-founder has taken seat 2. The link no longer works.
            </Notice>
          ) : (
            <div className="stack">
              <p className="small muted">Send this single-use link to your co-founder. Whoever opens it first with their wallet takes seat 2, so share it privately.</p>
              <div className="input-affix">
                <input className="input mono small" readOnly value={inviteUrl ?? ""} data-testid="invite-url" aria-label="Invite link" />
                <button
                  type="button"
                  className="affix"
                  style={{ cursor: "pointer", fontFamily: "var(--sans)", fontWeight: 600 }}
                  onClick={() => inviteUrl && navigator.clipboard?.writeText(inviteUrl).then(() => setCopied(true))}
                  data-testid="invite-copy"
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        v.seats.length < 2 && <Notice tone="info">Only the founder who created this venture can see the invite link.</Notice>
      )}

      {mySeat && (
        <div className="row">
          <Link className="btn" href={`/founder/${ventureId}/verify`} data-testid="next-verify">
            {mySeat.worldProofStatus === "VERIFIED" ? "View verification" : "Next: prove you're human →"}
          </Link>
          {v.seats.length < 2 && <Button variant="secondary" disabledReason="Waiting for your co-founder to join." >Draft terms</Button>}
        </div>
      )}
    </>
  );
}
