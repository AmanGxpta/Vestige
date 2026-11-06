import { describe, expect, it } from "vitest";
import { formatTokenAmount, isValidSlug, parseTokenAmount, slugify } from "./format";
import { canonicalJson, previewDocHash } from "./canonical";
import { parseTreasuryTextRecord } from "../public-view/chain-reader";

describe("token amounts use bigint, never floats", () => {
  it("formats", () => {
    expect(formatTokenAmount("1000000000", 6)).toBe("1,000");
    expect(formatTokenAmount("1234567", 6)).toBe("1.23");
    expect(formatTokenAmount(0n, 6)).toBe("0");
  });
  it("parses", () => {
    expect(parseTokenAmount("1,000", 6)).toBe(1000000000n);
    expect(parseTokenAmount("0.000001", 6)).toBe(1n);
    expect(parseTokenAmount("0.0000001", 6)).toBeNull();
    expect(parseTokenAmount("1e3", 6)).toBeNull();
    expect(parseTokenAmount("-5", 6)).toBeNull();
  });
});

describe("slugs", () => {
  it("normalises names to DNS labels", () => {
    expect(slugify("Northstar Labs")).toBe("northstar-labs");
    expect(slugify("  Ünïcode__Team!! ")).toBe("unicode-team");
    expect(isValidSlug("northstar")).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("-bad")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
  });
});

describe("canonical JSON preview", () => {
  it("is key-order independent and hash changes with one word", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    const f = { contributions: "x", roles: "y", ownershipSplit: "50/50", vestingIntent: "4y", decisionRule: "both", effectiveDate: "2026-11-06" };
    const id = `0x${"ab".repeat(32)}` as const;
    expect(previewDocHash(id, 1, f).hash).toBe(previewDocHash(id, 1, { ...f }).hash);
    expect(previewDocHash(id, 1, f).hash).not.toBe(previewDocHash(id, 1, { ...f, roles: "z" }).hash);
  });
});

describe("treasury text-record fallback", () => {
  it("parses only the strict eip155:1874 form", () => {
    expect(parseTreasuryTextRecord("eip155:1874:0x1111111111111111111111111111111111111111")).toBe("0x1111111111111111111111111111111111111111");
    expect(parseTreasuryTextRecord("eip155:1:0x1111111111111111111111111111111111111111")).toBeNull();
    expect(parseTreasuryTextRecord("0x1111111111111111111111111111111111111111")).toBeNull();
    expect(parseTreasuryTextRecord(null)).toBeNull();
  });
});
