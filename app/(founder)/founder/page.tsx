"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdapterErrorNotice, Button, Card, Field, Notice, SignInNotice, StatusPill } from "@/components/ui";
import { ADAPTER_KIND } from "@/src/modules/ui/config";
import { isValidSlug, slugify } from "@/src/modules/ui/format";
import { useAdapterQuery, useVestige } from "@/src/modules/ui/provider";
import { ok } from "@/src/modules/ui/adapter";
import type { MockClient } from "@/src/modules/ui/mock/mock-adapter";
import { useAction } from "@/src/modules/ui/useAction";
import { Icon } from "@/components/brand";
import type { VentureDetail } from "@/src/modules/ui/types";

export default function StartVenturePage() {
  const router = useRouter();
  const { client, address, role, sessionWallet } = useVestige();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [label, setLabel] = useState("");
  const action = useAction<VentureDetail>();
  const list = useAdapterQuery(async (c) => ok(c.kind === "dev-mock" ? await (c as MockClient).mockAllVentures() : []), []);
  const needsSignIn = ADAPTER_KIND === "live" && !!address && (!sessionWallet || sessionWallet.toLowerCase() !== address.toLowerCase());

  const effectiveSlug = slugTouched ? slug : slugify(name).replace(/-labs?$/, "") || "";
  const slugError = effectiveSlug && !isValidSlug(effectiveSlug) ? "3–32 lowercase letters, digits or single hyphens." : null;
  const labelError = label && !isValidSlug(label) ? "3–32 lowercase letters, digits or hyphens." : null;
  const noWallet = !address
    ? ADAPTER_KIND === "dev-mock"
      ? "Pick “Founder A” in “Acting as” (top right) to create a venture."
      : "Connect a wallet first (top right)."
    : needsSignIn
      ? "Sign in with your wallet first."
      : null;
  const notFounderA = ADAPTER_KIND === "dev-mock" && address && role !== "founderA" && role !== "founderB" && role !== "founderA2" ? "Switch to a founder role to create a venture." : null;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <span className="eyebrow">Create a venture</span>
        <h1>Launch your venture in minutes</h1>
        <p>Set up your team, verify as real humans, sign terms and get a shared treasury.</p>
      </div>
      <div className="wizard">
        <aside className="stack">
          <nav className="steps" aria-label="Venture setup steps">
            {[
              ["Venture details", "Name and ENS on Sepolia"],
              ["Add founders", "Single-use invite link"],
              ["Verify humans", "World ID, one person one seat"],
              ["Sign terms", "Both sign the same hash"],
              ["Treasury setup", "2-of-2 Safe on Whitechain"],
            ].map(([t, sub], i) => (
              <div key={t} className={`step${i === 0 ? " step-current" : ""}`} aria-current={i === 0 ? "step" : undefined}>
                <span className="step-dot">{i + 1}</span>
                <span>
                  <span className="step-title">{t}</span>
                  <br />
                  <span className="step-sub">{sub}</span>
                </span>
                <span />
              </div>
            ))}
          </nav>
          {ADAPTER_KIND === "dev-mock" && list.status === "ok" && list.data.length > 0 && (
            <Card title="Ventures in this mock session">
              <ul className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {list.data.map((v) => (
                  <li key={v.ventureId} className="row-between small">
                    <Link href={`/founder/${v.ventureId}`}>{v.displayName}</Link>
                    <StatusPill status="NONE" mock>
                      {v.humansVerified}/2 humans
                    </StatusPill>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
        <Card testId="create-venture" title={<h2>Venture details</h2>}>
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
            <Field label="Your founder name" htmlFor="v-label" error={labelError} hint={label && !labelError ? <>Your seat: <span className="mono">{label}.{effectiveSlug || "…"}.vestige.eth</span>, non-transferable.</> : "A short handle, not your legal name. It is public."}>
              <input id="v-label" className="input mono" value={label} onChange={(e) => setLabel(e.target.value.toLowerCase())} placeholder="asha" data-testid="founder-label-input" required />
            </Field>
            {action.error && <AdapterErrorNotice error={action.error} />}
            {needsSignIn && <SignInNotice />}
            <div>
              <Button type="submit" loading={action.busy} disabledReason={noWallet || notFounderA || (!name || !effectiveSlug || !label ? "Fill in all three fields." : slugError || labelError ? "Fix the highlighted field." : null)} data-testid="create-venture-submit">
                Create venture
              </Button>
            </div>
          </form>
        </Card>
      </div>
      <div className="row small muted" style={{ gap: 18 }}>
        <span className="row" style={{ gap: 6 }}>
          <Icon name="globe" size={15} /> vestige registers your name on Ethereum Sepolia
        </span>
        <span className="row" style={{ gap: 6 }}>
          <Icon name="lock" size={15} /> You never pay gas or share a seed phrase
        </span>
        {ADAPTER_KIND === "dev-mock" && <span style={{ color: "var(--mock)" }}>DEV MOCK: venture IDs are generated by the mock; the server allocates them in production.</span>}
      </div>
    </div>
  );
}
