"use client";

import { useEffect, useRef, useState } from "react";
import type { WorldProofPayload, WorldRequestParams } from "@/src/modules/ui/adapter";
import { Button, Notice } from "./ui";

/**
 * LIVE World ID via @worldcoin/idkit-core 4.6.0 (same version C1 verifies against).
 * Uses exactly the server-pinned, RP-signed params from C1's world/request route:
 * action, signal (founder wallet), environment, preset. Nothing is chosen client-side.
 *
 * Staging = World ID Simulator: results are TESTED_IN_SIMULATOR and are labelled so;
 * they never stand for production human uniqueness.
 */
type Phase = { kind: "starting" } | { kind: "waiting"; uri: string; qr?: string } | { kind: "confirming"; uri: string; qr?: string } | { kind: "failed"; message: string };

const FRIENDLY: Record<string, string> = {
  user_rejected: "You declined the request in World App.",
  verification_rejected: "World App declined the verification.",
  credential_unavailable: "This World ID does not have the Proof of Human credential required here.",
  max_verifications_reached: "This World ID was already used for this action.",
  connection_failed: "Could not connect to World App. Try again.",
  invalid_rp_signature: "The verification request was not accepted (RP signature). Ask the operator to check World configuration.",
  rp_signature_expired: "The verification request expired. Start again.",
  timeout: "Timed out waiting for World App.",
};

export function WorldIdKitPrompt({ params, ventureName, onDone }: { params: WorldRequestParams; ventureName: string; onDone: (v: WorldProofPayload | null) => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  const abort = useRef<AbortController | null>(null);
  const staging = params.environment === "staging";

  useEffect(() => {
    const ac = new AbortController();
    abort.current = ac;
    let alive = true;
    (async () => {
      try {
        const { IDKit } = await import("@worldcoin/idkit-core");
        const preset = params.preset === "proofOfHuman" ? IDKit.proofOfHuman({ signal: params.signal }) : IDKit.orbLegacy({ signal: params.signal });
        const req = await IDKit.request({
          app_id: params.app_id as `app_${string}`,
          action: params.action,
          rp_context: params.rp_context,
          allow_legacy_proofs: params.allow_legacy_proofs,
          environment: params.environment,
          action_description: `Take a founder seat in ${ventureName}`,
        }).preset(preset, { signal: ac.signal });
        let qr: string | undefined;
        try {
          const QR = await import("qrcode");
          qr = await QR.toDataURL(req.connectorURI, { margin: 1, width: 220 });
        } catch {
          qr = undefined; // link still works
        }
        if (!alive) return;
        setPhase({ kind: "waiting", uri: req.connectorURI, qr });
        const res = await req.pollUntilCompletion({ signal: ac.signal, pollInterval: 1500 });
        if (!alive) return;
        if (res.success) onDone({ kind: "idkit", result: res.result });
        else setPhase({ kind: "failed", message: FRIENDLY[String(res.error)] ?? `World ID returned: ${String(res.error)}` });
      } catch (e) {
        if (!alive || ac.signal.aborted) return;
        setPhase({ kind: "failed", message: `Could not start World ID: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}` });
      }
    })();
    return () => {
      alive = false;
      ac.abort();
    };
  }, [params, ventureName, onDone]);

  return (
    <div className="stack" data-testid="idkit-prompt">
      {staging && (
        <Notice tone="mock" title="World ID staging — TESTED IN SIMULATOR">
          This venture&apos;s server is configured for World&apos;s staging environment. Use the World ID Simulator. The result proves the flow works, not that
          a real unique human verified.
        </Notice>
      )}
      {phase.kind === "starting" && <p className="small muted">Preparing a World ID request…</p>}
      {(phase.kind === "waiting" || phase.kind === "confirming") && (
        <div className="stack-sm" style={{ alignItems: "center" }}>
          {phase.qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={phase.qr} width={220} height={220} alt="QR code to open this request in World App" data-testid="idkit-qr" />
          ) : null}
          <span className="small">{staging ? "Paste this link into the World ID Simulator, or scan the QR:" : "Scan with World App, or open on your phone:"}</span>
          <div className="row" style={{ maxWidth: "100%" }}>
            <input className="input mono tiny" readOnly value={phase.uri} aria-label="World ID request link" data-testid="idkit-uri" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" variant="secondary" onClick={() => void navigator.clipboard?.writeText(phase.uri)}>
              Copy
            </Button>
          </div>
          <span className="tiny faint">Waiting for World App… this request expires in a few minutes.</span>
        </div>
      )}
      {phase.kind === "failed" && <Notice tone="error" title="World ID did not complete">{phase.message}</Notice>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <Button
          variant="secondary"
          data-testid="world-cancel"
          onClick={() => {
            abort.current?.abort();
            onDone(null);
          }}
        >
          {phase.kind === "failed" ? "Close" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}
