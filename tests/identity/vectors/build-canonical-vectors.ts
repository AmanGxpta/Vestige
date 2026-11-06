/**
 * Generates vectors/canonical-v1.json — shared byte/hash vectors for C1 ↔ C2
 * (CONTRACTS v0 CR-C2-005 / D-023). Run: npx tsx? No — run via vitest:
 *   npx vitest run --config vitest.config.ts canonical-vectors   (writes when WRITE_VECTORS=1)
 * `valid[].input` is plain JSON; `invalid[].js` is a JS expression (JSON cannot express
 * undefined/sparse/-0/floats-as-written), evaluated by the consumer's test only.
 */
import { buildTermsDoc } from "../../../src/modules/agreements/terms";
import { canonicalize, docHash } from "../../../src/modules/agreements/canonical";

export const VALID: { name: string; input: unknown }[] = [
  { name: "key order independent", input: { b: 1, a: [true, null, "x"], c: { z: 1, y: 2 } } },
  { name: "array order preserved", input: { list: [3, 1, 2] } },
  { name: "composed é (U+00E9)", input: { n: "é" } },
  { name: "decomposed e + U+0301 normalises to composed", input: { n: "é" } },
  { name: "decomposed key normalises before sorting", input: { "é": 1, f: 2, d: 3 } },
  { name: "UTF-16 code unit order (uppercase before lowercase, astral after BMP)", input: { a: 1, B: 2, "\u{1F600}": 3, "～": 4 } },
  { name: "integers incl. negative and max safe", input: { n: [-5, 0, 9007199254740991] } },
  { name: "escapes", input: { s: "quote\" backslash\\ newline\n tab\t ctrl\u0001" } },
  { name: "empty containers", input: { o: {}, a: [] } },
];

export const INVALID: { name: string; js: string; error: "AGREEMENT_INVALID" }[] = [
  { name: "float", js: "({ x: 0.5 })", error: "AGREEMENT_INVALID" },
  { name: "unsafe integer", js: "({ x: 9007199254740992 })", error: "AGREEMENT_INVALID" },
  { name: "NaN", js: "({ x: NaN })", error: "AGREEMENT_INVALID" },
  { name: "bigint", js: "({ x: 10n })", error: "AGREEMENT_INVALID" },
  { name: "Date (non-plain object)", js: "({ x: new Date(0) })", error: "AGREEMENT_INVALID" },
  { name: "undefined array element", js: "({ x: [1, undefined] })", error: "AGREEMENT_INVALID" },
  { name: "sparse array", js: "({ x: [1, , 2] })", error: "AGREEMENT_INVALID" },
  { name: "duplicate key after NFC", js: '({ "\\u00e9": 1, "e\\u0301": 2 })', error: "AGREEMENT_INVALID" },
  { name: "17 levels of nesting", js: "JSON.parse('['.repeat(17) + ']'.repeat(17))", error: "AGREEMENT_INVALID" },
];

export const SPECIAL: { name: string; js: string; canonical: string }[] = [
  { name: "undefined object property omitted", js: "({ a: 1, b: undefined })", canonical: '{"a":1}' },
  { name: "negative zero → 0", js: "({ z: -0 })", canonical: '{"z":0}' },
  { name: "16 levels of nesting accepted", js: "JSON.parse('['.repeat(16) + ']'.repeat(16))", canonical: "[".repeat(16) + "]".repeat(16) },
];

/** The exact C1 founding-terms document for fixed inputs (what C2's preview must byte-match). */
export const TERMS_INPUT = {
  ventureId: "0x1111111111111111111111111111111111111111111111111111111111111111",
  verifiedFounders: ["0x00000000000000000000000000000000000000a1", "0x00000000000000000000000000000000000000b2"],
  fields: {
    effectiveDate: "2026-11-07",
    decisionRule: "  Both founders must approve spending.  ",
    notes: "Café ☕ é",
    founders: [
      { wallet: "0x00000000000000000000000000000000000000B2", role: "CTO", contribution: "Engineering", ownershipBps: 4000, vestingIntent: "4y, 1y cliff" },
      { wallet: "0x00000000000000000000000000000000000000A1", role: "CEO", contribution: "Product", ownershipBps: 6000, vestingIntent: "4y, 1y cliff" },
    ],
  },
} as const;

export function buildVectors() {
  const doc = buildTermsDoc(TERMS_INPUT.ventureId, [...TERMS_INPUT.verifiedFounders] as `0x${string}`[], TERMS_INPUT.fields);
  const termsCanonical = canonicalize(doc);
  return {
    schema: "vestige.canonical-vectors/1",
    algorithm: "vestige restricted canonical JSON (CONTRACTS v0 @30d1ef6); docHash = keccak256(UTF-8(canonicalJson))",
    generatedBy: "C1 tests/identity/vectors/build-canonical-vectors.ts",
    valid: VALID.map((v) => {
      const c = canonicalize(v.input);
      return { ...v, canonical: c, docHash: docHash(c) };
    }),
    special: SPECIAL.map((v) => ({ ...v, docHash: docHash(v.canonical) })),
    invalid: INVALID,
    foundingTerms: {
      note: "buildTermsDoc trims text fields, lowercases wallets, sorts founders by wallet, fixes schema + disclaimer; notes default to \"\". Validation happens before NFC.",
      input: TERMS_INPUT,
      canonical: termsCanonical,
      docHash: docHash(termsCanonical),
    },
  };
}
