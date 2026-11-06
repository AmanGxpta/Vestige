/**
 * ENSv2 registrar (Sepolia) and resolver reader.
 *
 * Topology (PROPOSED CR-ID-01, see agent report):
 *   vestige.eth                      — owned by H's registrar EOA; subregistry = VESTIGE_PARENT_REGISTRY (a UserRegistry)
 *   <slug>.vestige.eth               — entry in the parent registry; own UserRegistry + own PermissionedResolver
 *   <label>.<slug>.vestige.eth       — entry in the venture registry, owner = founder wallet,
 *                                      roleBitmap 0 (non-transferable), own PermissionedResolver writable only by founder
 *
 * The registrar never holds dangerous root roles on venture registries, so they
 * are emancipated and vestige cannot revoke/transfer founder names.
 * Disclosed limit: the operator of the vestige.eth parent registry can still
 * re-point or unregister the *venture* name until handover.
 */
import {
  encodeFunctionData,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  zeroAddress,
} from "viem";
import { ENS_KEYS, ENSV2_SEPOLIA, VENTURE_STATUS_RECORD, VESTIGE_PARENT_NAME, WHITECHAIN_COIN_TYPE } from "../config";
import { founderEnsName, isVentureId, ventureEnsName, type Bytes32 } from "../ids";
import type { ChainConfirmation, EnsPort, EnsVentureRecords } from "../ports";
import {
  encodeResolverInit,
  encodeSetAddress,
  encodeSetText,
  encodeUserRegistryInit,
  FOUNDER_RESOLVER_FOUNDER_ROLES,
  FOUNDER_ROLE_BITMAP,
  permissionedRegistryAbi,
  permissionedResolverAbi,
  REG,
  resolverSaltForName,
  VENTURE_REGISTRY_REGISTRAR_ROLES,
  VENTURE_RESOLVER_REGISTRAR_ROLES,
  ventureRegistrySalt,
  verifiableFactoryAbi,
} from "./encoding";

export interface EnsRegistrarConfig {
  parentName?: string; // default vestige.eth
  parentRegistry: Address; // UserRegistry attached to vestige.eth (H deploys, registrar holds ROLE_REGISTRAR)
  expiry: bigint; // uint64 seconds; <= parent expiry
  factory?: Address;
  userRegistryImpl?: Address;
  resolverImpl?: Address;
  universalResolver?: Address;
}

/** Venture token roles: transfer admin only, reserved for the governance handover stretch. */
export const VENTURE_TOKEN_ROLES = REG.CAN_TRANSFER_ADMIN;

export function buildVenturePlan(cfg: EnsRegistrarConfig, slug: string, registrar: Address, ventureId: Bytes32) {
  const name = ventureEnsName(slug, cfg.parentName ?? VESTIGE_PARENT_NAME);
  if (!isVentureId(ventureId)) throw new Error("ventureId must be the server's lowercase bytes32");
  const registryInit = encodeUserRegistryInit([{ account: registrar, roleBitmap: VENTURE_REGISTRY_REGISTRAR_ROLES }]);
  const resolverInit = encodeResolverInit(
    [{ account: registrar, roleBitmap: VENTURE_RESOLVER_REGISTRAR_ROLES }],
    [
      encodeSetText(name, ENS_KEYS.status, VENTURE_STATUS_RECORD),
      encodeSetText(name, ENS_KEYS.ventureId, ventureId),
      encodeSetText(name, ENS_KEYS.humans, "0"),
    ],
  );
  return {
    name,
    registry: { implementation: cfg.userRegistryImpl ?? ENSV2_SEPOLIA.UserRegistryImpl, salt: ventureRegistrySalt(name), data: registryInit },
    resolver: { implementation: cfg.resolverImpl ?? ENSV2_SEPOLIA.PermissionedResolverImpl, salt: resolverSaltForName(name), data: resolverInit },
  };
}

export function buildFounderPlan(cfg: EnsRegistrarConfig, slug: string, label: string, wallet: Address) {
  const name = founderEnsName(label, slug, cfg.parentName ?? VESTIGE_PARENT_NAME);
  // Founder is the ONLY grantee: no admin roles, no LINK, no UPGRADE → nobody else can write or upgrade it.
  const resolverInit = encodeResolverInit(
    [{ account: wallet, roleBitmap: FOUNDER_RESOLVER_FOUNDER_ROLES }],
    [encodeSetAddress(name, 60n, wallet)],
  );
  return {
    name,
    resolver: { implementation: cfg.resolverImpl ?? ENSV2_SEPOLIA.PermissionedResolverImpl, salt: resolverSaltForName(name), data: resolverInit },
    roleBitmap: FOUNDER_ROLE_BITMAP,
  };
}

export function recordCalls(name: string, r: EnsVentureRecords): Hex[] {
  const calls: Hex[] = [];
  if (r.status) calls.push(encodeSetText(name, ENS_KEYS.status, r.status));
  if (r.ventureId) {
    if (!isVentureId(r.ventureId)) throw new Error("ventureId must be the server's lowercase bytes32");
    calls.push(encodeSetText(name, ENS_KEYS.ventureId, r.ventureId));
  }
  if (r.humans !== undefined) calls.push(encodeSetText(name, ENS_KEYS.humans, String(r.humans)));
  if (r.agreementHash) calls.push(encodeSetText(name, ENS_KEYS.agreement, r.agreementHash));
  if (r.guard) calls.push(encodeSetText(name, ENS_KEYS.guard, r.guard));
  if (r.treasury) calls.push(encodeSetAddress(name, WHITECHAIN_COIN_TYPE, r.treasury));
  return calls;
}

export class ViemEnsRegistrar implements EnsPort {
  constructor(
    private cfg: EnsRegistrarConfig,
    private wallet: WalletClient,
    private client: PublicClient,
  ) {}

  private get registrar(): Address {
    const a = this.wallet.account?.address;
    if (!a) throw new Error("registrar wallet has no account");
    return a;
  }

  private async send(to: Address, data: Hex): Promise<Hex> {
    // Simulate first so a revert never costs gas and surfaces a readable error.
    await this.client.call({ account: this.registrar, to, data });
    return this.wallet.sendTransaction({ account: this.wallet.account!, chain: this.wallet.chain, to, data });
  }

  private async deploy(p: { implementation: Address; salt: bigint; data: Hex }): Promise<{ hash: Hex; proxy: Address }> {
    const factory = this.cfg.factory ?? ENSV2_SEPOLIA.VerifiableFactory;
    const hash = await this.send(factory, encodeFunctionData({ abi: verifiableFactoryAbi, functionName: "deployProxy", args: [p.implementation, p.salt, p.data] }));
    const receipt = await this.client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`deployProxy reverted: ${hash}`);
    const [log] = parseEventLogs({ abi: verifiableFactoryAbi, eventName: "ProxyDeployed", logs: receipt.logs });
    if (!log) throw new Error(`no ProxyDeployed event: ${hash}`);
    return { hash, proxy: log.args.proxyAddress };
  }

  async registerVenture({ slug, ventureId }: { slug: string; ventureId: Bytes32 }) {
    const plan = buildVenturePlan(this.cfg, slug, this.registrar, ventureId);
    const reg = await this.deploy(plan.registry);
    const res = await this.deploy(plan.resolver);
    const label = plan.name.split(".")[0]!;
    const h = await this.send(
      this.cfg.parentRegistry,
      encodeFunctionData({ abi: permissionedRegistryAbi, functionName: "register", args: [label, this.registrar, reg.proxy, res.proxy, VENTURE_TOKEN_ROLES, this.cfg.expiry] }),
    );
    return { txHashes: [reg.hash, res.hash, h] };
  }

  async registerFounder({ slug, label, wallet }: { slug: string; label: string; wallet: Address }) {
    const ventureName = ventureEnsName(slug, this.cfg.parentName ?? VESTIGE_PARENT_NAME);
    const ventureRegistry = await this.client.readContract({
      address: this.cfg.parentRegistry, abi: permissionedRegistryAbi, functionName: "getSubregistry", args: [ventureName.split(".")[0]!],
    });
    if (ventureRegistry === zeroAddress) throw new Error(`venture registry missing for ${ventureName}`);
    const plan = buildFounderPlan(this.cfg, slug, label, wallet);
    const res = await this.deploy(plan.resolver);
    const h = await this.send(
      ventureRegistry,
      encodeFunctionData({ abi: permissionedRegistryAbi, functionName: "register", args: [label, wallet, zeroAddress, res.proxy, plan.roleBitmap, this.cfg.expiry] }),
    );
    return { txHashes: [res.hash, h] };
  }

  async setVentureRecords({ slug, records }: { slug: string; records: EnsVentureRecords }) {
    const name = ventureEnsName(slug, this.cfg.parentName ?? VESTIGE_PARENT_NAME);
    const resolver = await this.client.readContract({
      address: this.cfg.parentRegistry, abi: permissionedRegistryAbi, functionName: "getResolver", args: [name.split(".")[0]!],
    });
    if (resolver === zeroAddress) throw new Error(`resolver missing for ${name}`);
    const calls = recordCalls(name, records);
    if (calls.length === 0) return { txHashes: [] };
    const data = calls.length === 1 ? calls[0]! : encodeFunctionData({ abi: permissionedResolverAbi, functionName: "multicall", args: [calls] });
    return { txHashes: [await this.send(resolver, data)] };
  }

  async confirm({ txHashes, check }: { txHashes: Hex[]; check: () => Promise<boolean> }): Promise<ChainConfirmation> {
    let block = 0n;
    for (const hash of txHashes) {
      const r = await this.client.waitForTransactionReceipt({ hash, timeout: 120_000 });
      if (r.status !== "success") return { state: "FAILED", reason: `tx reverted ${hash}` };
      if (r.blockNumber > block) block = r.blockNumber;
    }
    if (!(await check())) return { state: "FAILED", reason: "read-back mismatch after receipt" };
    return { state: "CONFIRMED", chainId: this.client.chain?.id ?? 11155111, blockNumber: block, confirmedAt: Date.now() };
  }
}

/** Independent ENS reads through the Universal Resolver (what the public page and C2 use). */
export class EnsReader {
  constructor(private client: PublicClient, private universalResolver: Address = ENSV2_SEPOLIA.UniversalResolverProxy) {}

  text(name: string, key: string): Promise<string | null> {
    return this.client.getEnsText({ name, key, universalResolverAddress: this.universalResolver });
  }
  address(name: string, coinType?: bigint): Promise<Address | null> {
    return this.client.getEnsAddress({ name, coinType, universalResolverAddress: this.universalResolver });
  }
  resolver(name: string): Promise<Address> {
    return this.client.getEnsResolver({ name, universalResolverAddress: this.universalResolver });
  }

  /** The cross-chain identity bundle for a venture (PRD FR-1 records). */
  async venture(name: string) {
    const [ventureId, status, humans, agreement, guard, treasury] = await Promise.all([
      this.text(name, ENS_KEYS.ventureId),
      this.text(name, ENS_KEYS.status),
      this.text(name, ENS_KEYS.humans),
      this.text(name, ENS_KEYS.agreement),
      this.text(name, ENS_KEYS.guard),
      this.address(name, WHITECHAIN_COIN_TYPE),
    ]);
    return { name, ventureId, status, humans: humans === null ? null : Number(humans), agreement, guard, treasury };
  }
}
