/**
 * READ-ONLY: builds the H-C1-05 parent-setup and first-venture plans against live
 * Sepolia state and dry-runs them with eth_call. No keys, no signing, no broadcast.
 * Run: VESTIGE_LIVE=1 npm run test:live -- ens-plans
 */
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createPublicClient, http, keccak256, stringToHex, type Address } from "viem";
import { sepolia } from "viem/chains";
import { ENSV2_SEPOLIA } from "../../../src/modules/identity/config";
import { permissionedRegistryAbi, verifiableFactoryAbi } from "../../../src/modules/identity/ens/encoding";
import { newVentureId } from "../../../src/modules/identity/ids";
import { buildFirstVenturePlan, buildParentSetupPlan, dryRun, planDigest } from "../../../src/modules/identity/scripts/ens-plans";

const live = process.env.VESTIGE_LIVE === "1";
const repo = new URL("../../../", import.meta.url).pathname;
const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com") });
// Public address of the Sepolia registrar keystore recorded by X (docs/agent-reports/treasury/2026-11-07-vestige-keystores.md).
const REGISTRAR = (process.env.ENS_REGISTRAR_ADDRESS ?? "0xc63F0594309F21E35b41298C71d370c0d0A9313C") as Address;

describe.skipIf(!live)("LIVE Sepolia ENS plans (read-only dry run)", () => {
  it("builds and dry-runs parent-setup + first-venture plans", async () => {
    const block = await client.getBlockNumber();
    const proxyLogic = await client.readContract({ address: ENSV2_SEPOLIA.VerifiableFactory, abi: verifiableFactoryAbi, functionName: "proxyLogic" });
    const status = await client.readContract({ address: ENSV2_SEPOLIA.ETHRegistry, abi: permissionedRegistryAbi, functionName: "getStatus", args: [BigInt(keccak256(stringToHex("vestige")))] });
    const balance = await client.getBalance({ address: REGISTRAR });
    const parent = buildParentSetupPlan({ registrar: REGISTRAR, owner: null, proxyLogic });
    const venture = buildFirstVenturePlan({
      registrar: REGISTRAR, parentRegistry: parent.predicted.parentRegistry!, proxyLogic,
      slug: process.env.FIRST_VENTURE_SLUG ?? "northstar", ventureId: (process.env.VENTURE_ID as `0x${string}`) ?? newVentureId(),
      expiry: BigInt(process.env.VESTIGE_ENS_EXPIRY ?? Math.floor(Date.now() / 1000) + 180 * 86400),
    });
    const result = {
      label: "READ_ONLY_DRY_RUN — no transaction signed or sent",
      chainId: 11155111, block: block.toString(), registrar: REGISTRAR, registrarBalanceWei: balance.toString(),
      vestigeEthStatus: ["AVAILABLE", "RESERVED", "REGISTERED"][status], proxyLogic,
      parent: { digest: planDigest(parent), plan: parent, dryRun: await dryRun(client, parent) },
      firstVenture: { digest: planDigest(venture), plan: venture, dryRun: await dryRun(client, venture) },
      note: "First-venture ventureId here is a placeholder unless VENTURE_ID is set; regenerate the plan from the real server ventureId before approval.",
    };
    writeFileSync(`${repo}docs/agent-reports/identity/evidence/ens-plans-dryrun.json`, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify({ block: result.block, vestigeEthStatus: result.vestigeEthStatus, registrarBalanceWei: result.registrarBalanceWei, parent: result.parent.dryRun, venture: result.firstVenture.dryRun }));
    // P1 is stateless and must simulate to the predicted address.
    expect(result.parent.dryRun[0]!.ok).toBe(true);
    expect(result.parent.dryRun[0]!.detail.toLowerCase()).toContain(parent.predicted.parentRegistry!.slice(2).toLowerCase());
  });
});

describe.skipIf(!live || !process.env.REVIEW_PLAN)("LIVE re-verification of a reviewed parent plan (read-only)", () => {
  it("rebuilds the reviewed plan byte-for-byte, re-simulates P1 (registrar) and P2 (owner), reads current state", async () => {
    const { readFileSync } = await import("node:fs");
    const reviewed = JSON.parse(readFileSync(process.env.REVIEW_PLAN!, "utf8"));
    const p = reviewed.plan;
    const proxyLogic = await client.readContract({ address: ENSV2_SEPOLIA.VerifiableFactory, abi: verifiableFactoryAbi, functionName: "proxyLogic" });
    const rebuilt = buildParentSetupPlan({ registrar: p.inputs.registrar, owner: p.inputs.owner, proxyLogic, createdAt: p.createdAt });
    const block = await client.getBlockNumber();
    const lh = BigInt(keccak256(stringToHex("vestige")));
    const [status, sub, ownerRoles, balance, parentCode] = await Promise.all([
      client.readContract({ address: ENSV2_SEPOLIA.ETHRegistry, abi: permissionedRegistryAbi, functionName: "getStatus", args: [lh] }),
      client.readContract({ address: ENSV2_SEPOLIA.ETHRegistry, abi: permissionedRegistryAbi, functionName: "getSubregistry", args: ["vestige"] }),
      client.readContract({ address: ENSV2_SEPOLIA.ETHRegistry, abi: permissionedRegistryAbi, functionName: "roles", args: [lh, p.inputs.owner] }).catch((e: Error) => `error:${e.name}`),
      client.getBalance({ address: p.inputs.registrar }),
      client.getCode({ address: rebuilt.predicted.parentRegistry! }),
    ]);
    const out = {
      label: "READ_ONLY_REVERIFICATION — no transaction signed or sent",
      block: block.toString(),
      reviewedDigest: reviewed.digest,
      rebuiltDigest: planDigest(rebuilt),
      identicalCalldata: rebuilt.txs.map((t, i) => t.data === p.txs[i].data && t.to.toLowerCase() === p.txs[i].to.toLowerCase()),
      state: { vestigeEthStatus: ["AVAILABLE", "RESERVED", "REGISTERED"][status], currentSubregistry: sub, ownerRolesOnVestigeEth: String(ownerRoles), registrarBalanceWei: balance.toString(), predictedParentHasCode: !!parentCode && parentCode !== "0x" },
      dryRun: await dryRun(client, rebuilt),
      plan: rebuilt,
    };
    writeFileSync(`${repo}docs/agent-reports/identity/evidence/ens-parent-reverify.json`, JSON.stringify(out, null, 2) + "\n");
    console.log(JSON.stringify({ ...out, plan: undefined }));
    expect(out.rebuiltDigest).toBe(out.reviewedDigest);
    expect(out.identicalCalldata).toEqual([true, true]);
  });
});

describe.skipIf(!live)("LIVE parent read-back (read-only)", () => {
  it("independently reads back the vestige.eth parent registry state", async () => {
    const { readParentState } = await import("../../../src/modules/identity/scripts/first-venture");
    const r = await readParentState(client, { parentRegistry: "0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73", registrar: REGISTRAR, owner: "0x1ed73ee055b7B5379CcD398748281C5A82e9A41E" });
    const out = { label: "READ_ONLY_LIVE_READBACK", ...r, parentExpiry: r.parentExpiry.toString() };
    writeFileSync(`${repo}docs/agent-reports/identity/evidence/ens-parent-readback.json`, JSON.stringify(out, null, 2) + "\n");
    console.log(JSON.stringify(out));
    expect(r.checks.find((c) => c.id === "P1-parent-has-code")!.ok).toBe(true);
  });
});
