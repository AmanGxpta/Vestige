"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function EnsLookupForm({ compact = false, initial = "" }: { compact?: boolean; initial?: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className={compact ? "stack-sm" : "row"}
      style={{ marginTop: compact ? "auto" : undefined }}
      onSubmit={(e) => {
        e.preventDefault();
        let n = name.trim().toLowerCase();
        if (!n) return setError("Enter an ENS name.");
        if (!n.includes(".")) n = `${n}.vestige.eth`;
        setError(null);
        router.push(`/v/${encodeURIComponent(n)}`);
      }}
    >
      <label htmlFor={compact ? "ens-compact" : "ens-full"} className="sr-only">
        Venture ENS name
      </label>
      <input
        id={compact ? "ens-compact" : "ens-full"}
        className="input"
        placeholder="northstar.vestige.eth"
        value={name}
        onChange={(e) => setName(e.target.value)}
        data-testid="ens-input"
        style={compact ? undefined : { flex: 1, minWidth: 220 }}
        autoComplete="off"
        spellCheck={false}
      />
      <button className="btn" type="submit" data-testid="ens-submit">
        Verify
      </button>
      {error && <span className="small" style={{ color: "var(--failed)" }}>{error}</span>}
    </form>
  );
}
