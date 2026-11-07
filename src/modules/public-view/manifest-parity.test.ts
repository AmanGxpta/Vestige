/**
 * Parity: C2's browser validator must accept/refuse exactly what X's validateManifest does, on a
 * northstar-shaped manifest built from the LIVE infrastructure manifest (registry/setup/singleton/
 * factory/token) plus placeholder Safe/Guard. This is a shape test only — the placeholders are not
 * deployments and nothing here is published.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateManifest as xValidate } from "../treasury/manifest.mjs";
import { validateManifest } from "./manifest";

const infra = JSON.parse(readFileSync(join(process.cwd(), "contracts/manifests/whitechain-1874/infrastructure.json"), "utf8"));
const placeholder = (n: string, abi: string) => ({
  address: `0x${n.repeat(40)}`.slice(0, 42),
  deploymentTxHash: `0x${"5".repeat(64)}`,
  deploymentBlock: 12420000,
  runtimeCodeHash: `0x${"6".repeat(64)}`,
  abiPath: `contracts/abi/${abi}.json`,
  abiSha256: "a".repeat(64),
});
function northstarShaped() {
  const safe = placeholder("1", "SafeL2");
  return {
    schemaVersion: 1,
    network: "whitechain-sepolia",
    chainId: 1874,
    deploymentBlock: safe.deploymentBlock,
    sourceCommit: infra.sourceCommit,
    approvedAt: "2026-11-07T03:00:00Z",
    explorerBaseUrl: infra.explorerBaseUrl,
    ventureId: "0xe68b1b43989080cfe7581731204a977009d67e3b3660062d24157562cc93e3ff",
    ensName: "northstar.vestige.eth",
    owners: ["0xfc2e2350DbE6cC7281C8A0412dd65cCE56519f3E", `0x${"2".repeat(40)}`],
    threshold: 2,
    setupInitializerHash: `0x${"7".repeat(64)}`,
    contracts: { safe, guard: placeholder("3", "VestigeGuard"), registry: infra.contracts.registry, singleton: infra.contracts.singleton, factory: infra.contracts.factory, setup: infra.contracts.setup, token: infra.contracts.token },
  };
}
const xOk = (m: unknown) => {
  try {
    xValidate(m as Parameters<typeof xValidate>[0]); // X throws on any violation, returns the manifest otherwise
    return true;
  } catch {
    return false;
  }
};

describe("manifest validator parity with X", () => {
  it("both accept a well-formed northstar-shaped manifest", () => {
    const m = northstarShaped();
    expect(validateManifest(m)).toEqual([]);
    expect(xOk(m)).toBe(true);
  });
  const mutations: [string, (m: ReturnType<typeof northstarShaped>) => void][] = [
    ["wrong chain", (m) => (m.chainId = 1)],
    ["threshold 1", (m) => (m.threshold = 1)],
    ["unknown top-level key", (m) => Object.assign(m, { extra: 1 })],
    ["non-canonical singleton", (m) => (m.contracts.singleton = { ...m.contracts.singleton, address: `0x${"9".repeat(40)}` })],
    ["deploymentBlock ≠ safe block", (m) => (m.deploymentBlock = 1)],
    ["bad ventureId", (m) => (m.ventureId = "0x1234")],
  ];
  for (const [name, mutate] of mutations)
    it(`both refuse: ${name}`, () => {
      const m = northstarShaped();
      mutate(m);
      expect(validateManifest(m).length).toBeGreaterThan(0);
      expect(xOk(m)).toBe(false);
    });
});
