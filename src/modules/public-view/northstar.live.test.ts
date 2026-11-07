/**
 * Opt-in LIVE read of the first real venture, northstar.vestige.eth, on Sepolia (no writes).
 * Run: VESTIGE_LIVE=1 pnpm exec vitest run src/modules/public-view/northstar.live.test.ts
 * Expected values come from C1's post-deploy readback (docs/agent-reports/identity/evidence/post-deploy-northstar.json).
 */
import { describe, expect, it } from "vitest";
import { readPublicChainReport } from "./chain-reader";
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
    expect(r.ens.treasury.status).toBe("UNKNOWN"); // workspace: no Safe published yet
    expect(deriveTreasuryVerdict(r).state).not.toBe("ACTIVE");
  }, 60_000);
});
