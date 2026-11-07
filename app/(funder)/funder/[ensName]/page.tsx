"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdapterErrorNotice, Button, Card, CheckIcon, Field, HashLink, HumanBadge, LoadingCard, Notice, SignInNotice, StatusPill } from "@/components/ui";
import { RelayerExplainer } from "@/components/RelayerExplainer";
import { ADAPTER_KIND, CONFIG } from "@/src/modules/ui/config";
import { formatTokenAmount, parseTokenAmount } from "@/src/modules/ui/format";
import { hasPending, isTreasuryActive } from "@/src/modules/ui/progress";
import { useAdapterQuery, useVestige } from "@/src/modules/ui/provider";
import { useAction } from "@/src/modules/ui/useAction";
import { ok } from "@/src/modules/ui/adapter";
import { resolveEnsVenture } from "@/src/modules/public-view/chain-reader";
import { useChainTreasury } from "@/src/modules/ui/useChainTreasury";
import type { Address, Hex, TreasuryState, VentureId } from "@/src/modules/ui/types";

type EnsTarget = { status: "loading" } | { status: "ok"; safe: Address; ventureId: Hex; mock: boolean } | { status: "failed"; reason: string };

/**
 * Public funding view (CONTRACTS v0): minimal public summary only — never the
 * founders-only venture endpoint. The deposit destination and ventureId come from
 * ENS on Sepolia; a mismatch with the treasury readback refuses to fund.
 */
export default function FundVenturePage() {
  const { ensName: raw } = useParams<{ ensName: string }>();
  const ensName = decodeURIComponent(raw ?? "").toLowerCase();
  const { client, address, role, signer, sessionWallet } = useVestige();
  const pub = useAdapterQuery((c) => c.getPublicEvidence(ensName), [ensName]);
  const [ens, setEns] = useState<EnsTarget>({ status: "loading" });
  const pubVentureId = pub.status === "ok" ? pub.data.ventureId : undefined;

  useEffect(() => {
    let alive = true;
    if (ADAPTER_KIND === "dev-mock") {
      // DEV MOCK names are not on Sepolia; use the mock record and say so.
      if (pubVentureId) setEns({ status: "loading" });
      return;
    }
    resolveEnsVenture(ensName, { sepoliaRpcUrl: CONFIG.sepoliaRpcUrl, universalResolver: CONFIG.ensUniversalResolver }).then(
      (r) => alive && setEns(r.ok ? { status: "ok", safe: r.safe, ventureId: r.ventureId, mock: false } : { status: "failed", reason: r.reason }),
    );
    return () => {
      alive = false;
    };
  }, [ensName, pubVentureId]);

  const ventureId: VentureId | undefined = ens.status === "ok" ? ens.ventureId : ADAPTER_KIND === "dev-mock" ? pubVentureId : undefined;
  const treasury = useAdapterQuery((c) => (ventureId ? c.getTreasury(ventureId) : Promise.resolve(ok<TreasuryState | null>(null))), [ventureId], {
    pollMs: (t) => (t && hasPending(undefined, t) ? 1200 : undefined),
  });
  const fund = useAction<TreasuryState>();
  const [amount, setAmount] = useState("1000");
  const [done, setDone] = useState<string | null>(null);
  // Live: balance and deposits come from Whitechain for the ENS-resolved Safe, never from our API.
  const chain = useChainTreasury(ens.status === "ok" ? ens.safe : undefined, treasury.status === "ok" ? treasury.data?.treasury?.deploymentBlock : undefined, done ? 1 : 0);

  if (pub.status === "loading") return <LoadingCard lines={4} />;
  const p = pub.status === "ok" ? pub.data : undefined;
  const t = treasury.status === "ok" ? treasury.data : null;
  const tr = t?.treasury;
  const decimals = t?.tokenDecimals ?? 6;
  const active = isTreasuryActive(tr);
  const rawAmt = parseTokenAmount(amount, decimals);
  const mock = ADAPTER_KIND === "dev-mock";
  const target: Address | undefined = ens.status === "ok" ? ens.safe : mock ? tr?.safeAddress : undefined;
  const ensMismatch = ens.status === "ok" && !!tr && tr.safeAddress.toLowerCase() !== ens.safe.toLowerCase();
  const idMismatch = ens.status === "ok" && !!p && p.ventureId.toLowerCase() !== ens.ventureId.toLowerCase();
  const isFounder = !!address && !!p?.founders.some((f) => f.wallet?.toLowerCase() === address.toLowerCase());
  const needsSignIn = ADAPTER_KIND === "live" && !!address && (!sessionWallet || sessionWallet.toLowerCase() !== address.toLowerCase());
  const humans = p?.humansVerified ?? 0;
  const signed = !!p?.agreement?.complete;

  return (
    <div className="split">
      <div className="stack-lg">
        <div className="stack">
          <span className="eyebrow">Fund this team</span>
          <h1 className="mono" style={{ fontFamily: "var(--mono)" }} data-testid="funder-ens">
            {ensName}
          </h1>
        </div>
        <Notice tone="legal" title="Workspace — not legally incorporated">
          You are funding a team&apos;s shared treasury, not buying equity in a company.
        </Notice>
        {pub.status === "error" && <AdapterErrorNotice error={pub.error} />}

        <Card title="Before you fund" testId="card-funder-summary">
          <ul className="checks">
            <li>
              <CheckIcon status={humans >= 2 ? (mock ? "VERIFIED" : "PENDING") : "UNKNOWN"} mock={mock} />
              <span>
                <strong className="small">Two distinct verified humans</strong>
                <br />
                <span className="small muted">{humans} of 2 founders verified with World ID (vestige API, off-chain)</span>
                {p && (
                  <span className="row" style={{ marginTop: 4 }}>
                    {p.founders
                      .filter((f) => f.worldProofStatus === "VERIFIED")
                      .map((f) => (
                        <HumanBadge key={f.founderSubname} source={p.source} worldEnvironment={f.worldEnvironment} />
                      ))}
                  </span>
                )}
              </span>
              <span />
            </li>
            <li>
              <CheckIcon status={signed ? (mock ? "VERIFIED" : "PENDING") : "UNKNOWN"} mock={mock} />
              <span>
                <strong className="small">Founding terms signed by both</strong>
                <br />
                <span className="small muted">{p?.agreement ? `Version ${p.agreement.version} · ${p.agreement.signaturesForCurrentVersion} of ${p.agreement.requiredSignatures}` : "Not drafted"}</span>
              </span>
              <span />
            </li>
            <li>
              <CheckIcon status={ens.status === "ok" ? "VERIFIED" : ens.status === "failed" ? "FAILED" : mock ? "NONE" : "PENDING"} />
              <span>
                <strong className="small">Destination resolved from ENS</strong>
                <br />
                <span className="small muted" data-testid="funder-ens-status">
                  {mock ? "DEV MOCK: names are not on Sepolia; the mock treasury record is used." : ens.status === "ok" ? `Safe and ventureId read from ${ensName} on Sepolia` : ens.status === "failed" ? ens.reason : "Resolving on Sepolia…"}
                </span>
              </span>
              <span />
            </li>
            <li>
              <CheckIcon status={active ? (mock ? "VERIFIED" : "PENDING") : "UNKNOWN"} mock={mock} />
              <span>
                <strong className="small">2-of-2 treasury active on Whitechain</strong>
                <br />
                <span className="small muted">
                  {active ? (mock ? "Simulated readback (DEV MOCK)" : "Reported by vestige's treasury readback — confirm it on the evidence page") : treasury.status === "error" ? "Treasury status unavailable" : "Not active yet"}
                </span>
              </span>
              <span />
            </li>
          </ul>
          <div style={{ marginTop: 12 }}>
            <Link href={`/v/${ensName}${mock ? "?source=mock" : ""}`} data-testid="funder-evidence-link">
              Check every claim on the public evidence page →
            </Link>
          </div>
        </Card>

        <Card title="Deposit USDT" testId="card-deposit">
          {treasury.status === "error" ? (
            <AdapterErrorNotice error={treasury.error} />
          ) : ensMismatch || idMismatch ? (
            <Notice tone="error" title="Refusing to fund: records disagree" testId="funder-mismatch">
              {ensMismatch ? `ENS says the treasury is ${ens.status === "ok" ? ens.safe : ""}, but vestige reports ${tr?.safeAddress}.` : "The ventureId in ENS does not match the vestige API."} Do not
              send money until this is resolved.
            </Notice>
          ) : !active || !target ? (
            <Notice tone="info" title="This team's treasury isn't active yet">
              Funding opens once the Safe is deployed, read back from Whitechain, and linked from {ensName}.
            </Notice>
          ) : (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!address || rawAmt === null || !ventureId) return;
                const human = formatTokenAmount(rawAmt, decimals);
                const r = await fund.run(() =>
                  client.fundTreasury(
                    ventureId,
                    { from: address, to: target, amountRaw: rawAmt.toString(), ensName },
                    signer({
                      title: `Approve sending ${human} USDT to the ${ensName} treasury`,
                      lines: [
                        { label: "Amount", value: `${human} USDT` },
                        { label: "To", value: `${ensName} treasury` },
                        { label: "Valid for", value: "1 hour" },
                      ],
                      typedDataName: "TransferWithAuthorization",
                      costsGas: false,
                    }),
                  ),
                );
                if (r) setDone(human);
              }}
            >
              <Field label="Amount" htmlFor="f-amt" hint="Test USDT on Whitechain. You don't need WBT or any gas; your wallet may ask to switch to Whitechain.">
                <div className="input-affix">
                  <input id="f-amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="fund-amount" />
                  <span className="affix">USDT</span>
                </div>
              </Field>
              <dl className="kv small">
                <dt>Goes to</dt>
                <dd>
                  <HashLink value={target} chainId={1874} kind="address" source={mock ? "DEV_MOCK" : "CHAIN"} />
                  <span className="tiny faint"> · {mock ? "from mock treasury record" : `resolved from ${ensName} on Sepolia (ENSIP-11)`}</span>
                </dd>
              </dl>
              {needsSignIn && <SignInNotice message="Sign in with the wallet that will pay" />}
              {fund.error && <AdapterErrorNotice error={fund.error} />}
              {fund.cancelled && <Notice tone="info">Cancelled. Nothing was signed and no money moved.</Notice>}
              {done && (
                <Notice tone="success" title={`Deposit of ${done} USDT submitted`} testId="fund-submitted">
                  The relayer is settling it on Whitechain. Submitted is not settled — watch the status below.
                </Notice>
              )}
              <div>
                <Button
                  type="submit"
                  loading={fund.busy}
                  data-testid="fund-submit"
                  disabledReason={
                    !address
                      ? mock
                        ? "Pick “Funder” in “Acting as” (top right)."
                        : "Connect a wallet first."
                      : needsSignIn
                        ? "Sign in with your wallet first."
                        : role !== "funder" && isFounder
                          ? "Founders can't fund their own venture from this screen."
                          : rawAmt === null || rawAmt <= 0n
                            ? "Enter a positive amount."
                            : null
                  }
                >
                  Sign and fund
                </Button>
              </div>
            </form>
          )}
          {chain.status === "ok" && (
            <ul className="stack-sm small" style={{ listStyle: "none", padding: 0, margin: "16px 0 0" }} data-testid="chain-deposit-list">
              {chain.value.transfers.filter((x) => x.direction === "IN").length === 0 && (
                <li className="faint">No USDT deposits to this Safe since block {chain.value.scanFrom}{chain.value.fromDeployment ? " (deployment)" : " (recent blocks only)"}.</li>
              )}
              {chain.value.transfers
                .filter((x) => x.direction === "IN")
                .map((x) => (
                  <li key={x.txHash} className="row">
                    <span>{formatTokenAmount(x.valueRaw, chain.value.decimals)} USDT</span>
                    <StatusPill status="VERIFIED">Settled on Whitechain · block {x.blockNumber}</StatusPill>
                    <HashLink value={x.txHash} chainId={1874} source="CHAIN" />
                  </li>
                ))}
            </ul>
          )}
          {t && t.deposits.length > 0 && (
            <ul className="stack-sm small" style={{ listStyle: "none", padding: 0, margin: "16px 0 0" }} data-testid="deposit-list">
              {t.deposits.map((d) => (
                <li key={d.txHash} className="row">
                  <span>{formatTokenAmount(d.amountRaw, decimals)} USDT</span>
                  <StatusPill status={d.status} mock={mock}>
                    {d.status === "VERIFIED" ? (mock ? "Settled (simulated)" : "Settled on Whitechain") : "Settling…"}
                  </StatusPill>
                  <HashLink value={d.txHash} chainId={1874} source={t.source} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <aside className="stack">
        {chain.status === "ok" && (
          <Card title="Treasury balance">
            <div style={{ fontSize: 28, fontFamily: "var(--serif)", fontWeight: 600 }} data-testid="funder-balance">
              {formatTokenAmount(chain.value.balanceRaw, chain.value.decimals)} USDT
            </div>
            <span className="tiny faint">Read from Whitechain at block {chain.value.blockNumber} · test USDT — not real money</span>
          </Card>
        )}
        {mock && active && t?.balanceRaw !== undefined && (
          <Card title="Treasury balance">
            <div style={{ fontSize: 28, fontFamily: "var(--serif)", fontWeight: 600 }} data-testid="funder-balance">
              {formatTokenAmount(t.balanceRaw, decimals)} USDT
            </div>
            <span className="tiny faint">Test USDT — not real money{mock ? " · DEV MOCK" : " · reported by vestige; the evidence page reads it from chain"}</span>
          </Card>
        )}
        <RelayerExplainer />
      </aside>
    </div>
  );
}
