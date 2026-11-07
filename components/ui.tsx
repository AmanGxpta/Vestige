"use client";

import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { explorerAddress, explorerTx } from "@/src/modules/ui/config";
import { shortHex } from "@/src/modules/ui/format";
import { useVestige } from "@/src/modules/ui/provider";
import type { DataSource, EvidenceLabel } from "@/src/modules/ui/types";

/* ---------------- Button: every disabled action states why ---------------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  loading?: boolean;
  /** When set, the button is disabled and the reason is shown under it. */
  disabledReason?: string | null | false;
  block?: boolean;
};
export function Button({ variant = "primary", size = "md", loading, disabledReason, block, className, children, disabled, ...rest }: BtnProps) {
  const cls = ["btn", variant !== "primary" && `btn-${variant}`, size === "sm" && "btn-sm", block && "btn-block", className].filter(Boolean).join(" ");
  const isDisabled = disabled || loading || !!disabledReason;
  const reasonId = useId();
  const btn = (
    <button className={cls} disabled={isDisabled} aria-busy={loading || undefined} aria-describedby={disabledReason ? reasonId : undefined} {...rest}>
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  );
  if (!disabledReason) return btn;
  return (
    <span className="btn-wrap" style={block ? { width: "100%" } : undefined}>
      {btn}
      <span className="btn-reason" id={reasonId} data-testid="disabled-reason">
        {disabledReason}
      </span>
    </span>
  );
}

/* ---------------- Notice ---------------- */
export function Notice({ tone = "info", title, children, testId }: { tone?: "info" | "warn" | "error" | "success" | "mock" | "legal"; title?: ReactNode; children?: ReactNode; testId?: string }) {
  const icon = { info: "ℹ", warn: "!", error: "✕", success: "✓", mock: "◇", legal: "§" }[tone];
  return (
    <div className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"} data-testid={testId}>
      <span aria-hidden style={{ fontWeight: 700 }}>
        {icon}
      </span>
      <div className="notice-body">
        {title && <strong>{title}</strong>}
        {children && <div>{children}</div>}
      </div>
    </div>
  );
}

/* ---------------- Card ---------------- */
export function Card({ title, actions, children, footer, testId, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; footer?: ReactNode; testId?: string; pad?: boolean }) {
  return (
    <section className="card" data-testid={testId}>
      {(title || actions) && (
        <header className="card-head">
          {typeof title === "string" ? <h2 style={{ fontSize: 18 }}>{title}</h2> : title}
          {actions}
        </header>
      )}
      <div className={pad ? "card-body" : undefined}>{children}</div>
      {footer && <footer className="card-foot">{footer}</footer>}
    </section>
  );
}

/* ---------------- Field ---------------- */
export function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: ReactNode; error?: string | null; htmlFor: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/* ---------------- Status pill ---------------- */
const STATUS_TEXT: Record<string, string> = {
  VERIFIED: "Verified",
  PENDING: "Pending",
  UNKNOWN: "Unknown",
  FAILED: "Failed",
  AWAITING_APPROVALS: "Awaiting approvals",
  READY: "Ready to execute",
  EXECUTED: "Executed",
  ACTIVE: "Active",
  UNVERIFIED: "Unverified",
  NOT_ACTIVE: "Not active",
  BLOCKED: "Not connected",
  NONE: "Not started",
};
const SUCCESS_LIKE = new Set(["VERIFIED", "EXECUTED", "ACTIVE", "READY"]);
/** `mock` marks values that came from the DEV MOCK adapter: success states get hatched + "MOCK" so they can never read as verified. */
export function StatusPill({ status, children, mock }: { status: string; children?: ReactNode; mock?: boolean }) {
  const isMock = !!mock && SUCCESS_LIKE.has(status);
  return (
    <span className={`pill pill-${status}${isMock ? " pill-mock" : ""}`} data-status={status} data-mock={isMock || undefined} data-testid="status-pill">
      {children ?? STATUS_TEXT[status] ?? status}
      {isMock && <span className="pill-mock-tag">MOCK</span>}
    </span>
  );
}

/** A ✓/?/✕ check marker; mock-sourced ticks are hatched and tagged. */
export function CheckIcon({ status, mock, size = 22 }: { status: "VERIFIED" | "FAILED" | "UNKNOWN" | "PENDING" | "NONE"; mock?: boolean; size?: number }) {
  const glyph = { VERIFIED: "✓", FAILED: "✕", UNKNOWN: "?", PENDING: "…", NONE: "–" }[status];
  return (
    <span
      className={`check-icon check-${status}${mock && status === "VERIFIED" ? " check-mock" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size / 2) }}
      title={mock && status === "VERIFIED" ? "DEV MOCK — simulated, not verified" : undefined}
      data-mock={(mock && status === "VERIFIED") || undefined}
    >
      {glyph}
    </span>
  );
}

/* ---------------- Evidence badge: mock data can never look verified ---------------- */
const LABEL_HELP: Record<EvidenceLabel, string> = {
  HUMAN_VERIFIED: "A World ID proof of unique humanity was verified by the vestige server.",
  SIGNED: "An EIP-712 signature from the founder's own wallet was verified.",
  CHAIN_VERIFIED: "Backed by a transaction receipt on Sepolia or Whitechain and an independent read.",
  SELF_REPORTED: "Entered by the team. Not independently verified.",
};
/**
 * `qualifier` (CONTRACTS v0): TESTED_IN_SIMULATOR is a separate evidence-source
 * qualifier, not a fifth label. ENV_UNREPORTED = the API did not say which World
 * environment verified this human, so it must not read as production uniqueness.
 */
export type EvidenceQualifier = "TESTED_IN_SIMULATOR" | "ENV_UNREPORTED" | "DEMO_OVERRIDE";
const QUALIFIER_TEXT: Record<EvidenceQualifier, { tag: string; help: string }> = {
  TESTED_IN_SIMULATOR: { tag: "TESTED IN SIMULATOR", help: "Verified in World's staging environment (simulator). Proves the flow, not that a real unique human verified." },
  ENV_UNREPORTED: { tag: "WORLD ENV NOT REPORTED", help: "The API did not report whether this was a production or staging World ID proof. Treat as unconfirmed." },
  DEMO_OVERRIDE: { tag: "DEMO OVERRIDE · NOT WORLD-VERIFIED", help: "An operator marked this seat ready for the demo (CR-ID-06). No World ID proof exists for it; it is not counted as a human." },
};
export function EvidenceBadge({ label, source, qualifier }: { label: EvidenceLabel; source: DataSource; qualifier?: EvidenceQualifier }) {
  const mock = source === "DEV_MOCK";
  const weak = mock || !!qualifier;
  return (
    <span className="row" style={{ gap: 4 }}>
      <span
        className={`badge badge-${label}${weak ? " badge-mock" : ""}`}
        title={mock ? `DEV MOCK — would be ${label} with real data. ${LABEL_HELP[label]}` : qualifier ? `${LABEL_HELP[label]} ${QUALIFIER_TEXT[qualifier].help}` : LABEL_HELP[label]}
        data-testid="evidence-badge"
        data-label={label}
        data-source={source}
        data-qualifier={qualifier}
      >
        {label}
      </span>
      {mock && <span className="badge badge-mock-tag">MOCK</span>}
      {!mock && qualifier && (
        <span className="badge badge-mock-tag" title={QUALIFIER_TEXT[qualifier].help} data-testid="evidence-qualifier">
          {QUALIFIER_TEXT[qualifier].tag}
        </span>
      )}
    </span>
  );
}

/** HUMAN_VERIFIED with the right qualifier: simulator/unknown environments never render as production. */
export function HumanBadge({ source, worldEnvironment }: { source: DataSource; worldEnvironment?: "production" | "staging" }) {
  const qualifier: EvidenceQualifier | undefined =
    source === "DEV_MOCK" ? undefined : worldEnvironment === "staging" ? "TESTED_IN_SIMULATOR" : worldEnvironment === "production" ? undefined : "ENV_UNREPORTED";
  return <EvidenceBadge label="HUMAN_VERIFIED" source={source} qualifier={qualifier} />;
}

/** CR-ID-06 operator override: SELF_REPORTED + explicit tag. Never HUMAN_VERIFIED. */
export function OverrideBadge({ source }: { source: DataSource }) {
  return <EvidenceBadge label="SELF_REPORTED" source={source} qualifier="DEMO_OVERRIDE" />;
}

/** The right World badge for a seat: override first, then HUMAN_VERIFIED with its environment qualifier. */
export function SeatWorldBadge({ seat, source }: { seat: { worldProofStatus: string; worldEnvironment?: "production" | "staging"; demoOverride?: true }; source: DataSource }) {
  if (seat.demoOverride) return <OverrideBadge source={source} />;
  if (seat.worldProofStatus === "VERIFIED") return <HumanBadge source={source} worldEnvironment={seat.worldEnvironment} />;
  return null;
}

/* ---------------- Hash / address with explorer link (real data only) ---------------- */
export function HashLink({ value, chainId, kind = "tx", source, head = 6, tail = 4 }: { value?: string; chainId?: number; kind?: "tx" | "address"; source: DataSource; head?: number; tail?: number }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="faint">—</span>;
  const href = source !== "DEV_MOCK" && chainId ? (kind === "tx" ? explorerTx(chainId, value) : explorerAddress(chainId, value)) : undefined;
  const text = shortHex(value, head, tail);
  return (
    <span className="hash" data-testid={`hash-${kind}`}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" title={value}>
          {text} ↗
        </a>
      ) : (
        <span title={value}>{text}</span>
      )}
      <button
        type="button"
        className="copy"
        aria-label="Copy"
        onClick={() => {
          navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
      {source === "DEV_MOCK" && <span className="nolink" title="Mock values are random and do not exist on any chain">mock · no explorer</span>}
    </span>
  );
}

export function Skeleton({ width = "100%", height = 14 }: { width?: number | string; height?: number }) {
  return <div className="skeleton" style={{ width, height }} aria-hidden />;
}

export function LoadingCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card card-pad stack-sm" aria-busy>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={`${90 - i * 15}%`} />
      ))}
    </div>
  );
}

/** Sign in with the connected wallet (EIP-4361-style challenge). Live mode only. */
export function SignInNotice({ message }: { message?: string }) {
  const { address, connect, signIn, wallet } = useVestige();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Notice tone="info" title={message ?? "Sign in with your wallet"} testId="signin-notice">
      <span className="small">
        One free signature proves you control this wallet. It is not a transaction and approves no payment. Your session stays in this tab&apos;s memory only.
      </span>
      <span className="row" style={{ marginTop: 8 }}>
        {!address ? (
          <Button size="sm" loading={wallet.connecting} onClick={() => void connect()} data-testid="signin-connect">
            Connect wallet
          </Button>
        ) : (
          <Button
            size="sm"
            loading={busy}
            data-testid="signin-button"
            onClick={async () => {
              setBusy(true);
              setError(null);
              const r = await signIn();
              setBusy(false);
              if (!r.ok && r.error.code !== "CANCELLED") setError(r.error.detail ? `${r.error.message} (${r.error.detail})` : r.error.message);
            }}
          >
            Sign in
          </Button>
        )}
        {(error || wallet.error) && <span className="small" style={{ color: "var(--failed)" }}>{error ?? wallet.error}</span>}
      </span>
    </Notice>
  );
}

/** Renders an adapter error. BLOCKED is shown as "not connected yet", never as success. */
export function AdapterErrorNotice({ error }: { error: { code: string; message: string; detail?: string } }) {
  if (error.code === "UNAUTHENTICATED") return <SignInNotice message={error.message} />;
  if (error.code === "BLOCKED")
    return (
      <Notice tone="warn" title="Not connected yet" testId="blocked-notice">
        {error.message && error.message !== "Not connected yet" ? error.message : error.detail}
        {error.message && error.message !== "Not connected yet" && error.detail && <span className="tiny faint"> ({error.detail})</span>}
      </Notice>
    );
  return (
    <Notice tone="error" title={error.message} testId="error-notice">
      {error.detail && <span className="small">{error.detail}</span>}
    </Notice>
  );
}
