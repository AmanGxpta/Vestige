/** Approval-gated ENS + first-venture plan from the REAL server DB (fake read-only chain client). */
import { describe, expect, it } from "vitest";
import { decodeFunctionData, type Address } from "viem";
import { permissionedRegistryAbi } from "../../src/modules/identity/ens/encoding";
import { ApprovalGatedEnsPort } from "../../src/modules/identity/ports";
import { VentureService } from "../../src/modules/identity/ventures";
import { prepareFirstVenturePlan, readParentState } from "../../src/modules/identity/scripts/first-venture";
import { reconcileIdentity } from "../../src/modules/identity/scripts/reconcile";
import { FakeHuman, lower, makeHarness, newWallet } from "./helpers";

const REGISTRAR = "0xc63F0594309F21E35b41298C71d370c0d0A9313C" as Address;
const PARENT = "0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73" as Address;
const proxyLogic = "0xC41576B4B809B99CF0fF2e5B41b4F147cd9b6BDd" as Address;
const PARENT_EXPIRY = 1825560312n;

/** Minimal read-only client double: parent state is configurable; eth_call always "ok". */
function fakeClient(o: { subregistry?: Address; parentCode?: boolean; registrarRoles?: boolean; dangerous?: boolean } = {}) {
  return {
    getBlockNumber: async () => 12079721n,
    getBalance: async () => 3n * 10n ** 17n,
    getCode: async () => (o.parentCode === false ? "0x" : "0x6080"),
    call: async () => ({ data: "0x" }),
    readContract: async ({ functionName, args }: { functionName: string; args: unknown[] }) => {
      switch (functionName) {
        case "getStatus": return 2; // REGISTERED (parent name); overridden per test for venture labels
        case "getSubregistry": return o.subregistry ?? PARENT;
        case "getExpiry": return PARENT_EXPIRY;
        case "hasRootRoles": return (args[0] as bigint) === 65537n ? o.registrarRoles !== false : (o.dangerous ?? false);
        default: throw new Error(`unexpected ${functionName}`);
      }
    },
  } as never;
}

async function seededVenture() {
  const h = makeHarness();
  const gated = new VentureService({ db: h.db, world: h.world, attester: h.attester, ens: new ApprovalGatedEnsPort(), clock: h.clock, fetchImpl: h.portal.fetch, defer: (t) => { h.tasks.push(t()); } });
  gated.checks = { ventureName: async () => false, founderName: async () => false, humans: async () => false };
  const services = { ...h, ventures: gated };
  const A = newWallet(), B = newWallet(), C = newWallet();
  const a = lower(A.address), b = lower(B.address);
  const vid = gated.create(a, { name: "Northstar Labs", founderLabel: "ada" }).ventureId;
  gated.join(b, vid, { inviteToken: gated.createInvite(a, vid).inviteToken, founderLabel: "bob" });
  await gated.verifyWorld(a, vid, { idkitResult: new FakeHuman().prove(gated.worldRequest(a, vid)) });
  await h.flush();
  return { h, services, gated, vid, a, b, C };
}

describe("approval-gated ENS port", () => {
  it("API never broadcasts: steps stay PENDING (not FAILED) and are promoted only by read-back", async () => {
    const { h, services, gated, vid, a } = await seededVenture();
    const v = gated.view(vid);
    expect(v.ensStatus).toBe("PENDING");
    expect(v.seats.find((s) => s.wallet === a)!.subnameStatus).toBe("PENDING");
    const ev = h.db.all<{ status: string; detail: string | null }>("SELECT status, detail FROM identity_events WHERE venture_id = ? AND kind LIKE 'ens_%'", vid);
    expect(ev.every((e) => e.status === "PENDING" && e.detail?.includes("awaiting H-approved"))).toBe(true);
    // after the approved plan lands, read-back promotes it (no write from the API)
    gated.checks.ventureName = async (_n, id) => id === vid;
    gated.checks.founderName = async () => true;
    const rep = await reconcileIdentity(services as never);
    expect(rep.ensVerifiedByReadback).toBe(2);
    expect(gated.view(vid).ensStatus).toBe("VERIFIED");
  });
});

describe("prepareFirstVenturePlan", () => {
  it("refuses until the parent read-back passes (P2 missing → no plan)", async () => {
    const { services, vid } = await seededVenture();
    const zero = "0x0000000000000000000000000000000000000000" as Address;
    await expect(prepareFirstVenturePlan({ services: services as never, client: fakeClient({ subregistry: zero }), ventureId: vid, registrar: REGISTRAR, parentRegistry: PARENT, expiry: PARENT_EXPIRY, proxyLogic }))
      .rejects.toThrow(/P2-subregistry-points-to-parent|parent-readback/);
    await expect(prepareFirstVenturePlan({ services: services as never, client: fakeClient({ dangerous: true }), ventureId: vid, registrar: REGISTRAR, parentRegistry: PARENT, expiry: PARENT_EXPIRY, proxyLogic }))
      .rejects.toThrow(/parent-readback/);
    await expect(prepareFirstVenturePlan({ services: services as never, client: fakeClient(), ventureId: vid, registrar: REGISTRAR, parentRegistry: PARENT, expiry: PARENT_EXPIRY + 1n, proxyLogic }))
      .rejects.toThrow(/expiry-within-parent/);
  });

  it("refuses a ventureId the server did not create", async () => {
    const { services } = await seededVenture();
    await expect(prepareFirstVenturePlan({ services: services as never, client: fakeClient(), ventureId: `0x${"ab".repeat(32)}`, registrar: REGISTRAR, parentRegistry: PARENT, expiry: PARENT_EXPIRY, proxyLogic }))
      .rejects.toThrow(/not found/i);
  });

  it("builds a digest-bound plan from server state: real ventureId, verified founders only, humans count, staging disclosure", async () => {
    const { services, vid, a, b } = await seededVenture();
    const client = fakeClient();
    // label-availability: parent getStatus for the venture label must be AVAILABLE
    (client as any).readContract = (orig => async (x: any) => (x.functionName === "getStatus" && x.address === PARENT ? 0 : orig(x)))((client as any).readContract);
    const prep = await prepareFirstVenturePlan({ services: services as never, client, ventureId: vid, registrar: REGISTRAR, parentRegistry: PARENT, expiry: PARENT_EXPIRY, proxyLogic, createdAt: "2026-11-07T00:00:00.000Z" });
    expect(prep.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(prep.plan.inputs.ventureId).toBe(vid);
    expect((prep.plan.inputs as any).founders).toEqual([{ label: "ada", wallet: a, worldEnvironment: "staging" }]); // b not verified → excluded
    expect(JSON.stringify(prep.plan)).not.toContain(b.slice(2));
    expect((prep.plan.inputs as any).initial).toEqual({ humans: 1 });
    expect(JSON.stringify((prep.plan.inputs as any).source)).toContain("TESTED_IN_SIMULATOR");
    expect(prep.plan.txs[1]!.data).toContain(Buffer.from(vid).toString("hex"));
    const reg = decodeFunctionData({ abi: permissionedRegistryAbi, data: prep.plan.txs[2]!.data });
    expect(reg.args?.[0]).toBe("northstar-labs");
    // deterministic for the approver
    const again = await prepareFirstVenturePlan({ services: services as never, client, ventureId: vid, registrar: REGISTRAR, parentRegistry: PARENT, expiry: PARENT_EXPIRY, proxyLogic, createdAt: "2026-11-07T00:00:00.000Z" });
    expect(again.digest).toBe(prep.digest);
  });

  it("readParentState reports each failed parent check by id", async () => {
    const r = await readParentState(fakeClient({ parentCode: false, subregistry: "0x0000000000000000000000000000000000000000" }), { parentRegistry: PARENT, registrar: REGISTRAR });
    expect(r.ok).toBe(false);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.id).sort()).toEqual(["P1-parent-has-code", "P2-subregistry-points-to-parent"]);
  });
});
