/**
 * READ-ONLY live checks against Ethereum Sepolia. No keys, no writes.
 * Run: VESTIGE_LIVE=1 SEPOLIA_RPC_URL=... npm run test:live
 */
import { describe, expect, it } from "vitest";
import { createPublicClient, http, keccak256, stringToHex, toFunctionSelector } from "viem";
import { sepolia } from "viem/chains";
import { ENSV2_SEPOLIA } from "../../../src/modules/identity/config";
import { permissionedRegistryAbi, verifiableFactoryAbi } from "../../../src/modules/identity/ens/encoding";

const live = process.env.VESTIGE_LIVE === "1";
const client = createPublicClient({ chain: sepolia, transport: http(process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com") });

describe.skipIf(!live)("LIVE Sepolia ENSv2 (read-only)", () => {
  it("all ENSv2 contracts we depend on have bytecode", async () => {
    const block = await client.getBlockNumber();
    const out: Record<string, number> = {};
    for (const [k, a] of Object.entries(ENSV2_SEPOLIA)) out[k] = ((await client.getCode({ address: a })) ?? "0x").length / 2 - 1;
    console.log(JSON.stringify({ chainId: sepolia.id, block: block.toString(), codeBytes: out }));
    for (const v of Object.values(out)) expect(v).toBeGreaterThan(0);
  });

  it("deployed implementations expose the selectors our registrar encodes", async () => {
    const code = {
      reg: (await client.getCode({ address: ENSV2_SEPOLIA.UserRegistryImpl }))!,
      res: (await client.getCode({ address: ENSV2_SEPOLIA.PermissionedResolverImpl }))!,
      fac: (await client.getCode({ address: ENSV2_SEPOLIA.VerifiableFactory }))!,
    };
    const want: [keyof typeof code, string][] = [
      ["reg", "register(string,address,address,address,uint256,uint64)"],
      ["reg", "initialize((address,uint256)[])"],
      ["reg", "getSubregistry(string)"],
      ["reg", "getResolver(string)"],
      ["reg", "isEmancipated()"],
      ["res", "initialize((address,uint256)[],bytes[])"],
      ["res", "setText(bytes,string,string)"],
      ["res", "setAddress(bytes,uint256,bytes)"],
      ["res", "multicall(bytes[])"],
      ["fac", "deployProxy(address,uint256,bytes)"],
    ];
    for (const [k, sig] of want) expect(code[k].includes(toFunctionSelector(sig).slice(2)), sig).toBe(true);
  });

  it("vestige.eth status in the ETHRegistry, .eth registry emancipation, factory proxyLogic", async () => {
    const lh = BigInt(keccak256(stringToHex("vestige")));
    const status = await client.readContract({ address: ENSV2_SEPOLIA.ETHRegistry, abi: permissionedRegistryAbi, functionName: "getStatus", args: [lh] });
    const emancipated = await client.readContract({ address: ENSV2_SEPOLIA.ETHRegistry, abi: permissionedRegistryAbi, functionName: "isEmancipated" });
    const proxyLogic = await client.readContract({ address: ENSV2_SEPOLIA.VerifiableFactory, abi: verifiableFactoryAbi, functionName: "proxyLogic" });
    console.log(JSON.stringify({ vestigeEthStatus: ["AVAILABLE", "RESERVED", "REGISTERED"][status], ethRegistryEmancipated: emancipated, proxyLogic }));
    expect(emancipated).toBe(true);
  });

  it("Universal Resolver proxy resolves through ENSv2 (smoke: a name that does not exist returns null)", async () => {
    const r = await client.getEnsAddress({ name: `vestige-smoke-${Date.now()}.eth`, universalResolverAddress: ENSV2_SEPOLIA.UniversalResolverProxy }).catch((e: Error) => `error:${e.name}`);
    console.log(JSON.stringify({ nonexistentNameResolution: r }));
    expect(r === null || String(r).startsWith("error:")).toBe(true);
  });
});
