"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdapterErrorNotice, Button, Card, Notice, StatusPill } from "@/components/ui";
import { SeatList } from "@/components/SeatList";
import { useVestige } from "@/src/modules/ui/provider";
import { isTreasuryActive, seatFor, termsFullySigned, treasuryStatusText, verifiedSeats } from "@/src/modules/ui/progress";
import { Icon } from "@/components/brand";
import { useAction } from "@/src/modules/ui/useAction";
import { useVenture } from "@/src/modules/ui/venture/VentureContext";
import type { VentureDetail } from "@/src/modules/ui/types";

/** Invite link: the single-use code rides in the URL fragment, which browsers never send to servers or Referer headers. */
function inviteLink(origin: string, ventureId: string, code: string, ensName: string) {
  return `${origin}/join/${ventureId}#code=${encodeURIComponent(code)}&name=${encodeURIComponent(ensName)}`;
}

export default function TeamPage() {
  const { venture, ventureId, refreshAll, treasury } = useVenture();
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
  const myOptIn = !!address && !!v.listing?.consents.some((c) => c.listed && c.wallet.toLowerCase() === address.toLowerCase());
  const agreed = v.listing?.consents.filter((c) => c.listed).length ?? 0;
  const inviteUrl = invite ? inviteLink(origin, ventureId, invite, v.ensName) : null;

  return (
    <>
      <div className="stat-grid" data-testid="overview-stats">
        {[
          (() => {
            // CR-ID-06: override seats can act but are not humans — never counted here.
            const overrides = verifiedSeats(v).filter((s) => s.demoOverride).length;
            const vs = verifiedSeats(v).filter((s) => !s.demoOverride);
            const live = v.source !== "DEV_MOCK";
            const staging = live && vs.some((s) => s.worldEnvironment === "staging");
            const unreported = live && vs.some((s) => !s.worldEnvironment);
            // D-024: staging results are TESTED_IN_SIMULATOR and never prove two distinct real humans.
            const q = (staging ? " · TESTED IN SIMULATOR" : unreported && vs.length ? " · World env not reported" : "") + (overrides ? ` · ${overrides} demo override` : "");
            return { ok: vs.length >= 2 && !staging && !unreported && !overrides, icon: "users" as const, title: "Founders", sub: `${vs.length} / 2 verified${q}` };
          })(),
          { ok: termsFullySigned(v), icon: "file" as const, title: "Terms", sub: v.agreement ? (termsFullySigned(v) ? `v${v.agreement.version} signed by both` : `v${v.agreement.version} awaiting signatures`) : "Not drafted" },
          {
            ok: isTreasuryActive(treasury.data?.treasury),
            icon: "layers" as const,
            title: "Treasury",
            sub: treasury.status === "error" ? "Unavailable" : treasuryStatusText(treasury.data?.treasury),
          },
        ].map((s) => (
          <div key={s.title} className="stat">
            <span className={`ring${s.ok ? "" : " ring-muted"}`}>
              <Icon name={s.ok ? "check" : s.icon} size={17} />
            </span>
            <span>
              <strong>{s.title}</strong>
              <span>
                {s.sub}
                {s.ok && v.source === "DEV_MOCK" ? " · MOCK" : ""}
              </span>
            </span>
          </div>
        ))}
      </div>

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
              Funders can browse ventures whose founders all agreed to be listed. The list shows only your venture name, ENS name and verification counts. No
              personal data, never the terms text. It is off by default and any founder can withdraw.
            </p>
            {v.listing ? (
              <span className="small">
                {agreed} of {v.seats.length} founders agreed{v.listing.listed ? "." : v.seats.length < 2 ? " · needs both founders." : " · waiting for the other founder."}
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
