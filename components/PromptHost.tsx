"use client";

import { useCallback, useEffect, useState } from "react";
import type { TypedDataDefinition } from "viem";
import { mockSignature, SIMULATED_HUMANS } from "@/src/modules/ui/mock/mock-adapter";
import { useVestige } from "@/src/modules/ui/provider";
import { shortHex } from "@/src/modules/ui/format";
import { ADAPTER_KIND } from "@/src/modules/ui/config";
import type { WorldProofPayload } from "@/src/modules/ui/adapter";
import { chainName, CHAINS, signTypedData, toWalletError } from "@/src/modules/ui/wallet/eip1193";
import { Button, Notice } from "./ui";
import { WorldIdKitPrompt } from "./WorldIdKitPrompt";

/**
 * Hosts the wallet-signature prompt and the World ID prompt.
 *
 * Signature: one plain-language sentence, what is signed, which network it is for,
 * no gas, no seed phrase. LIVE: if the wallet is on the other network the user must
 * press an explicit "Switch to …" button first (CONTRACTS: visible switching, only
 * after a user action; we never promise exactly one switch). DEV MOCK: simulated.
 *
 * World: LIVE renders IDKit with C1's server-pinned params; DEV MOCK renders a
 * labelled simulator that can demonstrate the duplicate-human refusal.
 */
const domainChain = (td: TypedDataDefinition) => (td.domain && "chainId" in td.domain && td.domain.chainId !== undefined ? Number(td.domain.chainId) : undefined);

export function PromptHost() {
  const { pending, settle, wallet, switchChain, eip1193 } = useVestige();
  const [human, setHuman] = useState<string>(SIMULATED_HUMANS[0].id);
  const [busy, setBusy] = useState<"switch" | "sign" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onWorldDone = useCallback((v: WorldProofPayload | null) => settle(v), [settle]);

  useEffect(() => {
    setError(null);
    setBusy(null);
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && settle(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, settle]);

  if (!pending) return null;

  if (pending.kind === "signature") {
    const p = pending.prompt;
    const target = domainChain(pending.typedData);
    const live = ADAPTER_KIND === "live";
    const onWrongChain = live && target !== undefined && wallet.chainId !== target;
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sig-title" data-testid="wallet-prompt">
        <div className="modal">
          <div className="modal-head">
            <strong id="sig-title">Signature request</strong>
            {!live && <span className="badge badge-mock-tag">DEV MOCK WALLET</span>}
          </div>
          <div className="modal-body">
            <h3 style={{ fontSize: 19 }}>{p.title}</h3>
            <dl className="kv" style={{ gridTemplateColumns: "110px 1fr" }}>
              {p.lines.map((l) => (
                <div key={l.label} style={{ display: "contents" }}>
                  <dt>{l.label}</dt>
                  <dd>{l.value}</dd>
                </div>
              ))}
              <dt>From</dt>
              <dd className="mono">{shortHex(pending.address)}</dd>
              <dt>Network</dt>
              <dd data-testid="sig-network" data-chain={target}>
                {chainName(target)}
                {target && CHAINS[target] ? <span className="tiny muted"> · used for {CHAINS[target].purpose}</span> : null}
                {!live && <span className="tiny muted"> (simulated)</span>}
              </dd>
            </dl>
            <Notice tone="success">This is a signature, not a transaction. It costs no gas and moves no money by itself.</Notice>
            {onWrongChain && (
              <Notice tone="warn" title={`Switch your wallet to ${chainName(target)}`} testId="sig-switch-needed">
                Your wallet is on {chainName(wallet.chainId)}. vestige uses Sepolia for identity and terms, and Whitechain for the treasury, so you may be asked to
                switch more than once.
              </Notice>
            )}
            {error && <Notice tone="error" title={error} testId="sig-error" />}
            <span className="tiny faint">Typed data: {p.typedDataName} (EIP-712)</span>
          </div>
          <div className="modal-foot">
            <Button variant="secondary" onClick={() => settle(null)} data-testid="wallet-cancel">
              Cancel
            </Button>
            {onWrongChain ? (
              <Button
                loading={busy === "switch"}
                data-testid="wallet-switch"
                onClick={async () => {
                  setBusy("switch");
                  setError(null);
                  const e = await switchChain(target!);
                  setBusy(null);
                  if (e) setError(e.message);
                }}
              >
                Switch to {chainName(target)}
              </Button>
            ) : (
              <Button
                loading={busy === "sign"}
                data-testid="wallet-sign"
                onClick={async () => {
                  if (!live) return settle(mockSignature());
                  if (!eip1193) return setError("Connect your wallet first.");
                  setBusy("sign");
                  setError(null);
                  try {
                    settle(await signTypedData(eip1193, pending.address, pending.typedData));
                  } catch (e) {
                    const we = toWalletError(e, "signature");
                    setBusy(null);
                    if (we.code === "REJECTED") settle(null);
                    else setError(we.message);
                  }
                }}
              >
                {live ? "Sign in wallet" : "Sign"}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // World ID
  const w = pending.prompt;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="world-title" data-testid="world-prompt">
      <div className="modal">
        <div className="modal-head">
          <strong id="world-title">Prove you are a unique human</strong>
          {w.request.kind === "dev-mock" ? (
            <span className="badge badge-mock-tag">DEV MOCK SIMULATOR</span>
          ) : w.request.params.environment === "staging" ? (
            <span className="badge badge-mock-tag">WORLD STAGING</span>
          ) : null}
        </div>
        <div className="modal-body">
          <p className="small muted">
            For a seat in <strong>{w.ventureName}</strong>. World ID Proof of Human reveals no name, email or document — only that this person has not
            already taken a seat in this venture.
          </p>
          {w.request.kind === "idkit" ? (
            <WorldIdKitPrompt params={w.request.params} ventureName={w.ventureName} onDone={onWorldDone} />
          ) : (
            <>
              <Notice tone="mock" title="Simulated World ID">
                Pick which simulated person is verifying. Choosing the same person for both seats demonstrates the duplicate-human refusal. These are not
                real identities and never count as HUMAN_VERIFIED outside DEV MOCK.
              </Notice>
              <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack-sm">
                <legend className="sr-only">Simulated human</legend>
                {SIMULATED_HUMANS.map((h) => (
                  <label key={h.id} className="choice">
                    <input type="radio" name="sim-human" value={h.id} checked={human === h.id} onChange={() => setHuman(h.id)} data-testid={`sim-${h.id}`} />
                    {h.label}
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </div>
        {w.request.kind === "dev-mock" && (
          <div className="modal-foot">
            <Button variant="secondary" onClick={() => settle(null)} data-testid="world-cancel">
              Cancel
            </Button>
            <Button onClick={() => settle({ kind: "dev-mock", simulatedHumanId: human })} data-testid="world-verify">
              Verify
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
