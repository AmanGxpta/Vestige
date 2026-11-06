"use client";

import Link from "next/link";
import { AdapterErrorNotice, Card, CheckIcon, LoadingCard, Notice } from "@/components/ui";
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
    <span className="row small" style={{ gap: 6 }} data-testid={testId} data-ok={ok === null ? "unknown" : ok}>
      <CheckIcon status={ok === null ? "UNKNOWN" : !ok ? "NONE" : mock ? "VERIFIED" : "PENDING"} mock={mock} size={18} />
      {ok === null ? "Unknown" : label}
      {ok && !mock && <span className="tiny faint">(reported)</span>}
    </span>
  );
}

export default function FunderListPage() {
  const list = useAdapterQuery((c) => c.listVentures(), [], { pollMs: () => 4000 });
  return (
    <div className="stack-lg">
      <div className="stack">
        <span className="eyebrow">Funder view</span>
        <h1>Ventures</h1>
        <p className="lead">Every team below has a public evidence page. Badges summarise it; open the page to check each claim against the chains yourself.</p>
      </div>
      {list.status === "loading" && <LoadingCard lines={4} />}
      {list.status === "error" && (
        <>
          <AdapterErrorNotice error={list.error} />
          <Notice tone="info">The consented venture list (GET /api/identity/ventures, CR-C2-001) is not available here yet. You can still verify any venture by its ENS name.</Notice>
        </>
      )}
      {list.status === "ok" && list.data.length === 0 && (
        <Card>
          <p className="muted">
            No listed ventures yet. Ventures appear here only after <strong>all</strong> their founders agree to be listed. <Link href="/v">Verify a venture by its ENS name</Link> instead.
          </p>
        </Card>
      )}
      {list.status === "ok" && list.data.length > 0 && (
        <Card pad={false} testId="venture-table">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Venture</th>
                  <th>Humans</th>
                  <th>Terms</th>
                  <th>Treasury</th>
                  <th>Funded</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.map((v) => (
                  <tr key={v.ventureId} data-testid="venture-row">
                    <td>
                      <div className="stack-sm" style={{ gap: 2 }}>
                        <strong>{v.displayName}</strong>
                        <span className="mono tiny muted">{v.ensName}</span>
                        {v.source === "DEV_MOCK" && <span className="badge badge-mock-tag" style={{ alignSelf: "flex-start" }}>MOCK</span>}
                        {v.observedAt && <span className="tiny faint">summary {relativeTime(v.observedAt)}</span>}
                      </div>
                    </td>
                    <td><Check ok={v.humansVerified >= 2} label={`${v.humansVerified}/2 verified`} testId="badge-humans" source={v.source} /></td>
                    <td><Check ok={v.termsSigned} label={v.termsSigned ? "Signed" : "Not signed"} testId="badge-terms" source={v.source} /></td>
                    <td><Check ok={v.treasuryActive} label={v.treasuryActive ? "Active · Whitechain" : "Not active"} testId="badge-treasury" source={v.source} /></td>
                    <td><Check ok={v.funded} label={v.funded ? "USDT funded" : "Not funded"} testId="badge-funded" source={v.source} /></td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        <Link className="btn btn-secondary btn-sm" href={`/v/${v.ensName}${v.source === "DEV_MOCK" ? "?source=mock" : ""}`}>Evidence</Link>
                        <Link className="btn btn-sm" href={`/funder/${v.ensName}`} data-testid="fund-link">Fund</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <p className="small muted">Badges are summaries — the evidence page is the source of truth.</p>
    </div>
  );
}
