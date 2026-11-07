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
import { Icon, VentureTile } from "@/components/brand";
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

  const done = steps.filter((s) => s.state === "done").length;
  const TAB_LABEL: Record<string, string> = { team: "Overview", verify: "Verify", terms: "Terms", treasury: "Treasury", payments: "Payments" };

  return (
    <div className="stack-lg">
      <header className="stack" style={{ gap: 18 }}>
        <div className="row-between" style={{ alignItems: "flex-start" }}>
          <div className="row" style={{ gap: 16, flexWrap: "nowrap", minWidth: 0 }}>
            <VentureTile name={v.ensName} large />
            <div className="stack-sm" style={{ gap: 4, minWidth: 0 }}>
              <div className="row" style={{ gap: 10 }}>
                <h1 className="mono" style={{ fontFamily: "var(--mono)", fontSize: "clamp(20px, 2.6vw, 26px)", letterSpacing: "-0.02em" }} data-testid="venture-ens">
                  {v.ensName}
                </h1>
                <StatusPill status={v.ensStatus} mock={v.source === "DEV_MOCK"}>
                  {v.ensStatus === "VERIFIED" ? "ENS registered" : v.ensStatus === "PENDING" ? "ENS confirming" : v.ensStatus === "FAILED" ? "ENS not registered" : "ENS unknown"}
                </StatusPill>
              </div>
              <span className="muted" data-testid="venture-name">
                {v.displayName}
              </span>
              <span className="faint mono tiny" title={v.ventureId}>
                ventureId {shortHex(v.ventureId, 8, 6)} · {done} of {steps.length} steps done
              </span>
            </div>
          </div>
          <Link className="btn btn-secondary btn-sm" href={`/v/${v.ensName}${v.source === "DEV_MOCK" ? "?source=mock" : ""}`} data-testid="open-public">
            <Icon name="external" size={15} /> Public evidence
          </Link>
        </div>
        <nav className="tabs" aria-label="Venture steps">
          {steps.map((s, i) => {
            const href = base + HREF[s.key];
            const current = HREF[s.key] ? path.startsWith(href) : path === base;
            return (
              <Link key={s.key} href={href} className="tab" aria-current={current ? "step" : undefined} data-testid={`nav-${s.key}`} data-state={s.state} title={s.sub}>
                <span className="tab-dot">{s.state === "done" ? "✓" : i + 1}</span>
                {TAB_LABEL[s.key] ?? s.title}
              </Link>
            );
          })}
        </nav>
        {!mySeat && (
          <Notice tone="warn" title={!address ? "You're viewing without a wallet" : "Your wallet doesn't hold a seat in this venture"}>
            Founder actions are disabled.{" "}
            {ADAPTER_KIND === "dev-mock" ? (role === "visitor" ? "Pick Founder A or Founder B in “Acting as” to act." : "") : !address ? "Connect a founder wallet (top right)." : ""}
          </Notice>
        )}
      </header>
      <div className="stack-lg" style={{ minWidth: 0 }}>
        {children}
        <Notice tone="legal" title="Workspace — not legally incorporated">
          This venture is a verified team workspace, not a company. Founding terms here record intent between founders; they are not a legal entity.
        </Notice>
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
