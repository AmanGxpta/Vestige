/**
 * Deterministic canonical JSON (RFC 8785-compatible for the value types we allow):
 * object keys sorted by UTF-16 code units, no whitespace, strings NFC-normalised,
 * integers only (no floats → no cross-runtime number formatting drift).
 * docHash = keccak256(utf8(canonicalJson)).
 */
import { keccak256, stringToHex, type Hex } from "viem";
import { fail } from "../identity/errors";

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function canonicalize(value: unknown, depth = 0): string {
  if (depth > 16) fail("AGREEMENT_INVALID", "Agreement is nested too deeply.");
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value.normalize("NFC"));
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isSafeInteger(value)) fail("AGREEMENT_INVALID", "Agreement numbers must be whole numbers (use basis points).");
      return Object.is(value, -0) ? "0" : String(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((v) => canonicalize(v, depth + 1)).join(",")}]`;
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) fail("AGREEMENT_INVALID", "Agreement must be plain JSON.");
      const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
      const keys = entries.map(([k]) => k.normalize("NFC"));
      if (new Set(keys).size !== keys.length) fail("AGREEMENT_INVALID", "Duplicate keys after normalisation.");
      return `{${entries
        .map(([k, v]) => [k.normalize("NFC"), v] as const)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v, depth + 1)}`)
        .join(",")}}`;
    }
    default:
      return fail("AGREEMENT_INVALID", "Agreement contains a non-JSON value.");
  }
}

export function docHash(canonicalJson: string): Hex {
  return keccak256(stringToHex(canonicalJson));
}
