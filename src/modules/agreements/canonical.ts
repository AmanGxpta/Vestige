/**
 * vestige restricted canonical JSON (CONTRACTS v0 @30d1ef6, CR-C2-005, D-014/D-023).
 * NOT a claim of full RFC 8785 compliance.
 * - strings (values AND keys) normalised to NFC; keys sorted by UTF-16 code units
 *   after normalisation; duplicate keys after normalisation are rejected
 * - only plain objects/arrays/strings/booleans/null and SAFE INTEGERS; -0 → 0
 * - `undefined` object properties are omitted; undefined/sparse ARRAY elements are invalid
 * - array order preserved; compact output, no whitespace
 * - more than 16 levels of container nesting is rejected (root container = level 1)
 * docHash = keccak256(UTF-8(canonicalJson)).
 */
import { keccak256, stringToHex, type Hex } from "viem";
import { fail } from "../identity/errors";

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export const MAX_CANONICAL_DEPTH = 16;

export function canonicalize(value: unknown, depth = 0): string {
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
      if (depth + 1 > MAX_CANONICAL_DEPTH) fail("AGREEMENT_INVALID", "Agreement is nested too deeply.");
      if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) fail("AGREEMENT_INVALID", "Agreement must be plain JSON.");
        const parts: string[] = [];
        for (let i = 0; i < value.length; i++) {
          if (!(i in value) || value[i] === undefined) fail("AGREEMENT_INVALID", "Agreement lists cannot have empty or undefined entries.");
          parts.push(canonicalize(value[i], depth + 1));
        }
        return `[${parts.join(",")}]`;
      }
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) fail("AGREEMENT_INVALID", "Agreement must be plain JSON.");
      if (Object.getOwnPropertySymbols(value).length > 0) fail("AGREEMENT_INVALID", "Agreement must be plain JSON.");
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k.normalize("NFC"), v] as const);
      const keys = entries.map(([k]) => k);
      if (new Set(keys).size !== keys.length) fail("AGREEMENT_INVALID", "Duplicate keys after normalisation.");
      return `{${entries
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
