"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdapterErrorNotice, Button, Card, EvidenceBadge, HashLink, Notice, StatusPill } from "@/components/ui";
import { RelayerExplainer } from "@/components/RelayerExplainer";
import { formatTokenAmount } from "@/src/modules/ui/format";
import { useVestige } from "@/src/modules/ui/provider";
import { attestedSeats, isTreasuryActive, seatFor, treasuryStatusText } from "@/src/modules/ui/progress";
import { useAction } from "@/src/modules/ui/useAction";
import { useVenture } from "@/src/modules/ui/venture/VentureContext";
import { useChainTreasury } from "@/src/modules/ui/useChainTreasury";
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
  const active = isTreasuryActive(tr);
  const chain = useChainTreasury(active ? tr?.safeAddress : undefined, tr?.deploymentBlock);
  const requested = t?.operations?.filter((o) => o.status === "RESERVED") ?? [];
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
              <li>You don&apos;t sign a transaction or pay gas — vestige&apos;s operator deploys it after H approves the exact parameters.</li>
            </ul>
            <Notice tone="warn" title="No recovery path, by design" testId="no-recovery">
              The Guard refuses owner changes except a swap to another verified-human seat, and there is no admin or recovery key. If a founder loses their
              wallet key, the funds in this treasury can become permanently inaccessible. Keep your key safe.
            </Notice>
            {deploy.error?.detail?.startsWith("operation") ? (
              <Notice tone="info" title="Deployment requested — waiting for operator approval" testId="deploy-requested">
                {deploy.error.message} <span className="tiny faint">({deploy.error.detail})</span>
              </Notice>
            ) : (
              deploy.error && <AdapterErrorNotice error={deploy.error} />
            )}
            {t?.readStatus === "UNVERIFIED" && (
              <Notice tone="warn" title="Treasury not verified" testId="treasury-unverified">
                A reviewed manifest exists for this venture, but the treasury service&apos;s independent on-chain checks did not pass, so no Safe is shown as
                active.
              </Notice>
            )}
            {!deploy.error && requested.length > 0 && (
              <Notice tone="info" title="A treasury request is recorded" testId="deploy-recorded">
                {requested.length} operation{requested.length > 1 ? "s" : ""} RESERVED. No transaction has been sent; the Safe appears here only after deployment and chain read-back.
              </Notice>
            )}
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
              <StatusPill status={tr.verificationStatus === "UNKNOWN" ? "UNKNOWN" : tr.verificationStatus} mock={t!.source === "DEV_MOCK"}>
                {active ? "Active" : tr.verificationStatus === "PENDING" ? "Confirming on Whitechain…" : treasuryStatusText(tr)}
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
                {chain.status === "ok" ? (
                  <>
                    <strong>{formatTokenAmount(chain.value.balanceRaw, chain.value.decimals)} USDT</strong>
                    <span className="tiny faint"> · read from Whitechain at block {chain.value.blockNumber}</span>
                  </>
                ) : chain.status === "error" ? (
                  <StatusPill status="UNKNOWN">Could not read balance</StatusPill>
                ) : t?.balanceRaw !== undefined ? (
                  <strong>{formatTokenAmount(t.balanceRaw, t.tokenDecimals ?? 6)} USDT</strong>
                ) : (
                  <span className="faint">—</span>
                )}
                <span className="tiny faint"> (test USDT — not real money)</span>
              </dd>
              {t?.worldSource && (
                <>
                  <dt>World provenance</dt>
                  <dd data-testid="treasury-world-source">
                    {t.worldSource === "TESTED_IN_SIMULATOR" ? (
                      <span className="badge badge-mock-tag">TESTED IN SIMULATOR</span>
                    ) : t.worldSource === "WORLD_PRODUCTION" ? (
                      "World production proofs for both seats"
                    ) : (
                      <StatusPill status="UNKNOWN">Unknown</StatusPill>
                    )}
                    <span className="tiny faint"> · reported by the treasury service{t.readAtBlock ? ` at block ${t.readAtBlock}` : ""}</span>
                  </dd>
                </>
              )}
            </dl>
          </div>
        </Card>
      )}

      {active && (
        <Card title="Get funded" testId="card-funding-link">
          <div className="stack">
            <p className="small">
              Send your funder this link. They approve a USDT deposit by signing one message on Whitechain — no gas token needed, though their wallet may
              ask to switch network. The deposit goes straight to your Safe.
            </p>
            <input className="input mono small" readOnly value={`${origin}/funder/${v.ensName}`} aria-label="Funding link" data-testid="funding-link" />
            {t?.depositsStatus && t.depositsStatus !== "VERIFIED" && (
              <span className="small faint" data-testid="deposits-incomplete">
                Deposit history from the treasury service is {t.depositsStatus === "PENDING" ? "still catching up" : "unknown"} — not a zero balance.
              </span>
            )}
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
