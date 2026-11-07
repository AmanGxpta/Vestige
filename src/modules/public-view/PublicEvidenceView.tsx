"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdapterErrorNotice, Button, Card, CheckIcon, EvidenceBadge, HashLink, LoadingCard, SeatWorldBadge, Notice, StatusPill } from "@/components/ui";
import { ADAPTER_KIND, CONFIG, explorerAddress } from "@/src/modules/ui/config";
import { Icon, Mountains, VentureTile } from "@/components/brand";
import { formatTokenAmount, relativeTime, shortHex } from "@/src/modules/ui/format";
import { useVestige } from "@/src/modules/ui/provider";
import type { AdapterError } from "@/src/modules/ui/adapter";
import type { EvidenceKind, Hex, PublicOffchainEvidence } from "@/src/modules/ui/types";
import { readPublicChainReport, type PublicChainReport, type Step } from "./chain-reader";
import { readMockChainReport } from "./mock-chain";
import { loadManifest, manifestUrlFor } from "./manifest";
import { deriveTreasuryVerdict } from "./verdict";

type Phase = "ens" | "whitechain" | "offchain" | "done";

const KIND_TEXT: Record<EvidenceKind, string> = {
  VENTURE_CREATED: "Venture created",
  FOUNDER_JOINED: "Co-founder joined",
  ENS_REGISTERED: "ENS name registered",
  ENS_RECORD: "ENS record updated",
  FOUNDER_VERIFIED: "Founder verified as a unique human",
  SEAT_ATTESTED: "Seat attested on Whitechain",
  DUPLICATE_REFUSED: "Duplicate human refused a second seat",
  DEMO_OVERRIDE: "Operator marked a seat ready (demo override, not World ID)",
  AGREEMENT_VERSION: "Agreement version created",
  AGREEMENT_SIGNED: "Agreement signed",
  SAFE_DEPLOYED: "Treasury Safe deployed",
  DEPOSIT: "USDT deposit",
  PAYMENT_PROPOSED: "Payment proposed",
  PAYMENT_APPROVED: "Payment approved",
  REJECTED_ATTEMPT: "Single-signer attempt rejected on-chain",
  PAYMENT_EXECUTED: "Payment executed",
};

function StepLine<T>({ s, children }: { s: Step<T>; children?: React.ReactNode }) {
  return (
    <div className="stack-sm">
      <div className="row">
        <StatusPill status={s.status} mock={s.provenance.source === "DEV_MOCK"} />
        {children}
      </div>
      {s.note && <span className="small muted">{s.note}</span>}
      <span className="tiny faint mono">
        {s.provenance.source === "DEV_MOCK" ? "DEV MOCK · " : ""}
        chain {s.provenance.chainId} · {s.provenance.method}
        {s.provenance.blockNumber ? ` · block ${s.provenance.blockNumber}` : ""}
      </span>
    </div>
  );
}


export function PublicEvidenceView({ ensName, requestedSource }: { ensName: string; requestedSource?: string }) {
  const { client } = useVestige();
  const useMock = requestedSource === "mock" && ADAPTER_KIND === "dev-mock";
  const mockRefused = requestedSource === "mock" && ADAPTER_KIND !== "dev-mock";
  const [phase, setPhase] = useState<Phase>("ens");
  const [report, setReport] = useState<PublicChainReport | null>(null);
  const [off, setOff] = useState<{ ok: true; value: PublicOffchainEvidence } | { ok: false; error: AdapterError } | null>(null);
  const [run, setRun] = useState(0);
  const runRef = useRef(0);

  const load = useCallback(async () => {
    const id = ++runRef.current;
    setPhase("ens");
    setReport(null);
    setOff(null);
    // Off-chain API request starts in parallel but is only *joined* after the chain reads.
    const offP = client.getPublicEvidence(ensName);
    // API ventureId is a cross-check only; the reader takes ventureId from ENS (CR-C2-002).
    const apiVentureIdSource = async (): Promise<Hex | undefined> => {
      const r = await offP;
      return r.ok ? r.value.ventureId : undefined;
    };
    const t = setTimeout(() => runRef.current === id && setPhase("whitechain"), 900);
    const rep = useMock
      ? await readMockChainReport(ensName, client)
      : await readPublicChainReport(ensName, {
          sepoliaRpcUrl: CONFIG.sepoliaRpcUrl,
          whitechainRpcUrl: CONFIG.whitechainRpcUrl,
          usdtAddress: CONFIG.usdtAddress,
          universalResolver: CONFIG.ensUniversalResolver,
          manifest: loadManifest(manifestUrlFor(CONFIG.manifestUrl, ensName)),
          apiVentureIdSource,
        });
    clearTimeout(t);
    if (runRef.current !== id) return;
    setReport(rep);
    setPhase("offchain");
    const o = await offP;
    if (runRef.current !== id) return;
    setOff(o.ok ? { ok: true, value: o.value } : { ok: false, error: o.error });
    setPhase("done");
  }, [client, ensName, useMock]);

  useEffect(() => {
    void load();
  }, [load, run]);

  const verdict = report ? deriveTreasuryVerdict(report) : null;
  const texts = report?.ens.texts.value ?? {};
  const w = report?.whitechain;
  const offv = off?.ok ? off.value : undefined;
  const isMock = report?.source === "DEV_MOCK";

  // CR-ID-06: an owner seat attested from the MOCK_ONLY demo-override hash is a real chain seat, not a World ID human.
  const overrideOwners = (offv?.founders ?? []).filter((f) => f.demoOverride && f.wallet && w?.owners.value?.some((o) => o.toLowerCase() === f.wallet!.toLowerCase()));
  const overrideFounders = (offv?.founders ?? []).filter((f) => f.demoOverride);
  const agreementOnEns = texts["vestige.agreement"];
  const agreementMatch = offv?.agreement && agreementOnEns ? agreementOnEns.toLowerCase() === offv.agreement.docHash.toLowerCase() : undefined;

  return (
    <div className="stack-lg" data-testid="public-evidence" data-phase={phase}>
      {isMock && (
        <Notice tone="mock" title="DEV MOCK chain data" testId="public-mock-notice">
          This page is showing simulated ENS and Whitechain values from the in-browser mock store, to test layout only. Remove{" "}
          <code>?source=mock</code> to read the real chains.
        </Notice>
      )}
      {mockRefused && <Notice tone="warn" title="Mock data is disabled in this build. Showing real chain reads." />}

      <div>
        <header className="pv-hero" data-testid="pv-hero">
          <Mountains />
          <div className="row-between" style={{ alignItems: "flex-start" }}>
            <div className="row" style={{ gap: 16, flexWrap: "nowrap", minWidth: 0 }}>
              <VentureTile name={ensName} large />
              <div className="stack-sm" style={{ gap: 4, minWidth: 0 }}>
                <span className="eyebrow" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Public evidence · no account needed
                </span>
                <h1 data-testid="public-ens-name" style={{ overflowWrap: "anywhere" }}>
                  {ensName}
                </h1>
                <span className="small muted">
                  Read {report ? relativeTime(report.startedAt) : "now"}
                  {w?.blockNumber.value ? ` · Whitechain block ${w.blockNumber.value}` : ""}
                </span>
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {verdict ? (
                <StatusPill status={verdict.state === "UNRESOLVED" ? "UNKNOWN" : verdict.state} mock={isMock}>
                  {
                    {
                      ACTIVE: "Treasury active",
                      NOT_ACTIVE: "Treasury not active",
                      UNVERIFIED: "Treasury unverified",
                      UNRESOLVED: report?.ens.resolver.status === "VERIFIED" ? "No treasury linked" : "Name not resolved",
                    }[verdict.state]
                  }
                </StatusPill>
              ) : (
                <StatusPill status="PENDING">Reading chains…</StatusPill>
              )}
              {report?.ens.treasury.value && !isMock && (
                <a className="btn btn-secondary btn-sm" href={explorerAddress(1874, report.ens.treasury.value.address)} target="_blank" rel="noreferrer">
                  View on explorer <Icon name="external" size={14} />
                </a>
              )}
              <Button variant="secondary" size="sm" onClick={() => setRun((r) => r + 1)} disabled={phase !== "done"} data-testid="rerun">
                Re-run checks
              </Button>
            </div>
          </div>
        </header>
        <div className="pv-overlap">
      {overrideFounders.length > 0 && !isMock && (
        <Notice tone="mock" title="One founder seat is a demo override (MOCK_ONLY)" testId="public-override-notice">
          {overrideFounders.map((f) => f.founderSubname).join(", ")} was marked ready by an operator for the demo (CR-ID-06). It is not World-verified and is not counted
          as a human{overrideOwners.length ? "; its on-chain seat was attested from a demo-override hash, not a World ID nullifier" : ""}. The chain checks below are real; this seat&apos;s humanity is not.
        </Notice>
      )}
      <ol className="card card-pad steps" aria-label="Verification order" style={{ listStyle: "none", margin: 0 }}>
        {(
          [
            ["ens", "Resolve the name on Ethereum Sepolia", "ENS resolver, ENSIP-11 Whitechain address, vestige records"],
            ["whitechain", "Read the treasury on Whitechain", "Safe owners, threshold, Guard binding, code, modules, SeatRegistry, USDT — checked against the reviewed manifest"],
            ["offchain", "Join off-chain evidence from vestige", "World ID results and agreement signatures — no personal data"],
          ] as const
        ).map(([key, title, sub], i) => {
          const order: Phase[] = ["ens", "whitechain", "offchain", "done"];
          const reached = order.indexOf(phase) > i;
          const active = phase === key;
          // Outcome of a finished phase — "done" must not imply "succeeded".
          const outcome: "ok" | "failed" | "skipped" | "partial" | undefined = !reached
            ? undefined
            : key === "ens"
              ? report?.ens.treasury.status === "VERIFIED" ? "ok" : report?.ens.resolver.status === "VERIFIED" ? "partial" : "failed"
              : key === "whitechain"
                ? !report?.whitechain ? "skipped" : verdict?.state === "ACTIVE" ? "ok" : "partial"
                : off?.ok ? "ok" : "failed";
          const glyph = { ok: "✓", failed: "✕", skipped: "–", partial: "!" };
          const outcomeText = { ok: "", failed: "did not complete", skipped: "skipped", partial: "some checks did not pass" };
          return (
            <li key={key} className={`step ${outcome === "ok" ? "step-done" : outcome ? `step-${outcome}` : active ? "step-pending" : ""}`} data-testid={`phase-${key}`} data-outcome={outcome}>
              <span className="step-dot">{outcome ? glyph[outcome] : i + 1}</span>
              <span>
                <span className="step-title">{title}</span>
                <br />
                <span className="step-sub">
                  {sub}
                  {outcome && outcome !== "ok" && (
                    <strong>
                      {" · "}
                      {key === "ens" && outcome === "partial" && report?.ens.treasury.status === "UNKNOWN" && report.ens.texts.value?.["vestige.status"] === "workspace"
                        ? "name resolved · no treasury linked yet"
                        : outcomeText[outcome]}
                    </strong>
                  )}
                </span>
              </span>
              {active && <span className="spinner" style={{ color: "var(--pending)" }} aria-label="in progress" />}
            </li>
          );
        })}
      </ol>
        </div>
      </div>
      <Notice tone="legal" title="Workspace — not legally incorporated">
        A vestige venture is a team workspace with verifiable records. It is not a company and confers no legal rights.
      </Notice>

      {!report ? (
        <LoadingCard lines={4} />
      ) : (
        <div className="split">
          <div className="stack-lg">
            {/* 1. ENS */}
            <Card title="1 · Identity on Ethereum Sepolia" testId="card-ens" actions={<span className="tiny faint">chain 11155111</span>}>
              <dl className="kv">
                <dt>Resolver</dt>
                <dd>
                  <StepLine s={report.ens.resolver}>
                    {report.ens.resolver.value && <HashLink value={report.ens.resolver.value} chainId={11155111} kind="address" source={report.source === "DEV_MOCK" ? "DEV_MOCK" : "CHAIN"} />}
                  </StepLine>
                </dd>
                <dt>Treasury link</dt>
                <dd>
                  <StepLine s={report.ens.treasury}>
                    {report.ens.treasury.value && (
                      <>
                        <HashLink value={report.ens.treasury.value.address} chainId={1874} kind="address" source={isMock ? "DEV_MOCK" : "CHAIN"} />
                        <span className="tiny muted">{report.ens.treasury.value.via === "ENSIP-11" ? "ENSIP-11 · coin type 2147485522" : "text-record fallback"}</span>
                      </>
                    )}
                  </StepLine>
                </dd>
                {report.ens.texts.status === "VERIFIED" && (
                  <>
                    <dt>vestige.ventureId</dt>
                    <dd data-testid="ens-venture-id" data-status={report.ens.ventureId.status}>
                      {report.ens.ventureId.value ? (
                        <span className="mono small" title={report.ens.ventureId.value}>
                          {shortHex(report.ens.ventureId.value, 10, 8)}
                        </span>
                      ) : (
                        <span className="faint">{report.ens.ventureId.note ?? "not set"}</span>
                      )}
                    </dd>
                    <dt>vestige.status</dt>
                    <dd>{texts["vestige.status"] ? <code>{texts["vestige.status"]}</code> : <span className="faint">not set</span>}</dd>
                    <dt>vestige.humans</dt>
                    <dd>{texts["vestige.humans"] ?? <span className="faint">not set</span>}</dd>
                    <dt>vestige.agreement</dt>
                    <dd>{agreementOnEns ? <span className="mono small">{shortHex(agreementOnEns, 10, 8)}</span> : <span className="faint">not set</span>}</dd>
                    <dt>vestige.guard</dt>
                    <dd>{texts["vestige.guard"] ? <span className="mono small">{shortHex(texts["vestige.guard"])}</span> : <span className="faint">not set</span>}</dd>
                  </>
                )}
              </dl>
              {report.ens.resolver.status !== "VERIFIED" && (
                <div style={{ marginTop: 16 }}>
                  <Notice tone="warn" title="This name did not resolve" testId="ens-unresolved">
                    We will not guess a treasury address. Without an ENS record there is nothing to verify on Whitechain.
                  </Notice>
                </div>
              )}
            </Card>

            {/* 2. Whitechain */}
            <Card title="2 · Treasury on Whitechain" testId="card-whitechain" actions={<span className="tiny faint">chain 1874</span>}>
              {!w ? (
                <div className="stack-sm">
                  <p className="muted small">Not read — the name did not lead to a treasury address.</p>
                  {report?.manifest.status === "LOADED" && report.manifest.manifest.ensName === (report.normalizedName ?? ensName) && (
                    <p className="small" data-testid="manifest-unlinked">
                      A reviewed deployment manifest names Safe{" "}
                      <HashLink value={report.manifest.manifest.contracts.safe.address} chainId={1874} kind="address" source="CHAIN" /> for this venture, but{" "}
                      {ensName} does not point to it on ENS yet (ENSIP-11 address not set), so it cannot be verified from the name.
                    </p>
                  )}
                </div>
              ) : (
                <div className="stack">
                  <ul className="checks" data-testid="treasury-checks">
                    {verdict!.checks
                      .filter((c) => !["ens", "link"].includes(c.id))
                      .map((c) => (
                        <li key={c.id} data-testid={`check-${c.id}`} data-status={c.status}>
                          <CheckIcon status={c.status} mock={isMock} />
                          <span>
                            <strong className="small">{c.label}</strong>
                            <br />
                            <span className="small muted">{c.detail}</span>
                            {c.id === "seats" && overrideOwners.length > 0 && (
                              <span className="small" style={{ display: "block", color: "var(--warn, #8a5a00)" }} data-testid="seats-override-qualifier">
                                {overrideOwners.length} owner seat{overrideOwners.length > 1 ? "s were" : " was"} attested from a MOCK_ONLY demo-override hash — not a World ID proof.
                              </span>
                            )}
                          </span>
                          {c.status === "VERIFIED" && !isMock ? <EvidenceBadge label="CHAIN_VERIFIED" source="CHAIN" /> : isMock && c.status === "VERIFIED" ? <EvidenceBadge label="CHAIN_VERIFIED" source="DEV_MOCK" /> : null}
                        </li>
                      ))}
                  </ul>
                  {w.owners.value && (
                    <dl className="kv">
                      {w.owners.value.map((o, i) => (
                        <div key={o} style={{ display: "contents" }}>
                          <dt>Owner {i + 1}</dt>
                          <dd>
                            <HashLink value={o} chainId={1874} kind="address" source={isMock ? "DEV_MOCK" : "CHAIN"} />
                          </dd>
                        </div>
                      ))}
                      <dt>USDT balance</dt>
                      <dd data-testid="treasury-balance">
                        {w.token.value ? (
                          <strong>
                            {formatTokenAmount(w.token.value.balanceRaw, w.token.value.decimals)} {w.token.value.symbol}
                          </strong>
                        ) : (
                          <StatusPill status={w.token.status} />
                        )}
                      </dd>
                    </dl>
                  )}
                </div>
              )}
            </Card>

            {/* USDT activity */}
            {w && (
              <Card title="USDT activity" testId="card-transfers" pad={false}>
                {w.transfers.status !== "VERIFIED" ? (
                  <div className="card-body">
                    <StepLine s={w.transfers} />
                  </div>
                ) : w.transfers.value!.length === 0 ? (
                  <div className="card-body muted small">No USDT transfers to or from this treasury in the scanned range.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Direction</th>
                          <th>Amount</th>
                          <th>Counterparty</th>
                          <th>Transaction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {w.transfers.value!.map((t) => (
                          <tr key={`${t.txHash}-${t.direction}`}>
                            <td>{t.direction === "IN" ? "Deposit in" : "Payment out"}</td>
                            <td className="mono">{formatTokenAmount(t.valueRaw, w.token.value?.decimals ?? 6)} USDT</td>
                            <td>
                              <HashLink value={t.direction === "IN" ? t.from : t.to} chainId={1874} kind="address" source={isMock ? "DEV_MOCK" : "CHAIN"} />
                            </td>
                            <td>
                              <HashLink value={t.txHash} chainId={1874} source={isMock ? "DEV_MOCK" : "CHAIN"} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {/* 3. Off-chain */}
            <Card title="3 · Humans and terms" testId="card-offchain" actions={<span className="tiny faint">vestige API · off-chain</span>}>
              {!off ? (
                <LoadingCard lines={2} />
              ) : !off.ok ? (
                <AdapterErrorNotice error={off.error} />
              ) : (
                <div className="stack">
                  <dl className="kv">
                    <dt>Verified humans</dt>
                    <dd data-testid="humans-verified">
                      <strong>{off.value.humansVerified}</strong> of {off.value.founders.length} founders
                      {texts["vestige.humans"] !== undefined && texts["vestige.humans"] !== null && (
                        <span className="small muted"> · ENS record says {texts["vestige.humans"]}</span>
                      )}
                    </dd>
                    {off.value.founders.map((f) => (
                      <div key={f.founderSubname} style={{ display: "contents" }}>
                        <dt className="mono small">{f.founderSubname}</dt>
                        <dd className="row">
                          {f.worldProofStatus === "VERIFIED" || f.demoOverride ? <SeatWorldBadge seat={f} source={off.value.source} /> : <StatusPill status={f.worldProofStatus === "UNKNOWN" ? "NONE" : f.worldProofStatus} />}
                        </dd>
                      </div>
                    ))}
                    <dt>Founding terms</dt>
                    <dd>
                      {off.value.agreement ? (
                        <span className="stack-sm">
                          <span className="row">
                            Version {off.value.agreement.version} · {off.value.agreement.signaturesForCurrentVersion} of {off.value.agreement.requiredSignatures} signatures
                            {off.value.agreement.signaturesForCurrentVersion >= off.value.agreement.requiredSignatures && off.value.agreement.requiredSignatures >= 2 && (
                              <EvidenceBadge label="SIGNED" source={off.value.source} />
                            )}
                          </span>
                          <span className="mono small">{shortHex(off.value.agreement.docHash, 10, 8)}</span>
                          {agreementMatch === true && <span className="small" style={{ color: "var(--chain)" }}>✓ Matches the hash in the ENS record</span>}
                          {agreementMatch === false && <span className="small" style={{ color: "var(--failed)" }}>✕ Does not match the ENS record hash</span>}
                          <span className="tiny faint">The agreement text is private to the founders. Only its hash is public.</span>
                        </span>
                      ) : (
                        <span className="faint">No terms drafted yet</span>
                      )}
                    </dd>
                  </dl>
                </div>
              )}
            </Card>

            {offv && offv.evidence.length > 0 && (
              <Card title="Evidence timeline" testId="card-timeline">
                <ul className="timeline">
                  {[...offv.evidence].reverse().map((e) => (
                    <li key={e.id} data-testid="timeline-item" data-kind={e.kind}>
                      <span className={`tl-dot tl-${e.kind === "DUPLICATE_REFUSED" || e.kind === "REJECTED_ATTEMPT" ? "FAILED" : e.label}`} />
                      <div className="row-between">
                        <div className="stack-sm" style={{ gap: 2 }}>
                          <strong className="small" style={e.kind === "DUPLICATE_REFUSED" || e.kind === "REJECTED_ATTEMPT" ? { color: "var(--failed)" } : undefined}>
                            {KIND_TEXT[e.kind]}
                          </strong>
                          <span className="tiny muted">{relativeTime(e.confirmedAt)}</span>
                        </div>
                        <div className="row">
                          {e.status !== "VERIFIED" && <StatusPill status={e.status} />}
                          {e.txHash && <HashLink value={e.txHash} chainId={e.chainId} source={e.source} />}
                          <EvidenceBadge
                            label={e.label}
                            source={e.source}
                            qualifier={e.qualifier ?? (e.label === "HUMAN_VERIFIED" && e.source !== "DEV_MOCK" ? "ENV_UNREPORTED" : undefined)}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <aside className="stack" style={{ position: "sticky", top: 16 }}>
            <Card title="What vestige checks">
              <div className="stack-sm small">
                <p>
                  <strong>Two people, not two keys.</strong> A seat is meant to be written only after a World ID uniqueness check, so one person can&apos;t hold
                  both seats. Section 3 shows what this venture actually has.
                  {overrideFounders.length > 0 && <> Here, one seat is a labelled demo override with no World ID proof.</>}
                </p>
                <p>
                  <strong>Neither can move money alone.</strong> The treasury is a Safe that needs both signatures, read live from Whitechain above
                  {verdict?.state === "ACTIVE" ? "." : " once it is deployed and linked."}
                </p>
                <p>
                  <strong>The rule can&apos;t be quietly switched off.</strong> The vestige Guard rejects swapping an owner for an unverified wallet.
                </p>
                <p>
                  <strong>You don&apos;t have to trust vestige.</strong> Steps 1 and 2 come from public chains, so anyone can repeat them.
                </p>
              </div>
            </Card>
            <Card title="Data sources">
              <dl className="kv small" style={{ gridTemplateColumns: "1fr" }}>
                <dt>Ethereum Sepolia RPC</dt>
                <dd className="mono tiny">{isMock ? "DEV MOCK" : CONFIG.sepoliaRpcUrl}</dd>
                <dt>Whitechain RPC</dt>
                <dd className="mono tiny">{isMock ? "DEV MOCK" : CONFIG.whitechainRpcUrl}</dd>
                <dt>Test USDT</dt>
                <dd className="mono tiny">{CONFIG.usdtAddress}</dd>
                <dt>Deployment manifest</dt>
                <dd className="tiny" data-testid="manifest-source">
                  {report.manifest.status === "LOADED"
                    ? `${report.manifest.url} · approved ${report.manifest.manifest.approvedAt.slice(0, 10)}`
                    : report.manifest.status === "NOT_CONFIGURED"
                      ? "not configured — Guard, registry and code cannot be confirmed"
                      : report.manifest.status === "INVALID"
                        ? `rejected: ${report.manifest.problems[0]}`
                        : `unreachable: ${report.manifest.error}`}
                </dd>
                <dt>SeatRegistry</dt>
                <dd className="mono tiny">{w?.binding.value?.registry ?? "read from the Guard (not available)"}</dd>
                {w?.scanFrom && (
                  <>
                    <dt>Transfers scanned from</dt>
                    <dd className="tiny">
                      block {w.scanFrom.block} {w.scanFrom.fromManifest ? "(manifest deploymentBlock)" : "(recent blocks only — no manifest)"}
                    </dd>
                  </>
                )}
                <dt>Off-chain evidence</dt>
                <dd className="tiny">{ADAPTER_KIND === "dev-mock" ? "DEV MOCK adapter" : "vestige API (C1)"}</dd>
              </dl>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
