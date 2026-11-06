"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AdapterErrorNotice, LoadingCard, Notice, StatusPill } from "@/components/ui";
import { ventureSteps } from "@/src/modules/ui/progress";
import { useVestige } from "@/src/modules/ui/provider";
import { seatFor } from "@/src/modules/ui/progress";
import { VentureProvider, useVenture } from "@/src/modules/ui/venture/VentureContext";
import type { VentureId } from "@/src/modules/ui/types";
import { shortHex } from "@/src/modules/ui/format";
import { ADAPTER_KIND } from "@/src/modules/ui/config";

const HREF: Record<string, string> = { team: "", verify: "/verify", terms: "/terms", treasury: "/treasury", payments: "/payments" };

function Workspace({ children }: { children: ReactNode }) {
  const { ventureId, venture, treasury } = useVenture();
  const { address, role } = useVestige();
  const path = usePathname() ?? "";
  if (venture.status === "loading") return <LoadingCard lines={4} />;
  if (venture.status === "error") return <AdapterErrorNotice error={venture.error} />;
  const v = venture.data;
  const steps = ventureSteps(v, treasury.data);
  const mySeat = seatFor(v, address);
  const base = `/founder/${ventureId}`;

  return (
    <div className="stack-lg">
      <header className="stack">
        <div className="row-between">
          <div className="stack-sm">
            <span className="eyebrow">Venture workspace</span>
            <h1 data-testid="venture-name">{v.displayName}</h1>
            <div className="row small">
              <span className="mono" data-testid="venture-ens">{v.ensName}</span>
              <StatusPill status={v.ensStatus} mock={v.source === "DEV_MOCK"} />
              <span className="faint mono tiny" title={v.ventureId}>id {shortHex(v.ventureId, 8, 6)}</span>
            </div>
          </div>
          <Link className="btn btn-secondary" href={`/v/${v.ensName}${v.source === "DEV_MOCK" ? "?source=mock" : ""}`} data-testid="open-public">
            Public evidence page ↗
          </Link>
        </div>
        <Notice tone="legal" title="Workspace — not legally incorporated">
          This venture is a verified team workspace, not a company. Founding terms here record intent between founders; they are not a legal entity.
        </Notice>
        {!mySeat && (
          <Notice tone="warn" title={!address ? "You're viewing without a wallet" : "Your wallet doesn't hold a seat in this venture"}>
            Founder actions are disabled.{" "}
            {ADAPTER_KIND === "dev-mock" ? (role === "visitor" ? "Pick Founder A or Founder B in “Acting as” to act." : "") : !address ? "Connect a founder wallet (top right)." : ""}
          </Notice>
        )}
      </header>
      <div className="split split-nav">
        <nav className="card" aria-label="Venture steps" style={{ padding: 8 }}>
          <div className="steps">
            {steps.map((s, i) => {
              const href = base + HREF[s.key];
              const current = HREF[s.key] ? path.startsWith(href) : path === base;
              return (
                <Link
                  key={s.key}
                  href={href}
                  className={`step step-${s.state === "done" ? "done" : s.state === "pending" ? "pending" : "todo"}`}
                  aria-current={current ? "step" : undefined}
                  data-testid={`nav-${s.key}`}
                  data-state={s.state}
                >
                  <span className="step-dot">{s.state === "done" ? "✓" : i + 1}</span>
                  <span>
                    <span className="step-title">{s.title}</span>
                    <br />
                    <span className="step-sub">{s.sub}</span>
                  </span>
                  <span />
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="stack-lg" style={{ minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}

export default function VentureLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ ventureId: string }>();
  return (
    <VentureProvider ventureId={params.ventureId as VentureId}>
      <Workspace>{children}</Workspace>
    </VentureProvider>
  );
}
