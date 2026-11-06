import { keccak256, stringToBytes } from "viem";
import type { AgreementFields, Hex, VentureId } from "./types";

/**
 * Deterministic canonical JSON (recursively sorted keys, no whitespace).
 *
 * PREVIEW ONLY. C1 owns the authoritative canonicalisation + docHash (FR-3). The
 * UI computes this so founders can see the hash change as they edit; the value
 * shown as "signed" always comes from the API. Integration check for H: this
 * function's output must byte-match C1's for the same input.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

export function agreementDocument(ventureId: VentureId, version: number, fields: AgreementFields) {
  return { ventureId, version, template: "vestige-founding-terms-v1", fields };
}

export function previewDocHash(ventureId: VentureId, version: number, fields: AgreementFields): { json: string; hash: Hex } {
  const json = canonicalJson(agreementDocument(ventureId, version, fields));
  return { json, hash: keccak256(stringToBytes(json)) };
}
