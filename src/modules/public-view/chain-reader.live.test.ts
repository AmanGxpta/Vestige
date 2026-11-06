/**
 * Opt-in live read test against the REAL Whitechain Sepolia RPC (no writes).
 * Run: VESTIGE_LIVE=1 pnpm test
 *
 * ENS is stubbed to "resolve" to the canonical Safe v1.4.1 L2 singleton, which is
 * a real Safe contract on 1874 but not a configured treasury (threshold 0, no
 * owners). It proves the Whitechain reads execute against the live chain and
 * that the verdict refuses to call it ACTIVE.
 */
import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { readPublicChainReport } from "./chain-reader";
import { deriveTreasuryVerdict } from "./verdict";

const SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const stubSepolia = {
  getEnsResolver: async () => "0x000000000000000000000000000000000000dEaD",
  getEnsText: async () => null,
  getEnsAddress: async () => SAFE_SINGLETON,
} as unknown as PublicClient;

describe.skipIf(!process.env.VESTIGE_LIVE)("live Whitechain reads", () => {
  it("reads a real Safe on chain 1874 and does not mark it ACTIVE", async () => {
    const r = await readPublicChainReport(
      "stub.vestige.eth",
      { sepoliaRpcUrl: "unused", whitechainRpcUrl: "https://rpc.testnet.whitechain.io", usdtAddress: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" },
      { sepolia: stubSepolia },
    );
    const w = r.whitechain!;
    console.log(JSON.stringify({ block: w.blockNumber.value, code: w.safeCode.status, version: w.version.value, owners: w.owners.value, threshold: w.threshold.value, guard: w.guard.status, binding: w.binding.status, safeCodeHash: w.codeHashes.value?.safe, modules: w.modules.status, token: w.token.value, seats: w.seats.status, transfers: w.transfers.status, scanFrom: w.scanFrom, ensVentureId: r.ens.ventureId.status, manifest: r.manifest.status }, null, 0));
    expect(w.blockNumber.status).toBe("VERIFIED");
    expect(w.safeCode.status).toBe("VERIFIED");
    expect(w.version.value).toBe("1.4.1");
    expect(w.token.value?.symbol).toBe("USDT");
    expect(w.token.value?.decimals).toBe(6);
    expect(w.transfers.status).toBe("VERIFIED"); // regression: RPC caps eth_getLogs at 10k blocks
    expect(r.ens.ventureId.status).toBe("FAILED"); // stub publishes no vestige.ventureId
    expect(w.binding.status).not.toBe("VERIFIED"); // singleton has no Guard
    expect(w.codeHashes.value?.safe).toMatch(/^0x[0-9a-f]{64}$/);
    const v = deriveTreasuryVerdict(r);
    expect(v.state).not.toBe("ACTIVE");
    console.log(JSON.stringify({ verdict: v.state, checks: v.checks.map((c) => `${c.id}:${c.status}`) }));
  }, 60_000);
});
