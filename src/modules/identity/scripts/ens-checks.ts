/**
 * Post-deployment ENS checks for a venture — READ-ONLY (eth_call / views only, no keys).
 * Run after the approved first-venture plan lands and before claiming CHAIN_VERIFIED.
 *
 * Positive read-backs (Universal Resolver, what C2 and the public use):
 *   vestige.ventureId == server ventureId, vestige.status == workspace, vestige.humans == n,
 *   addr(founder subname) == founder wallet.
 * Negative tests (each must REVERT when simulated from the named sender):
 *   - founder transfers their own subname (safeTransferFrom / unsafeTransfer)  → TransferDisallowed
 *   - registrar writes a text record on a founder's resolver                     → unauthorized
 *   - founder writes a text record on the venture's resolver                     → unauthorized
 * Structural:
 *   - venture registry isEmancipated() == true
 *   - registrar holds none of the dangerous root roles on the venture registry
 * Sanity (must SUCCEED): founder writing their own resolver (eth_call only, nothing sent).
 */
import { BaseError, decodeErrorResult, encodeFunctionData, keccak256, parseAbi, stringToHex, zeroAddress, type Address, type Hex, type PublicClient } from "viem";
import { ENS_KEYS, ENSV2_SEPOLIA } from "../config";
import { encodeSetText, permissionedRegistryAbi } from "../ens/encoding";
import { DANGEROUS_ROOT_ROLES, type Check } from "./first-venture";

const labelId = (label: string) => BigInt(keccak256(stringToHex(label)));

/** Errors we expect; anything else is reported by raw selector. */
const KNOWN_ERRORS = parseAbi([
  "error TransferDisallowed(uint256 tokenId, address from)",
  "error EACUnauthorizedAccountRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error EACCannotGrantRoles(uint256 resource, uint256 roleBitmap, address account)",
  "error ERC1155MissingApprovalForAll(address operator, address owner)",
]);

async function simulate(client: PublicClient, from: Address, to: Address, data: Hex): Promise<{ reverted: boolean; error?: string; detail: string }> {
  try {
    await client.call({ account: from, to, data });
    return { reverted: false, detail: "eth_call succeeded" };
  } catch (e) {
    let raw: Hex | undefined;
    if (e instanceof BaseError) {
      const hit = e.walk((x) => typeof (x as { data?: unknown }).data === "string" && /^0x[0-9a-f]{8}/i.test((x as { data: string }).data));
      raw = (hit as { data?: Hex } | null)?.data;
    }
    if (!raw) return { reverted: true, error: "unknown", detail: "reverted (no revert data)" };
    try {
      const d = decodeErrorResult({ abi: KNOWN_ERRORS, data: raw });
      return { reverted: true, error: d.errorName, detail: `reverted: ${d.errorName}` };
    } catch {
      return { reverted: true, error: raw.slice(0, 10), detail: `reverted: selector ${raw.slice(0, 10)}` };
    }
  }
}

export async function postDeploymentChecks(client: PublicClient, a: {
  ensName: string; // <slug>.vestige.eth
  ventureId: Hex;
  parentRegistry: Address;
  registrar: Address;
  founders: { label: string; wallet: Address }[];
  universalResolver?: Address;
}): Promise<{ block: string; ok: boolean; checks: Check[] }> {
  const ur = a.universalResolver ?? ENSV2_SEPOLIA.UniversalResolverProxy;
  const slug = a.ensName.split(".")[0]!;
  const checks: Check[] = [];
  const block = await client.getBlockNumber();
  const text = (name: string, key: string) => client.getEnsText({ name, key, universalResolverAddress: ur }).catch(() => null);

  const [vid, status, humans] = await Promise.all([text(a.ensName, ENS_KEYS.ventureId), text(a.ensName, ENS_KEYS.status), text(a.ensName, ENS_KEYS.humans)]);
  checks.push({ id: "readback-ventureId", ok: vid === a.ventureId, detail: `vestige.ventureId=${vid}` });
  checks.push({ id: "readback-status-workspace", ok: status === "workspace", detail: `vestige.status=${status}` });
  checks.push({ id: "readback-humans", ok: humans === String(a.founders.length), detail: `vestige.humans=${humans} expected=${a.founders.length}` });

  const ventureRegistry = await client.readContract({ address: a.parentRegistry, abi: permissionedRegistryAbi, functionName: "getSubregistry", args: [slug] });
  const ventureResolver = await client.readContract({ address: a.parentRegistry, abi: permissionedRegistryAbi, functionName: "getResolver", args: [slug] });
  checks.push({ id: "venture-registry-linked", ok: ventureRegistry !== zeroAddress, detail: `subregistry=${ventureRegistry}` });
  if (ventureRegistry === zeroAddress) return { block: block.toString(), ok: false, checks };

  const emancipated = await client.readContract({ address: ventureRegistry, abi: permissionedRegistryAbi, functionName: "isEmancipated" });
  checks.push({ id: "venture-registry-emancipated", ok: emancipated === true, detail: `isEmancipated=${emancipated}` });
  for (const [name, role] of Object.entries(DANGEROUS_ROOT_ROLES)) {
    const held = await client.readContract({ address: ventureRegistry, abi: permissionedRegistryAbi, functionName: "hasRootRoles", args: [role, a.registrar] });
    checks.push({ id: `venture-registrar-lacks-${name}`, ok: !held, detail: held ? "HELD (unexpected)" : "not held" });
  }

  const outsider = "0x000000000000000000000000000000000000dEaD" as Address;
  for (const f of a.founders) {
    const name = `${f.label}.${a.ensName}`;
    const addr = await client.getEnsAddress({ name, universalResolverAddress: ur }).catch(() => null);
    checks.push({ id: `readback-addr:${name}`, ok: addr?.toLowerCase() === f.wallet.toLowerCase(), detail: `addr=${addr}` });
    const tokenId = await client.readContract({ address: ventureRegistry, abi: permissionedRegistryAbi, functionName: "getTokenId", args: [labelId(f.label)] });
    const owner = await client.readContract({ address: ventureRegistry, abi: permissionedRegistryAbi, functionName: "ownerOf", args: [tokenId] }).catch(() => zeroAddress);
    checks.push({ id: `owner:${name}`, ok: owner.toLowerCase() === f.wallet.toLowerCase(), detail: `ownerOf=${owner}` });
    const t1 = await simulate(client, f.wallet, ventureRegistry, encodeFunctionData({ abi: permissionedRegistryAbi, functionName: "safeTransferFrom", args: [f.wallet, outsider, tokenId, 1n, "0x"] }));
    checks.push({ id: `negative-safeTransferFrom:${name}`, ok: t1.reverted && t1.error === "TransferDisallowed", detail: t1.detail });
    const t2 = await simulate(client, f.wallet, ventureRegistry, encodeFunctionData({ abi: permissionedRegistryAbi, functionName: "unsafeTransfer", args: [outsider, tokenId, "0x"] }));
    checks.push({ id: `negative-unsafeTransfer:${name}`, ok: t2.reverted && t2.error === "TransferDisallowed", detail: t2.detail });
    const founderResolver = await client.readContract({ address: ventureRegistry, abi: permissionedRegistryAbi, functionName: "getResolver", args: [f.label] });
    const reg = await simulate(client, a.registrar, founderResolver, encodeSetText(name, "vestige.injected", "x"));
    checks.push({ id: `negative-registrar-writes-founder-resolver:${name}`, ok: reg.reverted, detail: reg.detail });
    const own = await simulate(client, f.wallet, founderResolver, encodeSetText(name, "url", "https://example.invalid"));
    checks.push({ id: `sanity-founder-writes-own-resolver:${name}`, ok: !own.reverted, detail: own.detail });
    const ven = await simulate(client, f.wallet, ventureResolver, encodeSetText(a.ensName, ENS_KEYS.humans, "99"));
    checks.push({ id: `negative-founder-writes-venture-resolver:${f.label}`, ok: ven.reverted, detail: ven.detail });
  }
  return { block: block.toString(), ok: checks.every((c) => c.ok), checks };
}
