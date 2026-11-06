"use client";

import { useEffect, useState } from "react";
import { mockSignature, SIMULATED_HUMANS } from "@/src/modules/ui/mock/mock-adapter";
import { useVestige } from "@/src/modules/ui/provider";
import { shortHex } from "@/src/modules/ui/format";
import { ADAPTER_KIND } from "@/src/modules/ui/config";
import { Button, Notice } from "./ui";

/**
 * Hosts the wallet-signature prompt and the World ID prompt.
 *
 * DEV MOCK: both are simulated in-page and say so. The wallet prompt doubles as
 * the copy spec for the real wallet: one plain-language sentence, what is
 * signed, and explicitly no gas / no seed phrase / no network switch (FR-8).
 * LIVE: wallet = wagmi (pending H wallet-auth decision); World = C1's IDKit
 * component from src/modules/identity (C1 exposes props, C2 renders it).
 */
export function PromptHost() {
  const { pending, settle } = useVestige();
  const [human, setHuman] = useState<string>(SIMULATED_HUMANS[0].id);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && settle(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, settle]);

  if (!pending) return null;

  if (pending.kind === "signature") {
    const p = pending.prompt;
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sig-title" data-testid="wallet-prompt">
        <div className="modal">
          <div className="modal-head">
            <strong id="sig-title">Signature request</strong>
            {ADAPTER_KIND === "dev-mock" && <span className="badge badge-mock-tag">DEV MOCK WALLET</span>}
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
            </dl>
            <Notice tone="success">This is a signature, not a transaction. It costs you nothing: no gas, no network switch.</Notice>
            <span className="tiny faint">Typed data: {p.typedDataName} (EIP-712)</span>
          </div>
          <div className="modal-foot">
            <Button variant="secondary" onClick={() => settle(null)} data-testid="wallet-cancel">
              Cancel
            </Button>
            <Button onClick={() => settle(mockSignature())} data-testid="wallet-sign">
              Sign
            </Button>
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
          <span className="badge badge-mock-tag">DEV MOCK SIMULATOR</span>
        </div>
        <div className="modal-body">
          <p className="small muted">
            For a seat in <strong>{w.ventureName}</strong>. World ID Proof of Human reveals no name, email or document — only that this person has
            not already taken a seat in this venture.
          </p>
          <Notice tone="mock" title="Simulated World ID">
            Pick which simulated person is verifying. Choosing the same person for both seats demonstrates the duplicate-human refusal. Real proofs
            come from C1&apos;s IDKit integration.
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
        </div>
        <div className="modal-foot">
          <Button variant="secondary" onClick={() => settle(null)} data-testid="world-cancel">
            Cancel
          </Button>
          <Button onClick={() => settle({ kind: "dev-mock", simulatedHumanId: human })} data-testid="world-verify">
            Verify
          </Button>
        </div>
      </div>
    </div>
  );
}
