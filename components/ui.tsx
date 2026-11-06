"use client";

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { explorerAddress, explorerTx } from "@/src/modules/ui/config";
import { shortHex } from "@/src/modules/ui/format";
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
  const btn = (
    <button className={cls} disabled={isDisabled} aria-busy={loading || undefined} title={disabledReason || undefined} {...rest}>
      {loading && <span className="spinner" aria-hidden />}
      {children}
    </button>
  );
  if (!disabledReason) return btn;
  return (
    <span className="btn-wrap" style={block ? { width: "100%" } : undefined}>
      {btn}
      <span className="btn-reason" data-testid="disabled-reason">
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
export function StatusPill({ status, children }: { status: string; children?: ReactNode }) {
  return (
    <span className={`pill pill-${status}`} data-status={status} data-testid="status-pill">
      {children ?? STATUS_TEXT[status] ?? status}
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
export function EvidenceBadge({ label, source }: { label: EvidenceLabel; source: DataSource }) {
  const mock = source === "DEV_MOCK";
  return (
    <span className="row" style={{ gap: 4 }}>
      <span
        className={`badge badge-${label}${mock ? " badge-mock" : ""}`}
        title={mock ? `DEV MOCK — would be ${label} with real data. ${LABEL_HELP[label]}` : LABEL_HELP[label]}
        data-testid="evidence-badge"
        data-label={label}
        data-source={source}
      >
        {label}
      </span>
      {mock && <span className="badge badge-mock-tag">MOCK</span>}
    </span>
  );
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

/** Renders an adapter error. BLOCKED is shown as "not connected yet", never as success. */
export function AdapterErrorNotice({ error }: { error: { code: string; message: string; detail?: string } }) {
  if (error.code === "BLOCKED")
    return (
      <Notice tone="warn" title="Not connected yet" testId="blocked-notice">
        {error.detail ?? error.message}
      </Notice>
    );
  return (
    <Notice tone="error" title={error.message} testId="error-notice">
      {error.detail && <span className="small">{error.detail}</span>}
    </Notice>
  );
}
