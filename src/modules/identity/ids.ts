import { randomBytes } from "node:crypto";
import { getAddress, isAddress, type Address, type Hex } from "viem";
import { normalize } from "viem/ens";
import { VESTIGE_PARENT_NAME } from "./config";
import { fail } from "./errors";

export type Bytes32 = Hex;

/** Server-only canonical ventureId: 0x + 64 lowercase hex. Allocated once. */
export function newVentureId(): Bytes32 {
  return `0x${randomBytes(32).toString("hex")}`;
}

export function newBytes32(): Bytes32 {
  return `0x${randomBytes(32).toString("hex")}`;
}

export function isVentureId(v: unknown): v is Bytes32 {
  return typeof v === "string" && /^0x[0-9a-f]{64}$/.test(v);
}

export function assertVentureId(v: unknown): Bytes32 {
  if (!isVentureId(v)) fail("BAD_REQUEST", "ventureId must be 0x + 64 lowercase hex characters.");
  return v;
}

/** Labels must survive ENSIP-15 normalisation unchanged and be plain DNS. */
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/; // 3..32 chars
const RESERVED = new Set(["www", "api", "app", "admin", "root", "vestige", "treasury", "guard", "status"]);

function sanitize(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function validLabel(label: string): boolean {
  if (!LABEL_RE.test(label)) return false;
  // Disallow "xx--" (punycode / ENSIP-15 hyphen rule) and reserved words.
  if (label.slice(2, 4) === "--" || RESERVED.has(label)) return false;
  try {
    return normalize(label) === label;
  } catch {
    return false;
  }
}

/** Venture slug from a requested slug or display name. Throws SLUG_INVALID. */
export function toSlug(input: string): string {
  if (typeof input !== "string") fail("SLUG_INVALID", "Slug must be a string.");
  const s = sanitize(input);
  if (!validLabel(s)) fail("SLUG_INVALID", "Venture name must give 3–32 characters of a–z, 0–9 or single hyphens.");
  return s;
}

/** Founder handle for `<label>.<slug>.vestige.eth`. Throws LABEL_INVALID. */
export function toFounderLabel(input: string): string {
  if (typeof input !== "string") fail("LABEL_INVALID", "Founder label must be a string.");
  const s = sanitize(input);
  if (!validLabel(s)) fail("LABEL_INVALID", "Founder handle must be 3–32 characters of a–z, 0–9 or single hyphens.");
  return s;
}

export function ventureEnsName(slug: string, parent = VESTIGE_PARENT_NAME): string {
  return `${slug}.${parent}`;
}

export function founderEnsName(label: string, slug: string, parent = VESTIGE_PARENT_NAME): string {
  return `${label}.${slug}.${parent}`;
}

/** Parse a venture ENS name back to its slug; rejects other parents / depth. */
export function slugFromEnsName(ensName: string, parent = VESTIGE_PARENT_NAME): string {
  const lower = typeof ensName === "string" ? ensName.toLowerCase() : "";
  const suffix = `.${parent}`;
  if (!lower.endsWith(suffix)) fail("NOT_FOUND", "Not a vestige venture name.");
  const slug = lower.slice(0, -suffix.length);
  if (!validLabel(slug)) fail("NOT_FOUND", "Not a vestige venture name.");
  return slug;
}

/** Canonical stored form of a wallet: lowercase 0x hex. */
export function canonicalWallet(v: unknown): Address {
  if (typeof v !== "string" || !isAddress(v, { strict: false })) fail("BAD_REQUEST", "Invalid wallet address.");
  return getAddress(v).toLowerCase() as Address;
}
