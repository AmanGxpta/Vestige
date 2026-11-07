import type { Address, Hex } from "./types";

export function shortHex(value: string | undefined, head = 6, tail = 4): string {
  if (!value) return "-";
  if (value.length <= head + tail + 2) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Raw token units (decimal string) → human string. bigint only; never floats. */
export function formatTokenAmount(raw: string | bigint, decimals: number, maxFraction = 2): string {
  const v = typeof raw === "bigint" ? raw : BigInt(raw);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxFraction).replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${wholeStr}${frac ? `.${frac}` : ""}`;
}

/** Human decimal string → raw units. Returns null on invalid input. */
export function parseTokenAmount(input: string, decimals: number): bigint | null {
  const s = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [w, f = ""] = s.split(".");
  if (f.length > decimals) return null;
  return BigInt(w) * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, "0") || "0");
}

export function isAddress(v: string): v is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}

export function isHex32(v: string): v is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(v);
}

/** DNS-compatible ENS label: lowercase a-z0-9 and inner hyphens, 3–32 chars. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/.test(slug) && !slug.includes("--");
}

export function relativeTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "-";
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.max(s, 0)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
