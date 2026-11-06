"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AdapterErrorNotice, Button, Card, CheckIcon, Field, HashLink, LoadingCard, Notice, StatusPill } from "@/components/ui";
import { RelayerExplainer } from "@/components/RelayerExplainer";
import { ADAPTER_KIND } from "@/src/modules/ui/config";
import { formatTokenAmount, parseTokenAmount } from "@/src/modules/ui/format";
import { hasPending, termsFullySigned, verifiedSeats } from "@/src/modules/ui/progress";
import { useAdapterQuery, useVestige } from "@/src/modules/ui/provider";
import { useAction } from "@/src/modules/ui/useAction";
import type { TreasuryState, VentureId } from "@/src/modules/ui/types";

export default function FundVenturePage() {
  const { ventureId } = useParams<{ ventureId: string }>();
  const id = ventureId as VentureId;
  const { client, address, role, requestSignature } = useVestige();
  const venture = useAdapterQuery((c) => c.getVenture(id), [id]);
  const treasury = useAdapterQuery((c) => c.getTreasury(id), [id], { pollMs: (t) => (hasPending(undefined, t) ? 1200 : undefined) });
  const fund = useAction<TreasuryState>();
  const [amount, setAmount] = useState("1000");
  const [done, setDone] = useState<string | null>(null);

  if (venture.status === "loading" || treasury.status === "loading") return <LoadingCard lines={4} />;
  if (venture.status === "error") return <AdapterErrorNotice error={venture.error} />;
  if (treasury.status === "error") return <AdapterErrorNotice error={treasury.error} />;
  const v = venture.data;
  const t = treasury.data;
  const tr = t.treasury;
  const decimals = t.tokenDecimals ?? 6;
  const active = tr?.verificationStatus === "VERIFIED";
  const raw = parseTokenAmount(amount, decimals);
  const mock = v.source === "DEV_MOCK";
  const isFounder = !!address && v.seats.some((s) => s.wallet.toLowerCase() === address.toLowerCase());

  return (
    <div className="split">
      <div className="stack-lg">
        <div className="stack">
          <span className="eyebrow">Fund this team</span>
          <h1>{v.displayName}</h1>
          <span className="mono small">{v.ensName}</span>
        </div>
        <Notice tone="legal" title="Workspace — not legally incorporated">You are funding a team&apos;s shared treasury, not buying equity in a company.</Notice>

        <Card title="Before you fund" testId="card-funder-summary">
          <ul className="checks">
            <li>
              <CheckIcon status={verifiedSeats(v).length >= 2 ? "VERIFIED" : "UNKNOWN"} mock={mock} />
              <span><strong className="small">Two distinct verified humans</strong><br /><span className="small muted">{verifiedSeats(v).length} of 2 founders verified with World ID</span></span>
              <span />
            </li>
            <li>
              <CheckIcon status={termsFullySigned(v) ? "VERIFIED" : "UNKNOWN"} mock={mock} />
              <span><strong className="small">Founding terms signed by both</strong><br /><span className="small muted">{v.agreement ? `Version ${v.agreement.version}` : "Not drafted"}</span></span>
              <span />
            </li>
            <li>
              <CheckIcon status={active ? "VERIFIED" : "UNKNOWN"} mock={mock} />
              <span><strong className="small">2-of-2 treasury active on Whitechain</strong><br /><span className="small muted">{active ? (mock ? "Simulated readback (DEV MOCK) — live mode reads owners, threshold and Guard from Whitechain" : "Owners, threshold and Guard read back from the chain") : "Not active yet"}</span></span>
              <span />
            </li>
          </ul>
          <div style={{ marginTop: 12 }}>
            <Link href={`/v/${v.ensName}${v.source === "DEV_MOCK" ? "?source=mock" : ""}`} data-testid="funder-evidence-link">Check every claim on the public evidence page →</Link>
          </div>
        </Card>

        <Card title="Deposit USDT" testId="card-deposit">
          {!active ? (
            <Notice tone="info" title="This team's treasury isn't active yet">Funding opens once the Safe is deployed and read back from Whitechain.</Notice>
          ) : (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!address || raw === null) return;
                const human = formatTokenAmount(raw, decimals);
                const r = await fund.run(async () => {
                  const signature = await requestSignature({
                    title: `Approve sending ${human} USDT to the ${v.displayName} treasury`,
                    lines: [
                      { label: "Amount", value: `${human} USDT` },
                      { label: "To", value: `${v.ensName} treasury` },
                      { label: "Valid for", value: "1 hour" },
                    ],
                    typedDataName: "TransferWithAuthorization",
                    costsGas: false,
                  });
                  if (!signature) return null;
                  return client.fundTreasury(v.ventureId, { amountRaw: raw.toString(), sig: { signer: address, signature } });
                });
                if (r) setDone(human);
              }}
            >
              <Field label="Amount" htmlFor="f-amt" hint="Test USDT on Whitechain. You don't need WBT or any gas.">
                <div className="input-affix">
                  <input id="f-amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="fund-amount" />
                  <span className="affix">USDT</span>
                </div>
              </Field>
              <dl className="kv small">
                <dt>Goes to</dt>
                <dd>
                  <HashLink value={tr!.safeAddress} chainId={1874} kind="address" source={t.source} />
                  <span className="tiny faint"> · {ADAPTER_KIND === "dev-mock" ? "from mock treasury record" : `resolved from ${v.ensName} (ENSIP-11)`}</span>
                </dd>
              </dl>
              {fund.error && <AdapterErrorNotice error={fund.error} />}
              {fund.cancelled && <Notice tone="info">Cancelled. Nothing was signed and no money moved.</Notice>}
              {done && (
                <Notice tone="success" title={`Deposit of ${done} USDT submitted`} testId="fund-submitted">
                  The relayer is settling it on Whitechain. Watch the status below.
                </Notice>
              )}
              <div>
                <Button
                  type="submit"
                  loading={fund.busy}
                  data-testid="fund-submit"
                  disabledReason={
                    !address ? (ADAPTER_KIND === "dev-mock" ? "Pick “Funder” in “Acting as” (top right)." : "Connect a wallet first.") : role !== "funder" && isFounder ? "Founders can't fund their own venture from this screen." : raw === null || raw <= 0n ? "Enter a positive amount." : null
                  }
                >
                  Sign and fund
                </Button>
              </div>
            </form>
          )}
          {t.deposits.length > 0 && (
            <ul className="stack-sm small" style={{ listStyle: "none", padding: 0, margin: "16px 0 0" }} data-testid="deposit-list">
              {t.deposits.map((d) => (
                <li key={d.txHash} className="row">
                  <span>{formatTokenAmount(d.amountRaw, decimals)} USDT</span>
                  <StatusPill status={d.status} mock={mock}>{d.status === "VERIFIED" ? (mock ? "Settled (simulated)" : "Settled on Whitechain") : "Settling…"}</StatusPill>
                  <HashLink value={d.txHash} chainId={1874} source={t.source} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <aside className="stack">
        {active && t.balanceRaw !== undefined && (
          <Card title="Treasury balance">
            <div style={{ fontSize: 28, fontFamily: "var(--serif)", fontWeight: 600 }} data-testid="funder-balance">{formatTokenAmount(t.balanceRaw, decimals)} USDT</div>
            <span className="tiny faint">Test USDT — not real money</span>
          </Card>
        )}
        <RelayerExplainer />
      </aside>
    </div>
  );
}
