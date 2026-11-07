/**
 * OPERATOR STEP (read-only): ENS treasury-record plan for H approval once X's Safe exists.
 *   VESTIGE_LIVE=1 ENS_NAME=northstar.vestige.eth SAFE_ADDRESS=<safe> GUARD_ADDRESS=<guard> \
 *   npx vitest run --config tests/identity/vitest.config.ts treasury-records-plan
 * Preflight: Safe + Guard have code on Whitechain 1874; venture resolver read from the parent
 * registry; registrar multicall simulates on Sepolia. Writes evidence/treasury-records-plan-<slug>.json.
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPublicClient, getAddress, http, type Address } from "viem";
import { sepolia } from "viem/chains";
import { permissionedRegistryAbi } from "../../../src/modules/identity/ens/encoding";
import { buildTreasuryRecordPlan, dryRun, planDigest } from "../../../src/modules/identity/scripts/ens-plans";

const RUN = process.env.VESTIGE_LIVE === "1" && !!process.env.SAFE_ADDRESS && !!process.env.GUARD_ADDRESS && !!process.env.ENS_NAME;
const repo = new URL("../../../", import.meta.url).pathname;
const REGISTRAR = "0xc63F0594309F21E35b41298C71d370c0d0A9313C" as Address;
const PARENT = "0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73" as Address;

describe.skipIf(!RUN)("OPERATOR: treasury ENS record plan (read-only)", () => {
  it("builds + dry-runs the plan", async () => {
    const ensName = process.env.ENS_NAME!;
    const safe = getAddress(process.env.SAFE_ADDRESS!), guard = getAddress(process.env.GUARD_ADDRESS!);
    const wc = createPublicClient({ transport: http(process.env.WHITECHAIN_RPC_URL ?? "https://rpc.testnet.whitechain.io") });
    const [safeCode, guardCode, wcChain] = await Promise.all([wc.getCode({ address: safe }), wc.getCode({ address: guard }), wc.getChainId()]);
    expect(wcChain).toBe(1874);
    expect(safeCode && safeCode !== "0x", "Safe has no code on Whitechain").toBeTruthy();
    expect(guardCode && guardCode !== "0x", "Guard has no code on Whitechain").toBeTruthy();
    const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com") });
    const ventureResolver = await client.readContract({ address: PARENT, abi: permissionedRegistryAbi, functionName: "getResolver", args: [ensName.split(".")[0]!] });
    const plan = buildTreasuryRecordPlan({ registrar: REGISTRAR, ensName, ventureResolver, safe, guard, source: { safe: "X Whitechain deploy (code present at plan time)", guard: "X Whitechain deploy" } });
    const out = { label: "READ_ONLY_PLAN_FOR_H_APPROVAL", digest: planDigest(plan), plan, whitechain: { safeCodeBytes: (safeCode!.length - 2) / 2, guardCodeBytes: (guardCode!.length - 2) / 2 }, dryRun: await dryRun(client as never, plan) };
    writeFileSync(`${repo}docs/agent-reports/identity/evidence/treasury-records-plan-${ensName.split(".")[0]}.json`, JSON.stringify(out, null, 2) + "\n");
    console.log(JSON.stringify({ digest: out.digest, dryRun: out.dryRun }));
    expect(out.dryRun.every((r) => r.ok)).toBe(true);
  });
});
