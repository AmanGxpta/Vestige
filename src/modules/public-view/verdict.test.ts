import { describe, expect, it } from "vitest";
import { deriveTreasuryVerdict } from "./verdict";
import { manifestUrlFor, validateManifest, type DeploymentManifestV1 } from "./manifest";
import type { PublicChainReport, Step } from "./chain-reader";

const P = { chainId: 1874, method: "x", source: "CHAIN" as const };
const ok = <T,>(value: T): Step<T> => ({ status: "VERIFIED", value, provenance: P });
const unknown = <T,>(): Step<T> => ({ status: "UNKNOWN", note: "rpc down", provenance: P });
const O1 = "0x1111111111111111111111111111111111111111" as const;
const O2 = "0x2222222222222222222222222222222222222222" as const;
const G = "0x9999999999999999999999999999999999999999" as const;
const R = "0x8888888888888888888888888888888888888888" as const;
const SAFE = "0x4444444444444444444444444444444444444444" as const;
const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" as const;
const VID = `0x${"ab".repeat(32)}` as const;
const H = (c: string) => `0x${c.repeat(64)}` as `0x${string}`;
const art = (address: `0x${string}`, code: string) => ({ address, deploymentTxHash: H("e"), deploymentBlock: 100, runtimeCodeHash: H(code), abiPath: "contracts/abi/X.json", abiSha256: "a".repeat(64) });

/** Fixture only — a structurally valid manifest. Not a real deployment. */
export const MANIFEST: DeploymentManifestV1 = {
  schemaVersion: 1,
  network: "whitechain-sepolia",
  chainId: 1874,
  deploymentBlock: 100,
  sourceCommit: "4d44fa8".padEnd(40, "0"),
  explorerBaseUrl: "https://explorer.testnet.whitechain.io",
  ventureId: VID,
  ensName: "northstar.vestige.eth",
  owners: [O1, O2],
  threshold: 2,
  setupInitializerHash: H("f"),
  approvedAt: "2026-11-07T00:00:00Z",
  contracts: {
    safe: art(SAFE, "1"),
    guard: art(G, "2"),
    registry: art(R, "3"),
    singleton: art("0x29fcB43b46531BcA003ddC8FCB67FFE91900C762", "4"),
    factory: art("0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", "5"),
    setup: art("0x7777777777777777777777777777777777777777", "6"),
    token: {
      ...art(USDT, "7"),
      decimals: 6,
      eip712Domain: { name: "Tether USD", version: "1", chainId: 1874, verifyingContract: USDT },
      domainSeparator: H("d"),
      implementation: art("0x26425662D126412128967ECf0a02EC48573026F7", "8"),
    },
  },
};

function report(over: Partial<NonNullable<PublicChainReport["whitechain"]>> = {}, opts: { guardText?: string | null; manifest?: PublicChainReport["manifest"]; ensVid?: string | null; apiVid?: `0x${string}` } = {}): PublicChainReport {
  const ensVid = opts.ensVid === undefined ? VID : opts.ensVid;
  return {
    ensName: "northstar.vestige.eth",
    normalizedName: "northstar.vestige.eth",
    startedAt: "",
    source: "CHAIN",
    ens: {
      resolver: ok("0x3333333333333333333333333333333333333333"),
      treasury: ok({ address: SAFE, via: "ENSIP-11" }),
      texts: ok({ "vestige.guard": opts.guardText === undefined ? G : opts.guardText, "vestige.status": "workspace", "vestige.ventureId": ensVid }),
      ventureId: ensVid ? ok(ensVid as `0x${string}`) : { status: "FAILED", note: "no record", provenance: P },
    },
    manifest: opts.manifest ?? { status: "LOADED", manifest: MANIFEST, url: "/m.json" },
    apiVentureId: opts.apiVid,
    whitechain: {
      blockNumber: ok("200"),
      safeCode: ok(true),
      version: ok("1.4.1"),
      owners: ok([O1, O2]),
      threshold: ok(2),
      guard: ok(G),
      binding: ok({ safe: SAFE, registry: R, ventureId: VID }),
      codeHashes: ok({ safe: H("1"), guard: H("2"), registry: H("3") }),
      modules: ok([]),
      token: ok({ address: USDT, symbol: "USDT", decimals: 6, balanceRaw: "0" }),
      seats: ok([{ owner: O1, isSeat: true }, { owner: O2, isSeat: true }]),
      transfers: ok([]),
      ...over,
    },
  };
}
const state = (r: PublicChainReport) => deriveTreasuryVerdict(r).state;
const check = (r: PublicChainReport, id: string) => deriveTreasuryVerdict(r).checks.find((c) => c.id === id)!;

describe("deriveTreasuryVerdict — chain invariants", () => {
  it("ACTIVE only when ENS, manifest, binding, code and chain all agree", () => {
    expect(state(report())).toBe("ACTIVE");
  });
  it("threshold 1 → NOT_ACTIVE", () => expect(state(report({ threshold: ok(1) }))).toBe("NOT_ACTIVE"));
  it("one owner twice / three owners → NOT_ACTIVE", () => {
    expect(state(report({ owners: ok([O1, O1]) }))).toBe("NOT_ACTIVE");
    expect(state(report({ owners: ok([O1, O2, G]) }))).toBe("NOT_ACTIVE");
  });
  it("enabled module → NOT_ACTIVE", () => {
    expect(state(report({ modules: { status: "FAILED", value: [O1], note: "modules", provenance: P } }))).toBe("NOT_ACTIVE");
  });
  it("owner that is not a seat → NOT_ACTIVE", () => {
    expect(state(report({ seats: { status: "FAILED", value: [{ owner: O1, isSeat: false }], note: "x", provenance: P } }))).toBe("NOT_ACTIVE");
  });
  it("RPC failure is UNVERIFIED, never ACTIVE", () => {
    expect(state(report({ threshold: unknown() }))).toBe("UNVERIFIED");
    expect(state(report({ seats: unknown() }))).toBe("UNVERIFIED");
    expect(state(report({ binding: unknown() }))).toBe("UNVERIFIED");
  });
});

describe("deriveTreasuryVerdict — ENS / manifest / API consistency (mismatch = UNVERIFIED)", () => {
  it("no manifest configured → UNVERIFIED even if the chain looks right", () => {
    const r = report({}, { manifest: { status: "NOT_CONFIGURED" } });
    expect(state(r)).toBe("UNVERIFIED");
    expect(check(r, "manifest").status).toBe("UNKNOWN");
    expect(check(r, "guard").status).toBe("UNKNOWN");
  });
  it("manifest for another venture does not apply", () => {
    const r = report({}, { manifest: { status: "LOADED", manifest: { ...MANIFEST, ensName: "other.vestige.eth" }, url: "/m.json" } });
    expect(state(r)).toBe("UNVERIFIED");
  });
  it("invalid manifest → FAILED check, UNVERIFIED state", () => {
    const r = report({}, { manifest: { status: "INVALID", problems: ["threshold must be 2"], url: "/m.json" } });
    expect(check(r, "manifest").status).toBe("FAILED");
    expect(state(r)).toBe("UNVERIFIED");
  });
  it("guard differs from manifest or ENS record → UNVERIFIED", () => {
    expect(state(report({ guard: ok(O1) }))).toBe("UNVERIFIED");
    expect(state(report({}, { guardText: O1 }))).toBe("UNVERIFIED");
  });
  it("Guard bound to a different Safe / venture / registry → UNVERIFIED", () => {
    expect(state(report({ binding: ok({ safe: O1, registry: R, ventureId: VID }) }))).toBe("UNVERIFIED");
    expect(state(report({ binding: ok({ safe: SAFE, registry: R, ventureId: H("c") }) }))).toBe("UNVERIFIED");
    expect(state(report({ binding: ok({ safe: SAFE, registry: O2, ventureId: VID }) }))).toBe("UNVERIFIED");
  });
  it("runtime code hash differs → UNVERIFIED", () => {
    expect(check(report({ codeHashes: ok({ safe: H("1"), guard: H("0"), registry: H("3") }) }), "codehash").detail).toMatch(/guard/);
    expect(state(report({ codeHashes: ok({ safe: H("1"), guard: H("0"), registry: H("3") }) }))).toBe("UNVERIFIED");
  });
  it("ventureId: missing in ENS → UNVERIFIED; API disagreeing with ENS → UNVERIFIED; API agreeing is fine", () => {
    expect(state(report({}, { ensVid: null }))).toBe("UNVERIFIED");
    expect(state(report({}, { apiVid: H("c") }))).toBe("UNVERIFIED");
    expect(state(report({}, { apiVid: VID }))).toBe("ACTIVE");
  });
  it("unresolved name → UNRESOLVED", () => {
    const r = report();
    r.ens.resolver = { status: "FAILED", note: "none", provenance: P };
    delete r.whitechain;
    expect(state(r)).toBe("UNRESOLVED");
  });
  it("status record 'incorporated' is flagged but does not change treasury state", () => {
    const r = report();
    r.ens.texts = ok({ "vestige.guard": G, "vestige.status": "incorporated", "vestige.ventureId": VID });
    expect(check(r, "status").status).toBe("FAILED");
    expect(state(r)).toBe("ACTIVE");
  });
});

describe("validateManifest (fail closed)", () => {
  it("accepts the full treasury schema", () => expect(validateManifest(MANIFEST)).toEqual([]));
  it("rejects infrastructure manifests, wrong chain/threshold, bad ventureId, missing contracts", () => {
    expect(validateManifest({ ...MANIFEST, kind: "infrastructure" })).toContain("this is an InfrastructureManifestV1; a treasury manifest is required");
    expect(validateManifest({ ...MANIFEST, chainId: 1 })).toContain("chainId must be 1874");
    expect(validateManifest({ ...MANIFEST, threshold: 1 })).toContain("threshold must be 2");
    expect(validateManifest({ ...MANIFEST, ventureId: VID.toUpperCase().replace("0X", "0x") })).toContain("ventureId must be 0x + 64 lowercase hex");
    const { guard: _g, ...rest } = MANIFEST.contracts;
    expect(validateManifest({ ...MANIFEST, contracts: rest })).toContain("contracts.guard is missing");
    expect(validateManifest({ ...MANIFEST, owners: [O1, O1] })).toContain("owners must be distinct");
  });
  it("matches X's stricter rules: anchors, unknown keys, short commit, deploymentBlock binding, abiPath", () => {
    expect(validateManifest({ ...MANIFEST, sourceCommit: "ee46097" })).toContain("sourceCommit must be a full 40-hex git commit");
    expect(validateManifest({ ...MANIFEST, extra: 1 })).toContain("manifest has unknown keys: extra");
    expect(validateManifest({ ...MANIFEST, deploymentBlock: 99 })).toContain("deploymentBlock must equal contracts.safe.deploymentBlock");
    expect(validateManifest({ ...MANIFEST, contracts: { ...MANIFEST.contracts, factory: { ...MANIFEST.contracts.factory, address: O1 } } }).some((p) => p.includes("approved anchor"))).toBe(true);
    expect(validateManifest({ ...MANIFEST, contracts: { ...MANIFEST.contracts, guard: { ...MANIFEST.contracts.guard, abiPath: "../x.json" } } }).some((p) => p.includes("abiPath"))).toBe(true);
    expect(validateManifest({ ...MANIFEST, approvedAt: "2026-11-07T00:00:00+05:30" }).some((p) => p.includes("approvedAt"))).toBe(true);
  });
  it("rejects a token domain that is not the approved Tether USD domain", () => {
    const bad = { ...MANIFEST, contracts: { ...MANIFEST.contracts, token: { ...MANIFEST.contracts.token, eip712Domain: { ...MANIFEST.contracts.token.eip712Domain, name: "Fake USD" } } } };
    expect(validateManifest(bad).some((p) => p.includes("eip712Domain"))).toBe(true);
  });
});

describe("CR-C2-008 manifest URL templates", () => {
  it("substitutes {ensName} per venture, encoded and lowercased", () => {
    expect(manifestUrlFor("/manifests/{ensName}.json", "Northstar.Vestige.ETH")).toBe("/manifests/northstar.vestige.eth.json");
    expect(manifestUrlFor("https://cdn.example/m/{ensName}/manifest.json", "a-b.vestige.eth")).toBe("https://cdn.example/m/a-b.vestige.eth/manifest.json");
  });
  it("keeps a token-free URL unchanged (single-manifest deployments)", () => {
    expect(manifestUrlFor("/manifest.json", "northstar.vestige.eth")).toBe("/manifest.json");
    expect(manifestUrlFor(undefined, "northstar.vestige.eth")).toBeUndefined();
  });
  it("never guesses a manifest for non-venture names or path tricks", () => {
    expect(manifestUrlFor("/manifests/{ensName}.json", "vitalik.eth")).toBeUndefined();
    expect(manifestUrlFor("/manifests/{ensName}.json", "../etc.vestige.eth")).toBeUndefined();
    expect(manifestUrlFor("/manifests/{ensName}.json", undefined)).toBeUndefined();
  });
});
