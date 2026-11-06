/** CR-C2-005 shared vectors: hand-checked expectations + the committed JSON stays in sync. */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { keccak256, stringToHex } from "viem";
import { canonicalize } from "../../src/modules/agreements/canonical";
import { IdentityError } from "../../src/modules/identity/errors";
import { buildVectors, INVALID, SPECIAL } from "./vectors/build-canonical-vectors";

const file = new URL("./vectors/canonical-v1.json", import.meta.url);

describe("canonical JSON vectors (C1 ↔ C2)", () => {
  it("hand-checked bytes", () => {
    expect(canonicalize({ b: 1, a: [true, null, "x"], c: { z: 1, y: 2 } })).toBe('{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}');
    expect(canonicalize({ n: "é" })).toBe('{"n":"é"}');
    expect(canonicalize({ "é": 1, f: 2, d: 3 })).toBe('{"d":3,"f":2,"\u00e9":1}');
    // UTF-16 code units: "B"(0x42) < "a"(0x61) < U+FF5E < U+1F600 (surrogate 0xD83D sorts BELOW 0xFF5E)
    expect(canonicalize({ a: 1, B: 2, "\u{1F600}": 3, "～": 4 })).toBe('{"B":2,"a":1,"\u{1F600}":3,"～":4}');
    expect(canonicalize({ list: [3, 1, 2] })).toBe('{"list":[3,1,2]}');
  });

  it("invalid and special JS-only cases", () => {
    for (const v of INVALID) {
      let code = "OK";
      try { canonicalize((0, eval)(v.js)); } catch (e) { code = (e as IdentityError).code; }
      expect(code, v.name).toBe(v.error);
    }
    for (const v of SPECIAL) expect(canonicalize((0, eval)(v.js)), v.name).toBe(v.canonical);
  });

  it("founding-terms document: exact bytes C2 must reproduce", () => {
    const v = buildVectors();
    expect(v.foundingTerms.canonical).toBe(
      '{"decisionRule":"Both founders must approve spending.","disclaimer":"Workspace agreement between founders. Not a legal incorporation, not legal advice, and not an equity or token issuance.","effectiveDate":"2026-11-07","founders":[{"contribution":"Product","ownershipBps":6000,"role":"CEO","vestingIntent":"4y, 1y cliff","wallet":"0x00000000000000000000000000000000000000a1"},{"contribution":"Engineering","ownershipBps":4000,"role":"CTO","vestingIntent":"4y, 1y cliff","wallet":"0x00000000000000000000000000000000000000b2"}],"notes":"Café ☕ é","schema":"vestige.founding-terms/1","ventureId":"0x1111111111111111111111111111111111111111111111111111111111111111"}',
    );
    expect(v.foundingTerms.docHash).toBe(keccak256(stringToHex(v.foundingTerms.canonical)));
  });

  it("committed vectors/canonical-v1.json matches the implementation", () => {
    const now = JSON.stringify(buildVectors(), null, 2) + "\n";
    if (process.env.WRITE_VECTORS === "1") writeFileSync(file, now);
    expect(readFileSync(file, "utf8")).toBe(now);
  });
});
