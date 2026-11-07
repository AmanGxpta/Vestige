/** H-C1-05 plan builders: deterministic, digest-bound, broadcast refuses without H approval. */
import { describe, expect, it } from "vitest";
import { decodeFunctionData } from "viem";
import { ENSV2_SEPOLIA } from "../../src/modules/identity/config";
import { permissionedRegistryAbi, REG, verifiableFactoryAbi } from "../../src/modules/identity/ens/encoding";
import { broadcastApproved, buildFirstVenturePlan, buildParentSetupPlan, planDigest } from "../../src/modules/identity/scripts/ens-plans";

const registrar = "0xc63F0594309F21E35b41298C71d370c0d0A9313C" as const;
const proxyLogic = "0xC41576B4B809B99CF0fF2e5B41b4F147cd9b6BDd" as const;
const at = "2026-11-07T00:00:00.000Z";

describe("ENS setup plans (no broadcast)", () => {
  it("parent setup: deploy with REGISTRAR|RENEW only, then owner points the subregistry at the predicted proxy", () => {
    const p = buildParentSetupPlan({ registrar, owner: null, proxyLogic, createdAt: at });
    expect(p.txs.map((t) => t.signer)).toEqual(["REGISTRAR", "VESTIGE_ETH_OWNER"]);
    const d = decodeFunctionData({ abi: verifiableFactoryAbi, data: p.txs[0]!.data });
    expect(String(d.args?.[0]).toLowerCase()).toBe(ENSV2_SEPOLIA.UserRegistryImpl);
    const s = decodeFunctionData({ abi: permissionedRegistryAbi, data: p.txs[1]!.data });
    expect(s.functionName).toBe("setSubregistry");
    expect(s.args[1]).toBe(p.predicted.parentRegistry);
    expect(p.inputs.registrarRootRoles).toBe((REG.REGISTRAR | REG.RENEW).toString());
    expect(planDigest(p)).toBe(planDigest(buildParentSetupPlan({ registrar, owner: null, proxyLogic, createdAt: at })));
  });

  it("first venture: registry + resolver (with ventureId) + register; founders roleBitmap 0", () => {
    const parent = buildParentSetupPlan({ registrar, owner: null, proxyLogic, createdAt: at });
    const vid = `0x${"12".repeat(32)}` as const;
    const p = buildFirstVenturePlan({ registrar, parentRegistry: parent.predicted.parentRegistry!, proxyLogic, slug: "northstar", ventureId: vid, expiry: 1_800_000_000n, founders: [{ label: "ada", wallet: "0x00000000000000000000000000000000000000a1" }], createdAt: at });
    expect(p.txs.map((t) => t.id)).toEqual(["V1-deploy-venture-registry", "V2-deploy-venture-resolver", "V3-register-venture-name", "F-ada-deploy-resolver", "F-ada-register"]);
    expect(p.txs[1]!.data).toContain(Buffer.from(vid).toString("hex"));
    const reg = decodeFunctionData({ abi: permissionedRegistryAbi, data: p.txs[2]!.data });
    expect(reg.args.slice(0, 4)).toEqual(["northstar", registrar, p.predicted.ventureRegistry, p.predicted.ventureResolver]);
    const f = decodeFunctionData({ abi: permissionedRegistryAbi, data: p.txs[4]!.data });
    expect(f.args[4]).toBe(0n);
    expect(p.txs[4]!.to).toBe(p.predicted.ventureRegistry);
  });

  it("broadcastApproved refuses without the env switch or with a changed plan", async () => {
    const p = buildParentSetupPlan({ registrar, owner: null, proxyLogic, createdAt: at });
    const fake = {} as never;
    await expect(broadcastApproved({ plan: p, approvedDigest: planDigest(p), wallet: fake, client: fake, env: {} })).rejects.toThrow(/VESTIGE_ENS_BROADCAST/);
    const changed = { ...p, createdAt: "2026-11-08T00:00:00.000Z" };
    await expect(broadcastApproved({ plan: changed, approvedDigest: planDigest(p), wallet: fake, client: fake, env: { VESTIGE_ENS_BROADCAST: "I_HAVE_H_APPROVAL" } })).rejects.toThrow(/digest/);
  });
});

describe("treasury record plan", () => {
  it("one registrar multicall on the venture resolver: ENSIP-11 addr(2147485522)=Safe + vestige.guard", async () => {
    const { buildTreasuryRecordPlan } = await import("../../src/modules/identity/scripts/ens-plans");
    const { permissionedResolverAbi } = await import("../../src/modules/identity/ens/encoding");
    const safe = "0x1111111111111111111111111111111111111111", guard = "0x2222222222222222222222222222222222222222";
    const p = buildTreasuryRecordPlan({ registrar, ensName: "northstar.vestige.eth", ventureResolver: "0x17cb013B4E8B3d47A7A1F3A8D08A5a4a04189C08", safe, guard, createdAt: at });
    expect(p.kind).toBe("treasury-records");
    expect(p.txs).toHaveLength(1);
    expect(p.txs[0]!.to).toBe("0x17cb013B4E8B3d47A7A1F3A8D08A5a4a04189C08");
    const d = decodeFunctionData({ abi: permissionedResolverAbi, data: p.txs[0]!.data });
    expect(d.functionName).toBe("multicall");
    const inner = (d.args![0] as `0x${string}`[]).map((c) => decodeFunctionData({ abi: permissionedResolverAbi, data: c }));
    expect(inner.map((x) => x.functionName)).toEqual(["setText", "setAddress"]);
    expect(inner[1]!.args![1]).toBe(2147485522n);
    expect((inner[1]!.args![2] as string).toLowerCase()).toBe(safe);
    expect(inner[0]!.args!.slice(1)).toEqual(["vestige.guard", guard]);
    expect(planDigest(p)).toBe(planDigest(buildTreasuryRecordPlan({ registrar, ensName: "northstar.vestige.eth", ventureResolver: "0x17cb013B4E8B3d47A7A1F3A8D08A5a4a04189C08", safe, guard, createdAt: at })));
  });
});
