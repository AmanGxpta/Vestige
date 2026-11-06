"use client";

import { useState } from "react";
import { AdapterErrorNotice, Button, Card, EvidenceBadge, Field, HashLink, Notice, StatusPill } from "@/components/ui";
import { RejectedAttemptProof } from "@/components/RejectedAttemptProof";
import { formatTokenAmount, isAddress, parseTokenAmount, shortHex } from "@/src/modules/ui/format";
import { MOCK_ROLES, useVestige } from "@/src/modules/ui/provider";
import { isTreasuryActive, seatFor } from "@/src/modules/ui/progress";
import { useAction } from "@/src/modules/ui/useAction";
import { useVenture } from "@/src/modules/ui/venture/VentureContext";
import type { Address, Payment, TreasuryState } from "@/src/modules/ui/types";
import { ADAPTER_KIND } from "@/src/modules/ui/config";

function PaymentCard({ p, decimals, owners, source }: { p: Payment; decimals: number; owners: Address[]; source: TreasuryState["source"] }) {
  const { venture, refreshAll } = useVenture();
  const { client, address, signer } = useVestige();
  const sign = useAction<TreasuryState>();
  const exec = useAction<TreasuryState>();
  const v = venture.status === "ok" ? venture.data : undefined;
  const isOwner = !!address && owners.some((o) => o.toLowerCase() === address.toLowerCase());
  const iSigned = !!address && p.signerWallets.some((w) => w.toLowerCase() === address.toLowerCase());
  const amount = formatTokenAmount(p.amountRaw, decimals);
  // Relay SUBMITTED/RESERVED is never shown as executed (CONTRACTS relay lifecycle).
  const executing = (p.status === "READY" && !!p.executedTxHash) || p.relay?.status === "SUBMITTED" || p.relay?.status === "RESERVED" || p.relay?.status === "UNKNOWN";

  return (
    <Card
      testId="payment-card"
      title={
        <div className="row">
          <h3>
            {amount} USDT → <span className="mono">{shortHex(p.recipient)}</span>
          </h3>
          <StatusPill status={executing ? "PENDING" : p.status} mock={source === "DEV_MOCK"}>{executing ? "Executing on Whitechain…" : undefined}</StatusPill>
        </div>
      }
    >
      <div className="stack" data-status={p.status} data-testid="payment-body">
        <dl className="kv">
          <dt>For</dt>
          <dd>{p.reason}</dd>
          <dt>Approvals</dt>
          <dd className="stack-sm" data-testid="payment-approvals">
            {owners.map((o) => {
              const s = v?.seats.find((x) => x.wallet.toLowerCase() === o.toLowerCase());
              const signed = p.signerWallets.some((w) => w.toLowerCase() === o.toLowerCase());
              return (
                <span key={o} className="row small">
                  <span className="mono">{s?.founderSubname ?? shortHex(o)}</span>
                  {signed ? <EvidenceBadge label="SIGNED" source={source} /> : <StatusPill status="NONE">Not signed</StatusPill>}
                </span>
              );
            })}
            <span className="tiny faint">
              {p.signerWallets.length} of {owners.length} — both founders must sign.
            </span>
          </dd>
          <dt>Safe tx hash</dt>
          <dd className="mono small">{shortHex(p.safeTxHash, 10, 8)}</dd>
          {p.executedTxHash && (
            <>
              <dt>Execution</dt>
              <dd className="row">
                <HashLink value={p.executedTxHash} chainId={1874} source={source} />
                {p.status === "EXECUTED" && <EvidenceBadge label="CHAIN_VERIFIED" source={source} />}
              </dd>
            </>
          )}
        </dl>

        {exec.error?.code === "RELAYER_REFUSED" && (
          <div className="notice notice-error" role="alert" data-testid="relayer-refused" style={{ padding: 16 }}>
            <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>✕</span>
            <div className="notice-body">
              <strong>Payment refused</strong>
              <span>{exec.error.message}</span>
              {exec.error.detail && <span className="tiny">{exec.error.detail}</span>}
            </div>
          </div>
        )}
        {exec.error && exec.error.code !== "RELAYER_REFUSED" && <AdapterErrorNotice error={exec.error} />}
        {sign.error && <AdapterErrorNotice error={sign.error} />}
        {sign.cancelled && <Notice tone="info">Signature cancelled. Nothing was signed.</Notice>}

        {p.status !== "EXECUTED" && p.status !== "FAILED" && !executing && (
          <div className="row">
            {!iSigned && (
              <Button
                loading={sign.busy}
                data-testid="payment-sign"
                disabledReason={!isOwner ? "Only the two founders can approve." : null}
                onClick={async () => {
                  const r = await sign.run(() =>
                    client.signPayment(
                      p.ventureId,
                      p.paymentId,
                      { wallet: address! },
                      signer({
                        title: `Approve paying ${amount} USDT from ${v?.displayName ?? "the"} treasury`,
                        lines: [
                          { label: "To", value: shortHex(p.recipient, 8, 6) },
                          { label: "Amount", value: `${amount} USDT` },
                          { label: "For", value: p.reason },
                        ],
                        typedDataName: "SafeTx",
                        costsGas: false,
                      }),
                    ),
                  );
                  if (r) refreshAll();
                }}
              >
                Approve (sign)
              </Button>
            )}
            {/* Deliberately NOT disabled at 1-of-2: the demo shows the relayer refusing (FR-4: "The UI must not just block it"). */}
            <Button
              variant={p.status === "READY" ? "primary" : "secondary"}
              loading={exec.busy}
              data-testid="payment-execute"
              disabledReason={!isOwner ? "Only the founders can request execution." : null}
              onClick={async () => {
                if (!address) return;
                const r = await exec.run(() => client.executePayment(p.ventureId, p.paymentId, { wallet: address }));
                if (r) refreshAll();
              }}
            >
              {p.status === "READY" ? "Execute payment" : `Try to execute with ${p.signerWallets.length} of ${owners.length}`}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function PaymentsPage() {
  const { venture, treasury, refreshAll } = useVenture();
  const { client, address } = useVestige();
  const propose = useAction<TreasuryState>();
  const [recipient, setRecipient] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  if (venture.status !== "ok") return null;
  if (treasury.status === "error") return <AdapterErrorNotice error={treasury.error} />;
  if (treasury.status !== "ok") return null;
  const v = venture.data;
  const t = treasury.data;
  const tr = t.treasury;
  const decimals = t.tokenDecimals ?? 6;
  const active = isTreasuryActive(tr);
  const seat = seatFor(v, address);
  const raw = parseTokenAmount(amount, decimals);
  const formError = !recipient || !amount || !reason ? "Fill in recipient, amount and reason." : !isAddress(recipient) ? "Recipient must be a 0x… address." : raw === null || raw <= 0n ? "Enter a positive amount (max 6 decimals)." : null;
  // CONTRACTS v0: the rejected 1-of-2 attempt is a receipt-backed evidence record (X readback), not an env var.
  const evidenceTx = t.evidence?.find((e) => e.kind === "REJECTED_ATTEMPT" && e.txHash && e.chainId === 1874)?.txHash;

  if (!active)
    return (
      <Card title="Payments">
        <Notice tone="info" title="The treasury isn't active yet">
          Payments open once the 2-of-2 Safe has been deployed and read back from Whitechain.
        </Notice>
      </Card>
    );

  return (
    <>
      <Card title="Propose a payment" testId="card-propose">
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!address || raw === null) return;
            const r = await propose.run(() => client.proposePayment(v.ventureId, { recipient: recipient as Address, amountRaw: raw.toString(), reason, wallet: address }));
            if (r) {
              setAmount("");
              setReason("");
              refreshAll();
            }
          }}
        >
          <div className="grid-2">
            <Field
              label="Recipient address"
              htmlFor="p-to"
              hint={
                ADAPTER_KIND === "dev-mock" ? (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0 }} onClick={() => setRecipient(MOCK_ROLES.payee.address)} data-testid="use-mock-payee">
                    Use the mock contractor wallet
                  </button>
                ) : (
                  "A Whitechain wallet address."
                )
              }
            >
              <input id="p-to" className="input mono" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())} placeholder="0x…" data-testid="payment-recipient" />
            </Field>
            <Field label="Amount" htmlFor="p-amt" hint={t.balanceRaw ? `Treasury balance: ${formatTokenAmount(t.balanceRaw, decimals)} USDT` : undefined}>
              <div className="input-affix">
                <input id="p-amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" data-testid="payment-amount" />
                <span className="affix">USDT</span>
              </div>
            </Field>
          </div>
          <Field label="What is it for?" htmlFor="p-reason" hint="Visible to both founders and recorded with the proposal.">
            <input id="p-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contract design work, November" data-testid="payment-reason" />
          </Field>
          {propose.error && <AdapterErrorNotice error={propose.error} />}
          <div>
            <Button type="submit" loading={propose.busy} disabledReason={!seat ? "Only founders can propose payments." : formError} data-testid="payment-propose">
              Propose payment
            </Button>
          </div>
          <span className="tiny faint">Proposing doesn&apos;t move money. Both founders then sign; the relayer executes only with both signatures.</span>
        </form>
      </Card>

      {t.payments.length === 0 ? (
        <p className="muted small">No payments proposed yet.</p>
      ) : (
        [...t.payments].reverse().map((p) => <PaymentCard key={p.paymentId} p={p} decimals={decimals} owners={tr!.ownerAddresses} source={t.source} />)
      )}

      <RejectedAttemptProof txHash={evidenceTx} />
    </>
  );
}
