"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdapterErrorNotice, Button, Card, EvidenceBadge, Field, Notice, StatusPill } from "@/components/ui";
import { previewDocHash } from "@/src/modules/ui/canonical";
import { shortHex, relativeTime } from "@/src/modules/ui/format";
import { useVestige } from "@/src/modules/ui/provider";
import { currentSignatures, seatFor, termsFullySigned } from "@/src/modules/ui/progress";
import { useAction } from "@/src/modules/ui/useAction";
import { useVenture } from "@/src/modules/ui/venture/VentureContext";
import type { AgreementFields, VentureDetail } from "@/src/modules/ui/types";

const FIELD_META: { key: keyof AgreementFields; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: "contributions", label: "Contributions", placeholder: "Asha: product and engineering. Ravi: go-to-market and partnerships.", multiline: true },
  { key: "roles", label: "Roles", placeholder: "Asha — CEO. Ravi — COO." },
  { key: "ownershipSplit", label: "Proposed ownership split", placeholder: "50 / 50" },
  { key: "vestingIntent", label: "Vesting intent", placeholder: "4 years, 1-year cliff, from the effective date, if and when a company is formed." },
  { key: "decisionRule", label: "Decision rule", placeholder: "Both founders must approve any payment or change to these terms." },
  { key: "effectiveDate", label: "Effective date", placeholder: "2026-11-06" },
];
const EMPTY: AgreementFields = { contributions: "", roles: "", ownershipSplit: "", vestingIntent: "", decisionRule: "", effectiveDate: "" };

function parseFields(canonicalJson?: string): AgreementFields | null {
  if (!canonicalJson) return null;
  try {
    const doc = JSON.parse(canonicalJson) as { fields?: AgreementFields };
    return doc.fields ? { ...EMPTY, ...doc.fields } : null;
  } catch {
    return null;
  }
}

export default function TermsPage() {
  const { venture, ventureId, refreshAll } = useVenture();
  const { client, address, requestSignature } = useVestige();
  const save = useAction<VentureDetail>();
  const sign = useAction<VentureDetail>();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AgreementFields>(EMPTY);

  const v = venture.status === "ok" ? venture.data : undefined;
  const agreement = v?.agreement;
  const current = parseFields(agreement?.canonicalJson);
  useEffect(() => {
    if (!agreement) setEditing(true);
  }, [agreement]);

  if (!v) return null;
  const seat = seatFor(v, address);
  const sigs = currentSignatures(v);
  const iSigned = !!address && sigs.some((s) => s.signer.toLowerCase() === address.toLowerCase());
  const nextVersion = (agreement?.version ?? 0) + 1;
  const preview = previewDocHash(v.ventureId, nextVersion, draft);
  const complete = Object.values(draft).every((x) => x.trim());
  const changed = !current || FIELD_META.some((f) => current[f.key] !== draft[f.key]);

  const startEdit = () => {
    setDraft(current ?? EMPTY);
    setEditing(true);
  };

  if (!seat)
    return (
      <Card title="Founding terms">
        <Notice tone="info" title="Terms are private to the founders">
          Only the agreement&apos;s hash and signature count are public. Pick a founder role to view and sign.
        </Notice>
      </Card>
    );

  return (
    <>
      {editing ? (
        <Card title={agreement ? `Edit terms → version ${nextVersion}` : "Draft your founding terms"} testId="card-terms-edit">
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!address) return;
              const r = await save.run(() => client.createAgreementVersion(v.ventureId, { fields: draft, wallet: address }));
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
            {FIELD_META.map((f) => (
              <Field key={f.key} label={f.label} htmlFor={`t-${f.key}`}>
                {f.multiline ? (
                  <textarea id={`t-${f.key}`} className="textarea" value={draft[f.key]} placeholder={f.placeholder} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} data-testid={`terms-${f.key}`} />
                ) : (
                  <input id={`t-${f.key}`} className="input" value={draft[f.key]} placeholder={f.placeholder} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} data-testid={`terms-${f.key}`} />
                )}
              </Field>
            ))}
            <div className="card-foot" style={{ margin: "0 -20px -20px", borderRadius: "0 0 var(--radius) var(--radius)" }}>
              <div className="row-between">
                <span className="small">
                  Version {nextVersion} hash (preview): <span className="mono" data-testid="terms-preview-hash">{shortHex(preview.hash, 10, 8)}</span>
                  {agreement && <span className="muted"> · was {shortHex(agreement.docHash, 10, 8)}</span>}
                </span>
                <div className="row">
                  {agreement && (
                    <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" loading={save.busy} disabledReason={!complete ? "Fill in every clause." : !changed ? "No changes to save." : null} data-testid="terms-save">
                    Save version {nextVersion}
                  </Button>
                </div>
              </div>
            </div>
            {save.error && <AdapterErrorNotice error={save.error} />}
          </form>
        </Card>
      ) : (
        agreement &&
        current && (
          <Card
            title={
              <div className="row">
                <h2 style={{ fontSize: 18 }}>Founding terms · version {agreement.version}</h2>
                {termsFullySigned(v) ? <EvidenceBadge label="SIGNED" source={v.source} /> : <StatusPill status="AWAITING_APPROVALS">Awaiting signatures</StatusPill>}
              </div>
            }
            actions={
              <Button variant="secondary" size="sm" onClick={startEdit} data-testid="terms-edit">
                Edit terms
              </Button>
            }
            testId="card-terms"
          >
            <div className="stack">
              <article className="doc" data-testid="terms-doc">
                <p style={{ fontStyle: "italic", color: "var(--muted)" }}>
                  Founding terms of {v.displayName} ({v.ensName}). A record of intent between the founders below. Not a legal entity, not legal advice.
                </p>
                {FIELD_META.map((f) => (
                  <div key={f.key}>
                    <h3>{f.label}</h3>
                    <p>{current[f.key]}</p>
                  </div>
                ))}
              </article>
              <dl className="kv">
                <dt>Document hash</dt>
                <dd className="mono small" data-testid="terms-hash">{agreement.docHash}</dd>
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
                <dd className="small muted">When both founders sign, this hash is written to the <span className="mono">vestige.agreement</span> record of {v.ensName}. The text stays private.</dd>
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
                      const r = await sign.run(async () => {
                        const signature = await requestSignature({
                          title: `Sign the founding terms of ${v.displayName}, version ${agreement.version}`,
                          lines: [
                            { label: "Venture", value: v.ensName },
                            { label: "Version", value: String(agreement.version) },
                            { label: "Document", value: shortHex(agreement.docHash, 10, 8) },
                          ],
                          typedDataName: "FoundingTerms",
                          costsGas: false,
                        });
                        if (!signature || !address) return null;
                        return client.signAgreement(v.ventureId, { version: agreement.version, docHash: agreement.docHash, sig: { signer: address, signature } });
                      });
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
