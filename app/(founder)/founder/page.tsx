"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdapterErrorNotice, Button, Card, Field, Notice, StatusPill } from "@/components/ui";
import { ADAPTER_KIND } from "@/src/modules/ui/config";
import { isValidSlug, slugify } from "@/src/modules/ui/format";
import { useAdapterQuery, useVestige } from "@/src/modules/ui/provider";
import { useAction } from "@/src/modules/ui/useAction";
import type { VentureDetail } from "@/src/modules/ui/types";

export default function StartVenturePage() {
  const router = useRouter();
  const { client, address, role } = useVestige();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [label, setLabel] = useState("");
  const action = useAction<VentureDetail>();
  const list = useAdapterQuery((c) => c.listVentures(), []);

  const effectiveSlug = slugTouched ? slug : slugify(name).replace(/-labs?$/, "") || "";
  const slugError = effectiveSlug && !isValidSlug(effectiveSlug) ? "3–32 lowercase letters, digits or single hyphens." : null;
  const labelError = label && !isValidSlug(label) ? "3–32 lowercase letters, digits or hyphens." : null;
  const noWallet = !address
    ? ADAPTER_KIND === "dev-mock"
      ? "Pick “Founder A” in “Acting as” (top right) to create a venture."
      : "Connect a wallet first. (Wallet sign-in is waiting on H's auth decision.)"
    : null;
  const notFounderA = ADAPTER_KIND === "dev-mock" && address && role !== "founderA" && role !== "founderB" && role !== "founderA2" ? "Switch to a founder role to create a venture." : null;

  return (
    <div className="split">
      <div className="stack-lg">
        <div className="stack">
          <span className="eyebrow">Founder A · step 1</span>
          <h1>Start a venture</h1>
          <p className="lead">Claim your team&apos;s name. You&apos;ll invite your co-founder next, then you both prove you&apos;re human.</p>
        </div>
        <Card testId="create-venture">
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!address) return;
              const v = await action.run(() => client.createVenture({ displayName: name, slug: effectiveSlug, founderLabel: label, wallet: address }));
              if (v) router.push(`/founder/${v.ventureId}`);
            }}
          >
            <Field label="Venture name" htmlFor="v-name" hint="What your team is called today. You can be pre-company.">
              <input id="v-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Northstar Labs" data-testid="venture-name-input" required />
            </Field>
            <Field label="ENS name" htmlFor="v-slug" error={slugError} hint="Registered on Ethereum Sepolia. This becomes your venture's public identity.">
              <div className="input-affix">
                <input
                  id="v-slug"
                  className="input mono"
                  value={effectiveSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value.toLowerCase());
                  }}
                  placeholder="northstar"
                  data-testid="venture-slug-input"
                  required
                />
                <span className="affix">.vestige.eth</span>
              </div>
            </Field>
            <Field label="Your founder name" htmlFor="v-label" error={labelError} hint={label && !labelError ? <>Your seat: <span className="mono">{label}.{effectiveSlug || "…"}.vestige.eth</span> — non-transferable.</> : "A short handle, not your legal name. It is public."}>
              <input id="v-label" className="input mono" value={label} onChange={(e) => setLabel(e.target.value.toLowerCase())} placeholder="asha" data-testid="founder-label-input" required />
            </Field>
            {action.error && <AdapterErrorNotice error={action.error} />}
            <div>
              <Button type="submit" loading={action.busy} disabledReason={noWallet || notFounderA || (!name || !effectiveSlug || !label ? "Fill in all three fields." : slugError || labelError ? "Fix the highlighted field." : null)} data-testid="create-venture-submit">
                Create venture
              </Button>
            </div>
          </form>
        </Card>
      </div>
      <aside className="stack">
        <Card title="What happens next">
          <ol className="small stack-sm" style={{ paddingLeft: 18, margin: 0 }}>
            <li>vestige registers your name on Ethereum Sepolia.</li>
            <li>You share a single-use invite link with your co-founder.</li>
            <li>You each prove you&apos;re a unique human with World ID.</li>
            <li>You both sign the founding terms.</li>
            <li>vestige sets up a 2-of-2 USDT treasury on Whitechain. You never pay gas.</li>
          </ol>
        </Card>
        {ADAPTER_KIND === "dev-mock" && list.status === "ok" && list.data.length > 0 && (
          <Card title="Ventures in this mock session">
            <ul className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {list.data.map((v) => (
                <li key={v.ventureId} className="row-between small">
                  <Link href={`/founder/${v.ventureId}`}>{v.displayName}</Link>
                  <StatusPill status={v.treasuryActive ? "ACTIVE" : "NONE"} mock={v.source === "DEV_MOCK"}>{v.humansVerified}/2 humans</StatusPill>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {ADAPTER_KIND === "dev-mock" && <Notice tone="mock">Venture IDs here are generated by the mock. In production the server allocates the bytes32 ventureId.</Notice>}
      </aside>
    </div>
  );
}
