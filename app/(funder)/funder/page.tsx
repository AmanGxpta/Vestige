"use client";

import Link from "next/link";
import { AdapterErrorNotice, Card, LoadingCard, Notice, StatusPill } from "@/components/ui";
import { useAdapterQuery } from "@/src/modules/ui/provider";

function Check({ ok, label, testId }: { ok: boolean; label: string; testId: string }) {
  return (
    <span className="row small" style={{ gap: 6 }} data-testid={testId} data-ok={ok}>
      <span className={`check-icon ${ok ? "check-VERIFIED" : ""}`} style={ok ? { width: 18, height: 18, fontSize: 10 } : { width: 18, height: 18, fontSize: 10, background: "var(--line)", color: "var(--muted)" }}>
        {ok ? "✓" : "–"}
      </span>
      {label}
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
          <Notice tone="info">A venture list needs a listing endpoint that isn&apos;t in the v0 contract (proposed as CR-C2-001). You can still verify any venture by its ENS name.</Notice>
        </>
      )}
      {list.status === "ok" && list.data.length === 0 && (
        <Card>
          <p className="muted">No ventures yet. <Link href="/founder">Create one as a founder</Link> to see it here.</p>
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
                      </div>
                    </td>
                    <td><Check ok={v.humansVerified >= 2} label={`${v.humansVerified}/2 verified`} testId="badge-humans" /></td>
                    <td><Check ok={v.termsSigned} label={v.termsSigned ? "Signed" : "Not signed"} testId="badge-terms" /></td>
                    <td><Check ok={v.treasuryActive} label={v.treasuryActive ? "Active · Whitechain" : "Not active"} testId="badge-treasury" /></td>
                    <td><Check ok={v.funded} label={v.funded ? "USDT funded" : "Not funded"} testId="badge-funded" /></td>
                    <td>
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        <Link className="btn btn-secondary btn-sm" href={`/v/${v.ensName}${v.source === "DEV_MOCK" ? "?source=mock" : ""}`}>Evidence</Link>
                        <Link className="btn btn-sm" href={`/funder/${v.ventureId}`} data-testid="fund-link">Fund</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <StatusPill status="NONE">Badges are summaries — the evidence page is the source of truth.</StatusPill>
    </div>
  );
}
