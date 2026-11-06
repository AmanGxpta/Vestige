import { describe, expect, it } from "vitest";
import { deriveTreasuryVerdict } from "./verdict";
import type { PublicChainReport, Step } from "./chain-reader";

const P = { chainId: 1874, method: "x", source: "CHAIN" as const };
const ok = <T,>(value: T): Step<T> => ({ status: "VERIFIED", value, provenance: P });
const unknown = <T,>(): Step<T> => ({ status: "UNKNOWN", note: "rpc down", provenance: P });
const O1 = "0x1111111111111111111111111111111111111111" as const;
const O2 = "0x2222222222222222222222222222222222222222" as const;
const G = "0x9999999999999999999999999999999999999999" as const;

function report(over: Partial<NonNullable<PublicChainReport["whitechain"]>> = {}, guardText: string | null = G): PublicChainReport {
  return {
    ensName: "northstar.vestige.eth",
    startedAt: "",
    source: "CHAIN",
    ens: {
      resolver: ok("0x3333333333333333333333333333333333333333"),
      treasury: ok({ address: "0x4444444444444444444444444444444444444444", via: "ENSIP-11" }),
      texts: ok({ "vestige.guard": guardText, "vestige.status": "workspace" }),
    },
    whitechain: {
      blockNumber: ok("100"),
      safeCode: ok(true),
      version: ok("1.4.1"),
      owners: ok([O1, O2]),
      threshold: ok(2),
      guard: ok(G),
      modules: ok([]),
      token: ok({ address: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7", symbol: "USDT", decimals: 6, balanceRaw: "0" }),
      seats: ok([{ owner: O1, isSeat: true }, { owner: O2, isSeat: true }]),
      transfers: ok([]),
      ...over,
    },
  };
}

describe("deriveTreasuryVerdict", () => {
  it("ACTIVE only when every check is verified", () => {
    expect(deriveTreasuryVerdict(report()).state).toBe("ACTIVE");
  });
  it("threshold 1 → NOT_ACTIVE", () => {
    expect(deriveTreasuryVerdict(report({ threshold: ok(1) })).state).toBe("NOT_ACTIVE");
  });
  it("one owner twice / three owners → NOT_ACTIVE", () => {
    expect(deriveTreasuryVerdict(report({ owners: ok([O1, O1]) })).state).toBe("NOT_ACTIVE");
    expect(deriveTreasuryVerdict(report({ owners: ok([O1, O2, G]) })).state).toBe("NOT_ACTIVE");
  });
  it("guard mismatch against ENS or manifest → NOT_ACTIVE", () => {
    expect(deriveTreasuryVerdict(report({}, O1)).state).toBe("NOT_ACTIVE");
    expect(deriveTreasuryVerdict(report(), { expectedGuard: O2 }).state).toBe("NOT_ACTIVE");
  });
  it("no expected guard anywhere → UNVERIFIED, not ACTIVE", () => {
    expect(deriveTreasuryVerdict(report({}, null)).state).toBe("UNVERIFIED");
  });
  it("enabled module → NOT_ACTIVE", () => {
    expect(deriveTreasuryVerdict(report({ modules: { status: "FAILED", value: [O1], note: "modules", provenance: P } })).state).toBe("NOT_ACTIVE");
  });
  it("RPC failure is UNVERIFIED, never ACTIVE", () => {
    expect(deriveTreasuryVerdict(report({ threshold: unknown() })).state).toBe("UNVERIFIED");
    expect(deriveTreasuryVerdict(report({ seats: unknown() })).state).toBe("UNVERIFIED");
  });
  it("unresolved name → UNRESOLVED", () => {
    const r = report();
    r.ens.resolver = { status: "FAILED", note: "none", provenance: P };
    delete r.whitechain;
    expect(deriveTreasuryVerdict(r).state).toBe("UNRESOLVED");
  });
  it("status record 'incorporated' is flagged but does not change treasury state", () => {
    const r = report();
    r.ens.texts = ok({ "vestige.guard": G, "vestige.status": "incorporated" });
    const v = deriveTreasuryVerdict(r);
    expect(v.checks.find((c) => c.id === "status")!.status).toBe("FAILED");
  });
});
