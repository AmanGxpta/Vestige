"use client";

import { useEffect, useState } from "react";
import { createPublicClient, http } from "viem";
import { CONFIG } from "@/src/modules/ui/config";
import { whitechainSepolia } from "@/src/modules/public-view/chain-reader";
import type { Hex } from "@/src/modules/ui/types";
import { Card, EvidenceBadge, HashLink, Notice, StatusPill } from "./ui";

/**
 * The never-cut on-chain 1-of-2 rejection (FR-4, TR-05). The UI never fakes it:
 * it takes a REAL tx hash supplied by X/H and reads the receipt from Whitechain.
 * Only a mined receipt with status "reverted" is shown as a rejection.
 */
export function RejectedAttemptProof({ txHash }: { txHash?: Hex }) {
  const [state, setState] = useState<{ status: "idle" | "loading" | "reverted" | "success" | "unknown"; block?: string; note?: string }>({ status: "idle" });
  useEffect(() => {
    if (!txHash) return;
    let alive = true;
    setState({ status: "loading" });
    const c = createPublicClient({ chain: whitechainSepolia, transport: http(CONFIG.whitechainRpcUrl, { timeout: 10_000 }) });
    c.getTransactionReceipt({ hash: txHash })
      .then((r) => alive && setState({ status: r.status === "reverted" ? "reverted" : "success", block: r.blockNumber.toString() }))
      .catch((e) => alive && setState({ status: "unknown", note: e instanceof Error ? e.message.split("\n")[0] : String(e) }));
    return () => {
      alive = false;
    };
  }, [txHash]);

  return (
    <Card title="Proof the Safe itself enforces 2-of-2" testId="rejected-attempt">
      <div className="stack small">
        <p className="muted">
          The relayer refuses a 1-of-2 payment before sending it. To prove the rule lives in the treasury contract and not just in our software, a
          single-signer transaction was sent straight to the Safe from a test wallet. The Safe rejected it on-chain (GS020).
        </p>
        {!txHash ? (
          <Notice tone="warn" title="Awaiting the real failed transaction" testId="rejected-attempt-missing">
            Not recorded yet. This is supplied by X/H from a deliberately reverting test-wallet transaction (H-009); the UI will not simulate it.
          </Notice>
        ) : (
          <div className="row">
            <HashLink value={txHash} chainId={1874} source="CHAIN" head={10} tail={8} />
            {state.status === "loading" && <StatusPill status="PENDING">Reading receipt…</StatusPill>}
            {state.status === "reverted" && (
              <>
                <StatusPill status="FAILED">Reverted on-chain · block {state.block}</StatusPill>
                <EvidenceBadge label="CHAIN_VERIFIED" source="CHAIN" />
              </>
            )}
            {state.status === "success" && <StatusPill status="UNKNOWN">This transaction succeeded — it is not a rejection</StatusPill>}
            {state.status === "unknown" && <StatusPill status="UNKNOWN">Receipt unavailable</StatusPill>}
          </div>
        )}
      </div>
    </Card>
  );
}
