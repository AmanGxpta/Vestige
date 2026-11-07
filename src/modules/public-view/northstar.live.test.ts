/**
 * Opt-in LIVE read of the first real venture, northstar.vestige.eth, on Sepolia (no writes).
 * Run: VESTIGE_LIVE=1 pnpm exec vitest run src/modules/public-view/northstar.live.test.ts
 * Expected values come from C1's post-deploy readback (docs/agent-reports/identity/evidence/post-deploy-northstar.json).
 *
 * After X's manifest is dropped in and the Safe is linked from ENS:
 *   VESTIGE_LIVE=1 VESTIGE_EXPECT_ACTIVE=1 pnpm exec vitest run src/modules/public-view/northstar.live.test.ts
 * asserts ACTIVE from chain reads only (Sepolia ENS + Whitechain), using public/manifests/northstar.vestige.eth.json.
 */
const MANIFEST_FILE = join(process.cwd(), "public", "manifests", "northstar.vestige.eth.json");
function fileManifest(): ManifestLoad {
  if (!existsSync(MANIFEST_FILE)) return { status: "NOT_CONFIGURED" } as ManifestLoad;
  const m = JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as DeploymentManifestV1;
  const problems = validateManifest(m);
  return (problems.length ? { status: "INVALID", problems } : { status: "LOADED", manifest: m, url: "/manifests/northstar.vestige.eth.json" }) as ManifestLoad;
}
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicChainReport } from "./chain-reader";
import { validateManifest, type DeploymentManifestV1, type ManifestLoad } from "./manifest";
import { deriveTreasuryVerdict } from "./verdict";

describe.skipIf(!process.env.VESTIGE_LIVE)("live ENS: northstar.vestige.eth", () => {
  it("resolves the venture from ENS and refuses ACTIVE without a manifest", async () => {
    const r = await readPublicChainReport("northstar.vestige.eth", {
      sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
      whitechainRpcUrl: "https://rpc.testnet.whitechain.io",
      usdtAddress: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
    });
    const t = r.ens.texts.value ?? {};
    console.log(JSON.stringify({ resolver: r.ens.resolver.value, ventureId: r.ens.ventureId.value, texts: t, treasury: r.ens.treasury?.status, manifest: r.manifest.status }));
    expect(r.ens.resolver.status).toBe("VERIFIED");
    expect(r.ens.ventureId.value).toBe("0xe68b1b43989080cfe7581731204a977009d67e3b3660062d24157562cc93e3ff");
    expect(t["vestige.status"]).toBe("workspace");
    expect(t["vestige.humans"]).toBe("1");
    expect(r.ens.treasury.status).toBe("UNKNOWN"); // workspace: no Safe linked from ENS yet
    expect(deriveTreasuryVerdict(r).state).not.toBe("ACTIVE");
  }, 60_000);
});

describe.skipIf(!process.env.VESTIGE_LIVE || !process.env.VESTIGE_EXPECT_ACTIVE)("live chain-only ACTIVE: northstar.vestige.eth", () => {
  it("is ACTIVE from Sepolia ENS + Whitechain reads against the dropped-in reviewed manifest", async () => {
    const r = await readPublicChainReport("northstar.vestige.eth", {
      sepoliaRpcUrl: process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
      whitechainRpcUrl: process.env.WHITECHAIN_RPC_URL ?? "https://rpc.testnet.whitechain.io",
      usdtAddress: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
      manifest: fileManifest(),
    });
    const v = deriveTreasuryVerdict(r);
    console.log(JSON.stringify({ state: v.state, safe: r.ens.treasury.value, block: r.whitechain?.blockNumber.value, checks: v.checks.map((c) => `${c.id}:${c.status}`) }));
    expect(r.manifest.status).toBe("LOADED");
    expect(v.state).toBe("ACTIVE");
  }, 120_000);
});
