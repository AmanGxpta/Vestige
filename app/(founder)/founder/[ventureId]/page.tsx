"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdapterErrorNotice, Button, Card, Notice, StatusPill } from "@/components/ui";
import { SeatList } from "@/components/SeatList";
import { useVestige } from "@/src/modules/ui/provider";
import { seatFor } from "@/src/modules/ui/progress";
import { useAction } from "@/src/modules/ui/useAction";
import { useVenture } from "@/src/modules/ui/venture/VentureContext";
import type { VentureDetail } from "@/src/modules/ui/types";

/** Invite link: the single-use code rides in the URL fragment, which browsers never send to servers or Referer headers. */
function inviteLink(origin: string, ventureId: string, code: string, ensName: string) {
  return `${origin}/join/${ventureId}#code=${encodeURIComponent(code)}&name=${encodeURIComponent(ensName)}`;
}

export default function TeamPage() {
  const { venture, ventureId, refreshAll } = useVenture();
  const { address, client } = useVestige();
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const create = useAction<{ inviteCode: string }>();
  const listing = useAction<VentureDetail>();
  useEffect(() => setOrigin(window.location.origin), []);
  if (venture.status !== "ok") return null;
  const v = venture.data;
  const mySeat = seatFor(v, address);
  const full = v.seats.length >= 2;
  const myOptIn = !!address && !!v.listing?.optedIn.some((w) => w.toLowerCase() === address.toLowerCase());
  const inviteUrl = invite ? inviteLink(origin, ventureId, invite, v.ensName) : null;

  return (
    <>
      <Card title="Founders" testId="card-founders">
        <SeatList seats={v.seats} source={v.source} me={address} />
      </Card>

      {mySeat && !full && (
        <Card title="Invite your co-founder" testId="card-invite">
          {!inviteUrl ? (
            <div className="stack">
              <p className="small muted">
                Create a single-use link for your co-founder. Whoever opens it first with their wallet takes seat 2, so share it privately. It is shown once.
              </p>
              {create.error && <AdapterErrorNotice error={create.error} />}
              <div>
                <Button
                  loading={create.busy}
                  data-testid="invite-create"
                  onClick={async () => {
                    const r = await create.run(() => client.createInvite(v.ventureId, { wallet: address! }));
                    if (r) setInvite(r.inviteCode);
                  }}
                >
                  Create invite link
                </Button>
              </div>
            </div>
          ) : (
            <div className="stack">
              <Notice tone="warn" title="Copy it now">
                This link is shown once and works once. If you lose it, create a new one.
              </Notice>
              <div className="input-affix">
                <input className="input mono small" readOnly value={inviteUrl} data-testid="invite-url" aria-label="Invite link" />
                <button
                  type="button"
                  className="affix"
                  style={{ cursor: "pointer", fontFamily: "var(--sans)", fontWeight: 600 }}
                  onClick={() => navigator.clipboard?.writeText(inviteUrl).then(() => setCopied(true))}
                  data-testid="invite-copy"
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
          )}
        </Card>
      )}
      {full && (
        <Notice tone="success" title="Both seats are taken" testId="seats-full">
          Invite links for this venture no longer work.
        </Notice>
      )}

      {mySeat && (
        <Card title="Public venture list" testId="card-listing" actions={v.listing ? <StatusPill status={v.listing.listed ? "VERIFIED" : "NONE"} mock={v.source === "DEV_MOCK"}>{v.listing.listed ? "Listed" : "Not listed"}</StatusPill> : <StatusPill status="UNKNOWN">Status not reported</StatusPill>}>
          <div className="stack">
            <p className="small muted">
              Funders can browse ventures whose founders all agreed to be listed. The list shows only your venture name, ENS name and verification counts — no
              personal data, never the terms text. It is off by default and any founder can withdraw.
            </p>
            {v.listing ? (
              <span className="small">
                {v.listing.optedIn.length} of {v.seats.length} founders agreed{v.listing.listed ? "." : v.seats.length < 2 ? " · needs both founders." : " · waiting for the other founder."}
              </span>
            ) : (
              <span className="small faint">The API does not report listing consent yet; the toggle still sends your choice.</span>
            )}
            {listing.error && <AdapterErrorNotice error={listing.error} />}
            <div className="row">
              <Button
                variant={myOptIn ? "secondary" : "primary"}
                size="sm"
                loading={listing.busy}
                data-testid="listing-toggle"
                onClick={async () => {
                  const r = await listing.run(() => client.setListing(v.ventureId, { listed: !myOptIn, wallet: address! }));
                  if (r) refreshAll();
                }}
              >
                {myOptIn ? "Withdraw my consent" : "I agree to be listed"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {mySeat && (
        <div className="row">
          <Link className="btn" href={`/founder/${ventureId}/verify`} data-testid="next-verify">
            {mySeat.worldProofStatus === "VERIFIED" ? "View verification" : "Next: prove you're human →"}
          </Link>
          {!full && (
            <Button variant="secondary" disabledReason="Waiting for your co-founder to join.">
              Draft terms
            </Button>
          )}
        </div>
      )}
    </>
  );
}
