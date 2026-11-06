"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { AdapterErrorNotice, Button, Card, Field, LoadingCard, Notice } from "@/components/ui";
import { ADAPTER_KIND } from "@/src/modules/ui/config";
import { isValidSlug } from "@/src/modules/ui/format";
import { useAdapterQuery, useVestige } from "@/src/modules/ui/provider";
import { useAction } from "@/src/modules/ui/useAction";
import type { VentureDetail, VentureId } from "@/src/modules/ui/types";

function JoinInner() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const code = useSearchParams()?.get("code") ?? "";
  const router = useRouter();
  const { client, address } = useVestige();
  const [label, setLabel] = useState("");
  const action = useAction<VentureDetail>();
  const venture = useAdapterQuery((c) => c.getVenture(ventureId as VentureId), [ventureId]);

  if (venture.status === "loading") return <LoadingCard />;
  if (venture.status === "error") return <AdapterErrorNotice error={venture.error} />;
  const v = venture.data;
  const already = v.seats.some((s) => address && s.wallet.toLowerCase() === address.toLowerCase());
  const labelError = label && !isValidSlug(label) ? "3–32 lowercase letters, digits or hyphens." : null;

  return (
    <div className="stack-lg" style={{ maxWidth: 640 }}>
      <div className="stack">
        <span className="eyebrow">Founder B · invitation</span>
        <h1>Join {v.displayName}</h1>
        <p className="lead">
          You&apos;ve been invited to take the second founder seat of <span className="mono">{v.ensName}</span>. Next you&apos;ll prove you&apos;re a unique
          human and sign the founding terms. You won&apos;t need gas or a seed phrase.
        </p>
      </div>
      <Notice tone="legal" title="Workspace — not legally incorporated" />
      {!code && <Notice tone="error" title="This link is missing its invite code." />}
      {already ? (
        <Notice tone="success" title="You already hold a seat in this venture.">
          <a href={`/founder/${v.ventureId}/verify`}>Continue to verification →</a>
        </Notice>
      ) : (
        <Card testId="join-card">
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!address) return;
              const r = await action.run(() => client.joinVenture(v.ventureId, { inviteCode: code, founderLabel: label, wallet: address }));
              if (r) router.push(`/founder/${v.ventureId}/verify`);
            }}
          >
            <Field label="Your founder name" htmlFor="j-label" error={labelError} hint={label && !labelError ? <>Your seat: <span className="mono">{label}.{v.ensName}</span></> : "A short public handle, not your legal name."}>
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
                      : "Connect a wallet first."
                    : !code
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

export default function JoinPage() {
  return (
    <Suspense fallback={<LoadingCard />}>
      <JoinInner />
    </Suspense>
  );
}
