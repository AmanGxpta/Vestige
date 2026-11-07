/** ENS-first reader behaviour with stubbed Sepolia clients (no network). */
import { describe, expect, it } from "vitest";
import type { PublicClient } from "viem";
import { readPublicChainReport } from "./chain-reader";
import { deriveTreasuryVerdict } from "./verdict";

const PARENT_RESOLVER = "0xc9A72AF3eD34b6078e1b7b86200A696bEFCAdb27"; // observed vestige.eth resolver on Sepolia, 2026-11-07
const cfg = { sepoliaRpcUrl: "unused", whitechainRpcUrl: "unused", usdtAddress: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7" as const };

describe("ENS wildcard: unregistered subname under a registered parent", () => {
  it("parent's resolver + no own records → FAILED 'not registered', Whitechain not read, verdict UNRESOLVED", async () => {
    const sep = {
      getEnsResolver: async () => PARENT_RESOLVER, // Universal Resolver walks up to vestige.eth
      getEnsText: async () => null,
      getEnsAddress: async () => null,
    } as unknown as PublicClient;
    const r = await readPublicChainReport("nobody.vestige.eth", cfg, { sepolia: sep });
    expect(r.ens.resolver.status).toBe("FAILED");
    expect(r.ens.resolver.note).toMatch(/not registered/);
    expect(r.whitechain).toBeUndefined();
    expect(deriveTreasuryVerdict(r).state).toBe("UNRESOLVED");
  });

  it("a subname with its own records keeps its resolver even if shared with the parent", async () => {
    const VID = `0x${"ab".repeat(32)}`;
    const sep = {
      getEnsResolver: async () => PARENT_RESOLVER,
      getEnsText: async ({ key }: { key: string }) => (key === "vestige.ventureId" ? VID : key === "vestige.status" ? "workspace" : null),
      getEnsAddress: async () => null,
    } as unknown as PublicClient;
    const r = await readPublicChainReport("northstar.vestige.eth", cfg, { sepolia: sep });
    expect(r.ens.resolver.status).toBe("VERIFIED");
    expect(r.ens.ventureId.value).toBe(VID);
    // workspace + no Safe linked → "not linked yet" (UNKNOWN), never VERIFIED, never ACTIVE
    expect(r.ens.treasury.status).toBe("UNKNOWN");
    expect(r.ens.treasury.note).toMatch(/No treasury linked from this name yet/);
    expect(deriveTreasuryVerdict(r).state).toBe("UNRESOLVED");
  });
});
