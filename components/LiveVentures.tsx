"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdapterErrorNotice, LoadingCard } from "./ui";
import { Icon, VentureTile } from "./brand";
import { relativeTime } from "@/src/modules/ui/format";
import { useAdapterQuery } from "@/src/modules/ui/provider";
import type { VentureSummary } from "@/src/modules/ui/types";

/** Small status chip for a cached, founder-consented summary. Never green unless the data says so. */
function SummaryChip({ ok, yes, no, unknown = "Unknown", source }: { ok: boolean | null; yes: string; no: string; unknown?: string; source: VentureSummary["source"] }) {
  if (ok === null) return <span className="chip">{unknown}</span>;
  if (!ok) return <span className="chip">{no}</span>;
  // API summaries are cached and founder-consented — never a green "verified" claim.
  if (source !== "DEV_MOCK")
    return (
      <span className="chip" title="Reported by the vestige API — confirm on the evidence page">
        {yes} <span className="faint">· reported</span>
      </span>
    );
  return (
    <span className={`pill pill-VERIFIED${source === "DEV_MOCK" ? " pill-mock" : ""}`} title={source === "DEV_MOCK" ? "DEV MOCK — simulated" : "Reported by the vestige API — confirm on the evidence page"}>
      {yes}
      {source === "DEV_MOCK" && <span className="pill-mock-tag">MOCK</span>}
    </span>
  );
}

export function VentureSummaryCard({ v }: { v: VentureSummary }) {
  return (
    <Link href={`/v/${v.ensName}${v.source === "DEV_MOCK" ? "?source=mock" : ""}`} className="card venture-card" data-testid="live-venture">
      <div className="row" style={{ gap: 14, flexWrap: "nowrap" }}>
        <VentureTile name={v.ensName} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="row-between" style={{ flexWrap: "nowrap" }}>
            <strong style={{ fontSize: 16, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.ensName}</strong>
          </div>
          <span className="small muted">{v.displayName}</span>
        </div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <SummaryChip ok={v.humansVerified >= 2} yes={`${v.humansVerified}/2 humans`} no={`${v.humansVerified}/2 humans`} source={v.source} />
        <SummaryChip ok={v.termsSigned} yes="Terms signed" no="Terms not signed" source={v.source} />
        <SummaryChip ok={v.treasuryActive} yes="Treasury live" no="No treasury" unknown="Treasury unknown" source={v.source} />
      </div>
      <div className="row-between small" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <span className="muted">{v.observedAt ? `Summary ${relativeTime(v.observedAt)}` : "Summary"}</span>
        <span className="row" style={{ gap: 6, fontWeight: 600, color: "var(--ink)" }}>
          Verify <Icon name="arrow" size={15} />
        </span>
      </div>
    </Link>
  );
}

const FILTERS = [
  { key: "all", label: "All ventures", test: () => true },
  { key: "humans", label: "Two verified humans", test: (v: VentureSummary) => v.humansVerified >= 2 },
  { key: "terms", label: "Terms signed", test: (v: VentureSummary) => v.termsSigned },
] as const;

export function LiveVentures({ limit }: { limit?: number }) {
  const list = useAdapterQuery((c) => c.listVentures(), []);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const shown = useMemo(() => {
    if (list.status !== "ok") return [];
    const f = FILTERS.find((x) => x.key === filter)!;
    return list.data.filter(f.test).slice(0, limit ?? 99);
  }, [list, filter, limit]);

  return (
    <section className="section" data-testid="live-ventures">
      <div className="section-head">
        <div className="page-head">
          <h2>Live ventures</h2>
          <p className="small">Teams whose founders all agreed to be listed. Every card links to a public check you can repeat yourself.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={`btn btn-sm ${filter === f.key ? "" : "btn-secondary"}`} style={{ borderRadius: 999 }} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {list.status === "loading" && <LoadingCard lines={3} />}
      {list.status === "error" && <AdapterErrorNotice error={list.error} />}
      {list.status === "ok" && shown.length === 0 && (
        <div className="card card-pad card-flat row-between">
          <span className="muted">No listed ventures yet. A venture appears here once every founder opts in.</span>
          <Link className="btn btn-secondary btn-sm" href="/founder">
            Create one
          </Link>
        </div>
      )}
      {shown.length > 0 && <div className="grid-3">{shown.map((v) => <VentureSummaryCard key={v.ventureId} v={v} />)}</div>}
    </section>
  );
}
