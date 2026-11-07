"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AdapterErrorNotice, CheckIcon, LoadingCard, Notice } from "@/components/ui";
import { Icon, VentureTile } from "@/components/brand";
import { relativeTime } from "@/src/modules/ui/format";
import { useAdapterQuery } from "@/src/modules/ui/provider";
import type { VentureSummary } from "@/src/modules/ui/types";

/**
 * Summary badge. These are founder-consented CACHED summaries (CR-C2-001), never
 * authoritative: API values render as "reported" (no green tick), `null` as unknown,
 * and only the public evidence page re-reads ENS + Whitechain.
 */
function Check({ ok, label, testId, source }: { ok: boolean | null; label: string; testId: string; source: VentureSummary["source"] }) {
  const mock = source === "DEV_MOCK";
  return (
    <span className="chip" data-testid={testId} data-ok={ok === null ? "unknown" : ok}>
      <CheckIcon status={ok === null ? "UNKNOWN" : !ok ? "NONE" : mock ? "VERIFIED" : "PENDING"} mock={mock} size={15} />
      {ok === null ? `${label}: unknown` : label}
      {ok && !mock && <span className="faint">(reported)</span>}
    </span>
  );
}

export default function FunderListPage() {
  const list = useAdapterQuery((c) => c.listVentures(), [], { pollMs: () => 4000 });
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    if (list.status !== "ok") return [];
    const s = q.trim().toLowerCase();
    return s ? list.data.filter((v) => v.ensName.includes(s) || v.displayName.toLowerCase().includes(s)) : list.data;
  }, [list, q]);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <span className="eyebrow">Funder view</span>
        <h1>Discover ventures</h1>
        <p>Verified early teams building in the open. Badges summarise; open the evidence page to check each claim against the chains yourself.</p>
      </div>

      <label className="search">
        <Icon name="search" />
        <span className="sr-only">Search ventures</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ventures by name or ENS…" data-testid="discover-search" />
      </label>

      {list.status === "loading" && <LoadingCard lines={4} />}
      {list.status === "error" && (
        <>
          <AdapterErrorNotice error={list.error} />
          <Notice tone="info">
            The consented venture list (GET /api/identity/ventures, CR-C2-001) is not available here yet. You can still verify any venture by its ENS name.
          </Notice>
        </>
      )}
      {list.status === "ok" && list.data.length === 0 && (
        <div className="card card-pad card-flat">
          <p className="muted">
            No listed ventures yet. Ventures appear here only after <strong>all</strong> their founders agree to be listed.{" "}
            <Link href="/v">Verify a venture by its ENS name</Link> instead.
          </p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="card" data-testid="venture-table">
          {rows.map((v) => (
            <div key={v.ventureId} className="v-row" data-testid="venture-row">
              <VentureTile name={v.ensName} />
              <div className="stack-sm" style={{ gap: 6, minWidth: 0 }}>
                <div className="row" style={{ gap: 8 }}>
                  <strong className="mono" style={{ fontSize: 15 }}>
                    {v.ensName}
                  </strong>
                  {v.source === "DEV_MOCK" && <span className="badge badge-mock-tag">MOCK</span>}
                </div>
                <span className="small muted">
                  {v.displayName}
                  {v.observedAt && <span className="faint"> · summary {relativeTime(v.observedAt)}</span>}
                </span>
                <div className="row" style={{ gap: 6 }}>
                  <Check ok={v.humansVerified >= 2} label={`${v.humansVerified}/2 verified`} testId="badge-humans" source={v.source} />
                  <Check ok={v.termsSigned} label={v.termsSigned ? "Terms signed" : "Terms not signed"} testId="badge-terms" source={v.source} />
                  <Check ok={v.treasuryActive} label={v.treasuryActive ? "Treasury live" : "Treasury not active"} testId="badge-treasury" source={v.source} />
                  <Check ok={v.funded} label={v.funded ? "USDT funded" : "Not funded"} testId="badge-funded" source={v.source} />
                </div>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <Link className="btn btn-secondary btn-sm" href={`/v/${v.ensName}${v.source === "DEV_MOCK" ? "?source=mock" : ""}`}>
                  Evidence
                </Link>
                <Link className="btn btn-sm" href={`/funder/${v.ensName}`} data-testid="fund-link">
                  Fund <Icon name="arrow" size={15} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
      {list.status === "ok" && list.data.length > 0 && rows.length === 0 && <p className="muted small">No ventures match “{q}”.</p>}
      <p className="small muted">Badges are summaries — the evidence page is the source of truth.</p>
    </div>
  );
}
