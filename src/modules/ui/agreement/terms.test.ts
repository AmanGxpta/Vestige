/**
 * Shared byte/hash vectors with C1 (CONTRACTS v0: "C1 and C2 must run shared
 * byte/hash vectors"). Expected values in c1-vectors.json were produced by running
 * C1's canonicalize/buildTermsDoc at agent/identity@1b502e6 — not by this module.
 */
import { describe, expect, it } from "vitest";
import vectors from "./c1-vectors.json";
import { CanonicalError, buildTermsDoc, canonicalize, docHashOf, previewTerms, type FoundingTermsInput } from "./terms";

const A = "0xAaAa000000000000000000000000000000000001" as const;
const B = "0xbBbB000000000000000000000000000000000002" as const;
const VID = `0x${"ab".repeat(32)}` as const;
const deep = (n: number): unknown => (n === 0 ? 1 : [deep(n - 1)]);

/** Same inputs, by name, as the generator that ran C1's code. */
const INPUTS: Record<string, unknown> = {
  "sorted-keys-nested": { b: 1, a: { d: [3, 2, 1], c: "x" } },
  "array-order-preserved": [3, 1, 2, { z: 0, y: 0 }],
  "nfc-composed": { k: "café" },
  "nfc-decomposed-equals-composed": { k: "café" },
  "nfc-key-normalized": { "café": 1 },
  "utf16-code-unit-key-order": { "～": 1, "\u{1f600}": 2, a: 3 },
  "negative-zero": { n: -0 },
  integers: { a: 0, b: -42, c: 9007199254740991 },
  "undefined-property-omitted": { a: 1, b: undefined },
  literals: { t: true, f: false, n: null, s: "" },
  escapes: { s: "quote\" backslash\\ nl\n tab\t   \u0001" },
  "lone-surrogate": { s: "\ud800" },
  "invalid-duplicate-after-nfc": { "café": 1, "café": 2 },
  "invalid-float": { n: 1.5 },
  "invalid-unsafe-integer": { n: 9007199254740992 },
  "invalid-nan": { n: NaN },
  "invalid-undefined-array-element": [1, undefined],
  "nesting-16-arrays-ok": deep(16),
  "invalid-nesting-17-arrays": deep(17),
  // eslint-disable-next-line no-sparse-arrays
  "sparse-array": [1, , 2],
};

const DOC_INPUTS: Record<string, { founders: string[]; input: FoundingTermsInput }> = Object.fromEntries(
  vectors.documents.map((d) => [d.name, { founders: d.verifiedFounders as string[], input: d.input as FoundingTermsInput }]),
);

describe("canonical JSON matches C1 byte-for-byte", () => {
  for (const v of vectors.canonical) {
    if (v.name === "sparse-array") continue; // intentional, documented deviation below
    it(v.name, () => {
      const input = INPUTS[v.name];
      expect(input, `missing input for ${v.name}`).not.toBeUndefined();
      if (v.result.ok) {
        const json = canonicalize(input);
        expect(json).toBe(v.result.json);
        expect(docHashOf(json)).toBe(v.result.hash);
      } else {
        expect(() => canonicalize(input)).toThrow(CanonicalError);
      }
    });
  }

  it("sparse arrays are rejected (CONTRACTS); C1@1b502e6 emits invalid JSON — reported", () => {
    const c1 = vectors.canonical.find((v) => v.name === "sparse-array")!;
    expect(c1.result.ok && c1.result.json).toBe("[1,,2]"); // what C1 does today
    expect(() => canonicalize(INPUTS["sparse-array"])).toThrow(/sparse/);
  });

  it("rejects non-plain objects and non-JSON values", () => {
    expect(() => canonicalize({ d: new Date(0) })).toThrow(CanonicalError);
    expect(() => canonicalize({ n: 1n })).toThrow(CanonicalError);
    expect(() => canonicalize({ f: () => 1 })).toThrow(CanonicalError);
  });
});

describe("founding-terms document matches C1", () => {
  for (const v of vectors.documents) {
    it(v.name, () => {
      const { founders, input } = DOC_INPUTS[v.name];
      const p = previewTerms(VID, founders as `0x${string}`[], input);
      expect(p.ok).toBe(true);
      if (!p.ok) return;
      expect(p.json).toBe(v.canonicalJson);
      expect(p.hash).toBe(v.docHash);
    });
  }

  it("founder order and wallet case do not change the hash", () => {
    const base = DOC_INPUTS["two-founders-basic"].input;
    const flipped = { ...base, founders: [...base.founders].reverse().map((f) => ({ ...f, wallet: f.wallet.toLowerCase() as `0x${string}` })) };
    expect(previewTerms(VID, [A, B], flipped)).toMatchObject({ hash: vectors.documents[0].docHash });
  });

  it("changing one word changes the hash", () => {
    const base = DOC_INPUTS["two-founders-basic"].input;
    const p = previewTerms(VID, [A, B], { ...base, decisionRule: `${base.decisionRule} Always.` });
    expect(p.ok && p.hash).not.toBe(vectors.documents[0].docHash);
  });

  it("reports C1's validation failures inline instead of hashing", () => {
    const base = DOC_INPUTS["two-founders-basic"].input;
    const bad = buildTermsDoc(VID, [A, B], { ...base, founders: [base.founders[0], { ...base.founders[1], ownershipBps: 4000 }] });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.problems.map((p) => p.field)).toContain("ownership");
    expect(buildTermsDoc(VID, [A, B], { ...base, effectiveDate: "06/11/2026" }).ok).toBe(false);
    expect(buildTermsDoc(VID, [A, B], { ...base, founders: [base.founders[0]] }).ok).toBe(false);
    expect(buildTermsDoc(VID, [A, B], { ...base, founders: [base.founders[0], { ...base.founders[1], ownershipBps: 5000.5 }] }).ok).toBe(false);
  });
});
