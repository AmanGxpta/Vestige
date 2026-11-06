"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdapterErrorNotice, Button, Card, EvidenceBadge, HashLink, Notice, StatusPill } from "@/components/ui";
import { RelayerExplainer } from "@/components/RelayerExplainer";
import { formatTokenAmount } from "@/src/modules/ui/format";
import { useVestige } from "@/src/modules/ui/provider";
import { attestedSeats, seatFor } from "@/src/modules/ui/progress";
import { useAction } from "@/src/modules/ui/useAction";
import { useVenture } from "@/src/modules/ui/venture/VentureContext";
import type { TreasuryState } from "@/src/modules/ui/types";

export default function TreasuryPage() {
  const { venture, treasury, ventureId, refreshAll } = useVenture();
  const { client, address } = useVestige();
  const deploy = useAction<TreasuryState>();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  if (venture.status !== "ok") return null;
  const v = venture.data;
  if (treasury.status === "error") return <AdapterErrorNotice error={treasury.error} />;
  const t = treasury.status === "ok" ? treasury.data : undefined;
  const tr = t?.treasury;
  const seat = seatFor(v, address);
  const attested = attestedSeats(v).length;
  const active = tr?.verificationStatus === "VERIFIED";
  const ownersMatchSeats = !!tr && tr.ownerAddresses.length === 2 && tr.ownerAddresses.every((o) => v.seats.some((s) => s.wallet.toLowerCase() === o.toLowerCase()));

  return (
    <>
      {!tr ? (
        <Card title="Set up the treasury" testId="card-treasury-setup">
          <div className="stack">
            <p>
              vestige deploys a <strong>Safe</strong> on Whitechain owned by both founders, with a <strong>2-of-2 rule</strong>: every payment needs
              both of you. The <strong>vestige Guard</strong> is attached so the owners can only ever be verified-human seats.
            </p>
            <ul className="small stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Owners: the two founder wallets ({attested}/2 attested on Whitechain)</li>
              <li>Token: Whitechain test USDT</li>
              <li>You don&apos;t sign a transaction or pay gas — vestige&apos;s relayer deploys it.</li>
            </ul>
            {deploy.error && <AdapterErrorNotice error={deploy.error} />}
            <div>
              <Button
                loading={deploy.busy}
                data-testid="treasury-deploy"
                disabledReason={!seat ? "Only founders can set up the treasury." : attested < 2 ? "Both founders must be verified humans with seats attested on Whitechain." : null}
                onClick={async () => {
                  if (!address) return;
                  const r = await deploy.run(() => client.deployTreasury(v.ventureId, { wallet: address }));
                  if (r) refreshAll();
                }}
              >
                Deploy 2-of-2 treasury
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card
          title={
            <div className="row">
              <h2 style={{ fontSize: 18 }}>Treasury on Whitechain</h2>
              <StatusPill status={active ? "ACTIVE" : tr.verificationStatus === "PENDING" ? "PENDING" : "UNVERIFIED"} mock={t!.source === "DEV_MOCK"}>
                {active ? "Active" : tr.verificationStatus === "PENDING" ? "Confirming on Whitechain…" : "Unverified"}
              </StatusPill>
            </div>
          }
          testId="card-treasury"
        >
          <div className="stack">
            {!active && (
              <Notice tone="info" title="Not active until read back from the chain">
                The treasury is shown as active only after its owners, threshold and Guard have been read back from Whitechain.
              </Notice>
            )}
            <dl className="kv">
              <dt>Safe address</dt>
              <dd>
                <HashLink value={tr.safeAddress} chainId={1874} kind="address" source={t!.source} head={10} tail={8} />
              </dd>
              <dt>Owners</dt>
              <dd className="stack-sm">
                {tr.ownerAddresses.map((o) => {
                  const s = v.seats.find((x) => x.wallet.toLowerCase() === o.toLowerCase());
                  return (
                    <span key={o} className="row small">
                      <HashLink value={o} chainId={1874} kind="address" source={t!.source} />
                      <span className="mono faint">{s?.founderSubname ?? "not a seat!"}</span>
                    </span>
                  );
                })}
                {active && !ownersMatchSeats && <span style={{ color: "var(--failed)" }}>Owners do not match the venture&apos;s seats.</span>}
              </dd>
              <dt>Signing rule</dt>
              <dd>{active ? <strong>{tr.threshold} of {tr.ownerAddresses.length} must sign</strong> : <span className="faint">reading…</span>}</dd>
              <dt>vestige Guard</dt>
              <dd>
                <HashLink value={tr.guardAddress} chainId={1874} kind="address" source={t!.source} />
              </dd>
              <dt>Seat registry</dt>
              <dd>
                <HashLink value={tr.registryAddress} chainId={1874} kind="address" source={t!.source} />
              </dd>
              <dt>Deployment</dt>
              <dd className="row">
                <HashLink value={tr.deploymentTxHash} chainId={1874} source={t!.source} />
                {active && <EvidenceBadge label="CHAIN_VERIFIED" source={t!.source} />}
              </dd>
              <dt>Balance</dt>
              <dd data-testid="founder-balance">
                {t?.balanceRaw !== undefined ? <strong>{formatTokenAmount(t.balanceRaw, t.tokenDecimals ?? 6)} USDT</strong> : <span className="faint">—</span>}
                <span className="tiny faint"> (test USDT — not real money)</span>
              </dd>
            </dl>
          </div>
        </Card>
      )}

      {active && (
        <Card title="Get funded" testId="card-funding-link">
          <div className="stack">
            <p className="small">
              Send your funder this link. They approve a USDT deposit by signing one message — no gas token, no network switch. The deposit goes
              straight to your Safe.
            </p>
            <input className="input mono small" readOnly value={`${origin}/funder/${ventureId}`} aria-label="Funding link" data-testid="funding-link" />
            {t && t.deposits.length > 0 && (
              <ul className="stack-sm small" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {t.deposits.map((d) => (
                  <li key={d.txHash} className="row">
                    <span>Deposit {formatTokenAmount(d.amountRaw, t.tokenDecimals ?? 6)} USDT</span>
                    <StatusPill status={d.status} mock={t.source === "DEV_MOCK"} />
                    <HashLink value={d.txHash} chainId={1874} source={t.source} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      <RelayerExplainer />

      {active && (
        <div className="row">
          <Link className="btn" href={`/founder/${ventureId}/payments`} data-testid="next-payments">
            Next: payments →
          </Link>
        </div>
      )}
    </>
  );
}
