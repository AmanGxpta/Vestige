"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdapterErrorNotice, Button, Card, Field, LoadingCard, Notice, SignInNotice } from "@/components/ui";
import { ADAPTER_KIND } from "@/src/modules/ui/config";
import { isValidSlug } from "@/src/modules/ui/format";
import { useAdapterQuery, useVestige } from "@/src/modules/ui/provider";
import { useAction } from "@/src/modules/ui/useAction";
import type { VentureDetail, VentureId } from "@/src/modules/ui/types";

/** Invite material lives in the URL fragment (never sent to servers). `name` is display-only until the API confirms. */
function readFragment(): { code: string; name: string } {
  if (typeof window === "undefined") return { code: "", name: "" };
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return { code: h.get("code") ?? "", name: h.get("name") ?? "" };
}

export default function JoinPage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const router = useRouter();
  const { client, address, sessionWallet } = useVestige();
  const [label, setLabel] = useState("");
  const [frag, setFrag] = useState<{ code: string; name: string } | null>(null);
  const action = useAction<VentureDetail>();
  useEffect(() => setFrag(readFragment()), []);
  // Founders-only read: works for an existing seat-holder; a not-yet-joined founder falls back to the invite link's name.
  const venture = useAdapterQuery((c) => c.getVenture(ventureId as VentureId, address), [ventureId, address, sessionWallet]);

  if (!frag || venture.status === "loading") return <LoadingCard />;
  const v = venture.status === "ok" ? venture.data : undefined;
  const ensName = v?.ensName ?? (/^[a-z0-9-]+\.vestige\.eth$/.test(frag.name) ? frag.name : "this venture");
  const already = !!v && v.seats.some((s) => address && s.wallet.toLowerCase() === address.toLowerCase());
  const labelError = label && !isValidSlug(label) ? "3–32 lowercase letters, digits or hyphens." : null;
  const needsSignIn = ADAPTER_KIND === "live" && address && (!sessionWallet || sessionWallet.toLowerCase() !== address.toLowerCase());

  return (
    <div className="stack-lg" style={{ maxWidth: 640 }}>
      <div className="stack">
        <span className="eyebrow">Founder B · invitation</span>
        <h1>Join {v?.displayName ?? <span className="mono">{ensName}</span>}</h1>
        <p className="lead">
          You&apos;ve been invited to take the second founder seat of <span className="mono">{ensName}</span>
          {!v && ensName !== "this venture" && <span className="small muted"> (name from the invite link; confirmed when you join)</span>}. Next you&apos;ll prove
          you&apos;re a unique human and sign the founding terms. You won&apos;t need gas or a seed phrase.
        </p>
      </div>
      <Notice tone="legal" title="Workspace · not legally incorporated" />
      {!frag.code && <Notice tone="error" title="This link is missing its invite code." testId="join-missing-code" />}
      {venture.status === "error" && !["UNAUTHENTICATED", "NOT_A_FOUNDER", "NOT_FOUND"].includes(venture.error.code) && <AdapterErrorNotice error={venture.error} />}
      {already ? (
        <Notice tone="success" title="You already hold a seat in this venture.">
          <a href={`/founder/${ventureId}/verify`}>Continue to verification →</a>
        </Notice>
      ) : needsSignIn ? (
        <SignInNotice message="Sign in with the wallet that will hold seat 2" />
      ) : (
        <Card testId="join-card">
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!address) return;
              const r = await action.run(() => client.joinVenture(ventureId as VentureId, { inviteCode: frag.code, founderLabel: label, wallet: address }));
              if (r) router.push(`/founder/${r.ventureId}/verify`);
            }}
          >
            <Field
              label="Your founder name"
              htmlFor="j-label"
              error={labelError}
              hint={label && !labelError ? <>Your seat: <span className="mono">{label}.{ensName}</span></> : "A short public handle, not your legal name."}
            >
              <input id="j-label" className="input mono" value={label} onChange={(e) => setLabel(e.target.value.toLowerCase())} placeholder="ravi" data-testid="join-label-input" />
            </Field>
            {action.error && <AdapterErrorNotice error={action.error} />}
            <div>
              <Button
                type="submit"
                loading={action.busy}
                data-testid="join-submit"
                disabledReason={
                  !address
                    ? ADAPTER_KIND === "dev-mock"
                      ? "Pick “Founder B” in “Acting as” (top right)."
                      : "Connect a wallet first (top right)."
                    : !frag.code
                      ? "Invite code missing."
                      : !label || labelError
                        ? "Choose a founder name."
                        : null
                }
              >
                Accept seat
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
