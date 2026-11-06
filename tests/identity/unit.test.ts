import { describe, expect, it } from "vitest";
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { encodeAbiParameters, keccak256, namehash } from "viem";
import { canonicalize, docHash } from "../../src/modules/agreements/canonical";
import { ENS_KEYS, WHITECHAIN_COIN_TYPE } from "../../src/modules/identity/config";
import {
  dnsEncode,
  FOUNDER_ROLE_BITMAP,
  predictProxyAddress,
  REG,
  RES,
  VENTURE_REGISTRY_REGISTRAR_ROLES,
} from "../../src/modules/identity/ens/encoding";
import { buildFounderPlan, buildVenturePlan, recordCalls } from "../../src/modules/identity/ens/registrar";
import { IdentityError } from "../../src/modules/identity/errors";
import { founderEnsName, isVentureId, newVentureId, slugFromEnsName, toFounderLabel, toSlug, ventureEnsName } from "../../src/modules/identity/ids";
import { normalizeNullifier, nullifierHash, worldAction } from "../../src/modules/identity/world";

const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return (e as IdentityError).code; }
  return "OK";
};

describe("ids", () => {
  it("ventureId is server-random bytes32 lowercase hex", () => {
    const a = newVentureId(), b = newVentureId();
    expect(isVentureId(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(isVentureId(a.toUpperCase())).toBe(false);
  });
  it("slugs are sanitized and validated", () => {
    expect(toSlug("Northstar Labs")).toBe("northstar-labs");
    expect(toSlug("  NORTH__star  ")).toBe("north-star");
    expect(code(() => toSlug("ab"))).toBe("SLUG_INVALID");
    expect(toSlug("xn--abc")).toBe("xn-abc"); // punycode-style "--" collapsed by sanitizer
    expect(code(() => toFounderLabel("-"))).toBe("LABEL_INVALID");
    expect(code(() => toSlug("vestige"))).toBe("SLUG_INVALID"); // reserved
    expect(code(() => toSlug("🚀🚀🚀"))).toBe("SLUG_INVALID");
    expect(code(() => toFounderLabel("a".repeat(33)))).toBe("LABEL_INVALID");
  });
  it("ENS names are derived, not hard-coded", () => {
    expect(ventureEnsName("northstar")).toBe("northstar.vestige.eth");
    expect(founderEnsName("ada", "northstar")).toBe("ada.northstar.vestige.eth");
    expect(slugFromEnsName("NorthStar.vestige.eth")).toBe("northstar");
    expect(code(() => slugFromEnsName("ada.northstar.vestige.eth"))).toBe("NOT_FOUND");
    expect(code(() => slugFromEnsName("northstar.evil.eth"))).toBe("NOT_FOUND");
  });
});

describe("world primitives", () => {
  it("action is per-venture", () => {
    const v = newVentureId();
    expect(worldAction(v)).toBe(`vestige-founder-seat:${v}`);
  });
  it("hashSignal treats a hex wallet as raw bytes (checksum-insensitive) — IDKit 4.6.0", () => {
    const w = "0x00000000000000000000000000000000000000aA";
    expect(hashSignal(w)).toBe(hashSignal(w.toLowerCase()));
    // documented vector from idkit scripts/test-portable.mjs
    expect(hashSignal("hello")).toBe("0x001c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36dea");
  });
  it("nullifier normalisation: hex and decimal agree; rejects junk/overflow", () => {
    expect(normalizeNullifier("0xff")).toBe("255");
    expect(normalizeNullifier("255")).toBe("255");
    expect(normalizeNullifier("0x00FF")).toBe("255");
    expect(code(() => normalizeNullifier("0x" + "f".repeat(65)))).toBe("WORLD_PROOF_INVALID");
    expect(code(() => normalizeNullifier("12a"))).toBe("WORLD_PROOF_INVALID");
    expect(code(() => normalizeNullifier(undefined))).toBe("WORLD_PROOF_INVALID");
  });
  it("CR-ID-04: on-chain value is keccak256(abi.encode(uint256(nullifier))), same for hex/decimal input", () => {
    const want = keccak256(encodeAbiParameters([{ type: "uint256" }], [255n]));
    expect(nullifierHash("255")).toBe(want);
    expect(nullifierHash("0xff")).toBe(want);
    // independent fixed vector: keccak256(0x00..ff) (32-byte word)
    expect(want).toBe(keccak256(`0x${"0".repeat(62)}ff`));
    expect(nullifierHash("255")).not.toContain("ff".padStart(64, "0"));
  });
});

describe("canonical agreement JSON", () => {
  it("is key-order independent and whitespace free", () => {
    const a = canonicalize({ b: 1, a: [true, null, "x"], c: { z: 1, y: 2 } });
    const b = canonicalize({ c: { y: 2, z: 1 }, a: [true, null, "x"], b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":[true,null,"x"],"b":1,"c":{"y":2,"z":1}}');
  });
  it("one changed word changes the hash", () => {
    expect(docHash(canonicalize({ t: "equal split" }))).not.toBe(docHash(canonicalize({ t: "equal splits" })));
  });
  it("NFC-normalises strings so look-alike encodings hash equally", () => {
    expect(canonicalize({ n: "é" })).toBe(canonicalize({ n: "é" }));
  });
  it("rejects floats and non-JSON values", () => {
    expect(code(() => canonicalize({ x: 0.5 }))).toBe("AGREEMENT_INVALID");
    expect(code(() => canonicalize({ x: 10n }))).toBe("AGREEMENT_INVALID");
    expect(code(() => canonicalize({ x: new Date() }))).toBe("AGREEMENT_INVALID");
  });
});

describe("ENSv2 encodings and role design", () => {
  it("DNS-encodes names for resolver setters", () => {
    expect(dnsEncode("northstar.vestige.eth")).toBe("0x096e6f727468737461720776657374696765036574680000".slice(0, -2));
  });
  it("role constants match the ENSv2 docs tables", () => {
    expect(REG.REGISTRAR).toBe(1n);
    expect(REG.UNREGISTER).toBe(1n << 12n);
    expect(REG.SET_RESOLVER).toBe(1n << 24n);
    expect(REG.CAN_TRANSFER_ADMIN).toBe(1n << 156n);
    expect(RES.SET_TEXT).toBe(16n);
    expect(RES.UPGRADE).toBe(1n << 124n);
  });
  it("founder subnames carry NO roles (non-transferable, owner cannot escalate)", () => {
    expect(FOUNDER_ROLE_BITMAP & REG.CAN_TRANSFER_ADMIN).toBe(0n);
    expect(FOUNDER_ROLE_BITMAP).toBe(0n);
  });
  it("registrar holds only non-dangerous root roles on venture registries (emancipated)", () => {
    const dangerous = REG.SET_RESOLVER | REG.SET_SUBREGISTRY | REG.UNREGISTER | REG.CAN_TRANSFER_ADMIN | REG.UPGRADE | REG.SET_PARENT;
    expect(VENTURE_REGISTRY_REGISTRAR_ROLES & dangerous).toBe(0n);
    expect(VENTURE_REGISTRY_REGISTRAR_ROLES & (dangerous << 128n)).toBe(0n);
  });
  it("founder plan: founder is the only resolver grantee and gets an ETH addr record", () => {
    const wallet = "0x1111111111111111111111111111111111111111";
    const p = buildFounderPlan({ parentRegistry: "0x2222222222222222222222222222222222222222", expiry: 1n }, "northstar", "ada", wallet);
    expect(p.name).toBe("ada.northstar.vestige.eth");
    expect(p.resolver.data.toLowerCase()).toContain(wallet.slice(2));
    expect(p.resolver.data).not.toContain("3333333333333333333333333333333333333333");
  });
  it("venture plan sets vestige.status=workspace in the resolver initializer", () => {
    const vid = `0x${"ab".repeat(32)}` as const;
    const p = buildVenturePlan({ parentRegistry: "0x2222222222222222222222222222222222222222", expiry: 1n }, "northstar", "0x3333333333333333333333333333333333333333", vid);
    expect(p.name).toBe("northstar.vestige.eth");
    const hexOf = (s: string) => Buffer.from(s).toString("hex");
    expect(p.resolver.data).toContain(hexOf(ENS_KEYS.status));
    expect(p.resolver.data).toContain(hexOf("workspace"));
    // CR-C2-002: vestige.ventureId is written byte-for-byte in the same initializer
    expect(p.resolver.data).toContain(hexOf(ENS_KEYS.ventureId));
    expect(p.resolver.data).toContain(hexOf(vid));
    expect(() => buildVenturePlan({ parentRegistry: "0x2222222222222222222222222222222222222222", expiry: 1n }, "northstar", "0x3333333333333333333333333333333333333333", vid.toUpperCase() as `0x${string}`)).toThrow();
  });
  it("treasury record uses ENSIP-11 coin type 2147485522", () => {
    const [call] = recordCalls("northstar.vestige.eth", { treasury: "0x4444444444444444444444444444444444444444" });
    expect(WHITECHAIN_COIN_TYPE).toBe(0x80000000n | 1874n);
    expect(call).toContain(WHITECHAIN_COIN_TYPE.toString(16).padStart(64, "0"));
  });
  it("predicts proxy addresses deterministically per deployer and salt", () => {
    const base = { factory: "0xda70306c98e97ece36f997a21368e53298572991", proxyLogic: "0xC41576B4B809B99CF0fF2e5B41b4F147cd9b6BDd", salt: 1n } as const;
    const a = predictProxyAddress({ ...base, deployer: "0x1111111111111111111111111111111111111111" });
    const b = predictProxyAddress({ ...base, deployer: "0x2222222222222222222222222222222222222222" });
    expect(a).not.toBe(b);
    expect(a).toBe(predictProxyAddress({ ...base, deployer: "0x1111111111111111111111111111111111111111" }));
    void encodeAbiParameters; void keccak256; void namehash;
  });
});
