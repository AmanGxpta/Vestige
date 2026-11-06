import { Card } from "./ui";

/** Whitechain Scale asks: who pays gas, where the relayer's WBT comes from, what stops draining it (FR-8). */
export function RelayerExplainer() {
  return (
    <Card title="Who pays the gas?" testId="relayer-explainer">
      <div className="grid-2 small">
        <div className="stack-sm">
          <strong>vestige&apos;s relayer, never you</strong>
          <span className="muted">
            Founders and funders only sign messages. The relayer submits them on Whitechain from its own gas wallet, funded from the Whitechain
            testnet faucet. It holds no user funds.
          </span>
        </div>
        <div className="stack-sm">
          <strong>Why it can&apos;t be drained</strong>
          <span className="muted">
            It only sends payments already authorised by the payer&apos;s signature or by both founders, simulates every call first and drops
            anything that would fail, and is limited by allow-lists, rate limits and a daily gas budget.
          </span>
        </div>
      </div>
    </Card>
  );
}
