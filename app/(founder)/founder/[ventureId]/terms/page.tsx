"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdapterErrorNotice, Button, Card, EvidenceBadge, Field, Notice, StatusPill } from "@/components/ui";
import { bpsToPercent, LEGAL_DISCLAIMER, parseTermsDoc, previewTerms, type FoundingTermsInput } from "@/src/modules/ui/agreement/terms";
import { shortHex, relativeTime } from "@/src/modules/ui/format";
import { useVestige } from "@/src/modules/ui/provider";
import { currentSignatures, seatFor, termsFullySigned, verifiedSeats } from "@/src/modules/ui/progress";
import { useAction } from "@/src/modules/ui/useAction";
import { useVenture } from "@/src/modules/ui/venture/VentureContext";
import type { Address, VentureDetail } from "@/src/modules/ui/types";

type FounderDraft = { wallet: Address; role: string; contribution: string; percent: string; vestingIntent: string };
type Draft = { effectiveDate: string; decisionRule: string; notes: string; founders: FounderDraft[] };

const pctToBps = (p: string): number => {
  const n = Number(p);
  return Number.isFinite(n) ? Math.round(n * 100) : Number.NaN;
};

function toInput(d: Draft): FoundingTermsInput {
  return {
    effectiveDate: d.effectiveDate,
    decisionRule: d.decisionRule,
    notes: d.notes,
    founders: d.founders.map((f) => ({ wallet: f.wallet, role: f.role, contribution: f.contribution, ownershipBps: pctToBps(f.percent), vestingIntent: f.vestingIntent })),
  };
}

export default function TermsPage() {
  const { venture, ventureId, refreshAll } = useVenture();
  const { client, address, signer } = useVestige();
  const save = useAction<VentureDetail>();
  const sign = useAction<VentureDetail>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const v = venture.status === "ok" ? venture.data : undefined;
  const agreement = v?.agreement;
  const doc = parseTermsDoc(agreement?.canonicalJson);
  const verified = useMemo(() => verifiedSeats(v).map((s) => s), [v]);
  const subnameOf = (w: string) => v?.seats.find((s) => s.wallet.toLowerCase() === w.toLowerCase())?.founderSubname ?? shortHex(w);

  const blankDraft = (): Draft => ({
    effectiveDate: new Date().toISOString().slice(0, 10),
    decisionRule: "",
    notes: "",
    founders: verified.map((s) => ({ wallet: s.wallet, role: "", contribution: "", percent: verified.length ? String(100 / verified.length) : "", vestingIntent: "" })),
  });
  const fromDoc = (): Draft | null =>
    doc && {
      effectiveDate: doc.effectiveDate,
      decisionRule: doc.decisionRule,
      notes: doc.notes,
      founders: doc.founders.map((f) => ({ wallet: f.wallet, role: f.role, contribution: f.contribution, percent: String(f.ownershipBps / 100), vestingIntent: f.vestingIntent })),
    };

  useEffect(() => {
    if (v && !agreement && verified.length >= 2 && !draft) {
      setDraft(blankDraft());
      setEditing(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, agreement, verified.length]);

  if (!v) return null;
  const seat = seatFor(v, address);
  const sigs = currentSignatures(v);
  const iSigned = !!address && sigs.some((s) => s.signer.toLowerCase() === address.toLowerCase());
  const nextVersion = (agreement?.version ?? 0) + 1;

  if (!seat)
    return (
      <Card title="Founding terms">
        <Notice tone="info" title="Terms are private to the founders">
          Only the agreement&apos;s hash and signature count are public. Connect a founder wallet to view and sign.
        </Notice>
      </Card>
    );
  if (verified.length < 2)
    return (
      <Card title="Founding terms" testId="card-terms-blocked">
        <Notice tone="info" title="Both founders verify first">
          The terms name exactly the venture&apos;s verified founders, so both of you need to finish World ID verification before drafting. {verified.length} of 2 verified.
        </Notice>
      </Card>
    );

  const preview = draft ? previewTerms(v.ventureId, verified.map((s) => s.wallet), toInput(draft)) : null;
  const totalPct = draft ? draft.founders.reduce((a, f) => a + (Number(f.percent) || 0), 0) : 0;
  const changed = !!preview?.ok && preview.hash !== agreement?.docHash;
  const setF = (i: number, patch: Partial<FounderDraft>) => draft && setDraft({ ...draft, founders: draft.founders.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  return (
    <>
      {editing && draft ? (
        <Card title={agreement ? `Edit terms → version ${nextVersion}` : "Draft your founding terms"} testId="card-terms-edit">
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!address) return;
              const r = await save.run(() => client.createAgreementVersion(v.ventureId, { terms: toInput(draft), wallet: address }));
              if (r) {
                setEditing(false);
                refreshAll();
              }
            }}
          >
            {agreement && sigs.length > 0 && (
              <Notice tone="warn" title="Saving creates a new version and clears all signatures">
                {sigs.length} signature{sigs.length > 1 ? "s" : ""} on version {agreement.version} will no longer apply. Both founders must sign again.
              </Notice>
            )}
            {draft.founders.map((f, i) => (
              <fieldset key={f.wallet} className="stack-sm" style={{ border: "1px solid var(--line)", borderRadius: "var(--radius)", padding: 14, margin: 0 }} data-testid={`terms-founder-${i}`}>
                <legend className="mono small" style={{ padding: "0 6px" }}>
                  {subnameOf(f.wallet)}
                </legend>
                <div className="grid-2">
                  <Field label="Role" htmlFor={`t-role-${i}`}>
                    <input id={`t-role-${i}`} className="input" value={f.role} placeholder={i === 0 ? "CEO" : "COO"} onChange={(e) => setF(i, { role: e.target.value })} data-testid={`terms-role-${i}`} />
                  </Field>
                  <Field label="Proposed ownership (%)" htmlFor={`t-pct-${i}`}>
                    <input id={`t-pct-${i}`} className="input" inputMode="decimal" value={f.percent} onChange={(e) => setF(i, { percent: e.target.value })} data-testid={`terms-pct-${i}`} />
                  </Field>
                </div>
                <Field label="Contribution" htmlFor={`t-contrib-${i}`}>
                  <textarea id={`t-contrib-${i}`} className="textarea" value={f.contribution} placeholder={i === 0 ? "Product and engineering." : "Go-to-market and partnerships."} onChange={(e) => setF(i, { contribution: e.target.value })} data-testid={`terms-contribution-${i}`} />
                </Field>
                <Field label="Vesting intent" htmlFor={`t-vest-${i}`}>
                  <input id={`t-vest-${i}`} className="input" value={f.vestingIntent} placeholder="4 years, 1-year cliff, if and when a company is formed." onChange={(e) => setF(i, { vestingIntent: e.target.value })} data-testid={`terms-vesting-${i}`} />
                </Field>
              </fieldset>
            ))}
            <span className="small" data-testid="terms-total" style={totalPct === 100 ? undefined : { color: "var(--failed)" }}>
              Ownership total: {totalPct}% {totalPct === 100 ? "" : "(must be 100%)"}
            </span>
            <Field label="Decision rule" htmlFor="t-rule">
              <input id="t-rule" className="input" value={draft.decisionRule} placeholder="Both founders must approve any payment or change to these terms." onChange={(e) => setDraft({ ...draft, decisionRule: e.target.value })} data-testid="terms-decisionRule" />
            </Field>
            <div className="grid-2">
              <Field label="Effective date" htmlFor="t-date" hint="YYYY-MM-DD">
                <input id="t-date" className="input" value={draft.effectiveDate} onChange={(e) => setDraft({ ...draft, effectiveDate: e.target.value })} data-testid="terms-effectiveDate" />
              </Field>
              <Field label="Notes (optional)" htmlFor="t-notes">
                <input id="t-notes" className="input" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} data-testid="terms-notes" />
              </Field>
            </div>
            <p className="tiny faint">Fixed clause added to every version: “{LEGAL_DISCLAIMER}”</p>
            {preview && !preview.ok && (
              <ul className="small" style={{ color: "var(--failed)", margin: 0, paddingLeft: 18 }} data-testid="terms-problems">
                {preview.problems.slice(0, 4).map((p) => (
                  <li key={p.field + p.message}>{p.message}</li>
                ))}
              </ul>
            )}
            <div className="card-foot" style={{ margin: "0 -20px -20px", borderRadius: "0 0 var(--radius) var(--radius)" }}>
              <div className="row-between">
                <span className="small">
                  Version {nextVersion} hash (preview, C1 algorithm):{" "}
                  <span className="mono" data-testid="terms-preview-hash">
                    {preview?.ok ? shortHex(preview.hash, 10, 8) : "-"}
                  </span>
                  {agreement && <span className="muted"> · was {shortHex(agreement.docHash, 10, 8)}</span>}
                </span>
                <div className="row">
                  {agreement && (
                    <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" loading={save.busy} disabledReason={!preview?.ok ? "Complete every clause; ownership must total 100%." : !changed ? "No changes to save." : null} data-testid="terms-save">
                    Save version {nextVersion}
                  </Button>
                </div>
              </div>
            </div>
            {save.error && <AdapterErrorNotice error={save.error} />}
          </form>
        </Card>
      ) : (
        agreement && (
          <Card
            title={
              <div className="row">
                <h2 style={{ fontSize: 18 }}>Founding terms · version {agreement.version}</h2>
                {termsFullySigned(v) ? <EvidenceBadge label="SIGNED" source={v.source} /> : <StatusPill status="AWAITING_APPROVALS">Awaiting signatures</StatusPill>}
              </div>
            }
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDraft(fromDoc() ?? blankDraft());
                  setEditing(true);
                }}
                data-testid="terms-edit"
              >
                Edit terms
              </Button>
            }
            testId="card-terms"
          >
            <div className="stack">
              {doc ? (
                <article className="doc" data-testid="terms-doc">
                  <p style={{ fontStyle: "italic", color: "var(--muted)" }}>
                    Founding terms of {v.displayName} ({v.ensName}), effective {doc.effectiveDate}. {doc.disclaimer}
                  </p>
                  {doc.founders.map((f) => (
                    <div key={f.wallet}>
                      <h3>
                        <span className="mono">{subnameOf(f.wallet)}</span>: {f.role} · {bpsToPercent(f.ownershipBps)}
                      </h3>
                      <p>{f.contribution}</p>
                      <p className="small muted">Vesting intent: {f.vestingIntent}</p>
                    </div>
                  ))}
                  <h3>Decision rule</h3>
                  <p>{doc.decisionRule}</p>
                  {doc.notes && (
                    <>
                      <h3>Notes</h3>
                      <p style={{ whiteSpace: "pre-wrap" }}>{doc.notes}</p>
                    </>
                  )}
                </article>
              ) : (
                <Notice tone="info">The terms text is only returned to current founders.</Notice>
              )}
              <dl className="kv">
                <dt>Document hash</dt>
                <dd className="mono small" data-testid="terms-hash">
                  {agreement.docHash}
                </dd>
                <dt>Signatures (v{agreement.version})</dt>
                <dd>
                  <ul className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }} data-testid="terms-signatures">
                    {v.seats.map((s) => {
                      const sg = sigs.find((x) => x.signer.toLowerCase() === s.wallet.toLowerCase());
                      return (
                        <li key={s.wallet} className="row small">
                          <span className="mono">{s.founderSubname}</span>
                          {sg ? (
                            <>
                              <EvidenceBadge label="SIGNED" source={v.source} />
                              <span className="faint tiny">{relativeTime(sg.signedAt)}</span>
                            </>
                          ) : (
                            <StatusPill status="NONE">Not signed</StatusPill>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </dd>
                <dt>Public record</dt>
                <dd className="small muted">
                  When both founders sign, this hash is written to the <span className="mono">vestige.agreement</span> record of {v.ensName}
                  {agreement.ensStatus !== "UNKNOWN" && (
                    <>
                      {" "}
                      · <StatusPill status={agreement.ensStatus} mock={v.source === "DEV_MOCK"} />
                    </>
                  )}
                  . The text stays private.
                </dd>
              </dl>
              {sign.error && <AdapterErrorNotice error={sign.error} />}
              {sign.cancelled && <Notice tone="info">Signature cancelled. Nothing was signed.</Notice>}
              <div>
                {iSigned ? (
                  <Notice tone="success" title={`You signed version ${agreement.version}`} testId="terms-i-signed" />
                ) : (
                  <Button
                    loading={sign.busy}
                    data-testid="terms-sign"
                    disabledReason={seat.worldProofStatus !== "VERIFIED" ? "Verify you're a unique human first." : null}
                    onClick={async () => {
                      const r = await sign.run(() =>
                        client.signAgreement(
                          v.ventureId,
                          { version: agreement.version, docHash: agreement.docHash, wallet: address! },
                          signer({
                            title: `Sign the founding terms of ${v.displayName}, version ${agreement.version}`,
                            lines: [
                              { label: "Venture", value: v.ensName },
                              { label: "Version", value: String(agreement.version) },
                              { label: "Document", value: shortHex(agreement.docHash, 10, 8) },
                            ],
                            typedDataName: "FoundingTerms",
                            costsGas: false,
                          }),
                        ),
                      );
                      if (r) refreshAll();
                    }}
                  >
                    Sign version {agreement.version}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )
      )}
      {termsFullySigned(v) && (
        <div className="row">
          <Link className="btn" href={`/founder/${ventureId}/treasury`} data-testid="next-treasury">
            Next: treasury →
          </Link>
        </div>
      )}
    </>
  );
}
