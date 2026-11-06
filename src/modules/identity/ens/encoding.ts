/**
 * ENSv2 encodings verified against docs.ens.domains/ensv2 (2026-11-06) and the
 * selectors present in Sepolia bytecode (see agent report).
 */
import {
  concat,
  encodeAbiParameters,
  encodeFunctionData,
  getCreate2Address,
  keccak256,
  namehash,
  parseAbi,
  stringToHex,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { packetToBytes } from "viem/ens";

export const permissionedRegistryAbi = parseAbi([
  "function register(string label, address owner, address registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)",
  "function setSubregistry(uint256 anyId, address registry)",
  "function getStatus(uint256 anyId) view returns (uint8)",
  "function getSubregistry(string label) view returns (address)",
  "function getResolver(string label) view returns (address)",
  "function findOwner(string label) view returns (address)",
  "function roles(uint256 anyId, address account) view returns (uint256)",
  "function hasRootRoles(uint256 roleBitmap, address account) view returns (bool)",
  "function isEmancipated() view returns (bool)",
  "function revokeRootRoles(uint256 roleBitmap, address account) returns (bool)",
  "function unsafeTransfer(address to, uint256 tokenId, bytes data)",
  "function getTokenId(uint256 anyId) view returns (uint256)",
  "error TransferDisallowed(uint256 tokenId, address from)",
]);

export const permissionedResolverAbi = parseAbi([
  "function initialize((address account, uint256 roleBitmap)[] grants, bytes[] calls)",
  "function setText(bytes name, string key, string value)",
  "function setAddress(bytes name, uint256 coinType, bytes addressBytes)",
  "function multicall(bytes[] calls) returns (bytes[])",
  "function resolve(bytes name, bytes data) view returns (bytes)",
]);

export const userRegistryInitAbi = parseAbi(["function initialize((address account, uint256 roleBitmap)[] grants)"]);

export const verifiableFactoryAbi = parseAbi([
  "function deployProxy(address implementation, uint256 salt, bytes data) returns (address)",
  "function proxyLogic() view returns (address)",
  "function verifyContract(address proxy) view returns (address)",
  "event ProxyDeployed(address indexed sender, address indexed proxyAddress, uint256 salt, address implementation)",
]);

/** Permissioned Registry roles (docs table). Admin = role << 128. */
export const REG = {
  REGISTRAR: 1n << 0n,
  REGISTER_RESERVED: 1n << 4n,
  SET_PARENT: 1n << 8n,
  UNREGISTER: 1n << 12n,
  RENEW: 1n << 16n,
  SET_SUBREGISTRY: 1n << 20n,
  SET_RESOLVER: 1n << 24n,
  CAN_TRANSFER_ADMIN: (1n << 28n) << 128n,
  SET_URI: 1n << 36n,
  UPGRADE: 1n << 124n,
} as const;

/** Permissioned Resolver roles (docs table). */
export const RES = {
  SET_ADDRESS: 1n << 0n,
  SET_TEXT: 1n << 4n,
  SET_CONTENTHASH: 1n << 8n,
  SET_ABI: 1n << 12n,
  SET_INTERFACE: 1n << 16n,
  SET_NAME: 1n << 20n,
  SET_DATA: 1n << 24n,
  LINK: 1n << 28n,
  CAN_NAME: 1n << 120n,
  UPGRADE: 1n << 124n,
} as const;

export const admin = (role: bigint) => role << 128n;

/** DNS wire-format name (ENSv2 resolver setters take this, not a namehash). */
export function dnsEncode(name: string): Hex {
  return toHex(packetToBytes(name));
}

export function labelhash(label: string): bigint {
  return BigInt(keccak256(stringToHex(label)));
}

/**
 * Founder subname role bitmap: deliberately EMPTY.
 * - no ROLE_CAN_TRANSFER_ADMIN  → every transfer reverts TransferDisallowed
 *   (checked on the owner; operator approval cannot bypass it)
 * - name-level admin roles can only be granted at registration, so the owner
 *   can never add transfer rights later
 * - no SET_RESOLVER/SET_SUBREGISTRY → the founder's data lives in their own
 *   resolver, which only they can write (see founderResolverGrants)
 */
export const FOUNDER_ROLE_BITMAP = 0n;

/**
 * Registrar's root roles on a VENTURE registry: operational only, nothing
 * dangerous, so the registry reports isEmancipated() === true from block one
 * and vestige cannot unregister, re-point, transfer or upgrade founder names.
 */
export const VENTURE_REGISTRY_REGISTRAR_ROLES = REG.REGISTRAR | REG.RENEW;

/** Venture resolver: registrar may write text + addr records until handover. No link, no upgrade. */
export const VENTURE_RESOLVER_REGISTRAR_ROLES = RES.SET_TEXT | RES.SET_ADDRESS;

/** Founder resolver: only the founder writes; nobody can upgrade or relink it. */
export const FOUNDER_RESOLVER_FOUNDER_ROLES = RES.SET_TEXT | RES.SET_ADDRESS;

/** Proxy salts. Arbitrary uint256 per factory docs; namespaced by name to be deterministic. */
export function ventureRegistrySalt(ventureName: string, version = 0n): bigint {
  return BigInt(
    keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }], [keccak256(stringToHex("UserRegistry")), namehash(ventureName), version])),
  );
}
export function resolverSaltForName(name: string, version = 0n): bigint {
  return BigInt(
    keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }], [keccak256(stringToHex("VestigeResolver")), namehash(name), version])),
  );
}

/** Off-chain CREATE2 prediction (verbatim algorithm from Verifiable Factory docs). */
export function predictProxyAddress(a: { factory: Address; proxyLogic: Address; deployer: Address; salt: bigint }): Address {
  const outerSalt = keccak256(encodeAbiParameters([{ type: "address" }, { type: "uint256" }], [a.deployer, a.salt]));
  const initCode = concat(["0x3d604d80600a3d3981f3363d3d373d3d3d363d73", a.proxyLogic, "0x5af43d82803e903d91602b57fd5bf3", outerSalt]);
  return getCreate2Address({ from: a.factory, salt: outerSalt, bytecodeHash: keccak256(initCode) });
}

export function encodeUserRegistryInit(grants: { account: Address; roleBitmap: bigint }[]): Hex {
  return encodeFunctionData({ abi: userRegistryInitAbi, functionName: "initialize", args: [grants] });
}

export function encodeResolverInit(grants: { account: Address; roleBitmap: bigint }[], calls: Hex[]): Hex {
  return encodeFunctionData({ abi: permissionedResolverAbi, functionName: "initialize", args: [grants, calls] });
}

export function encodeSetText(name: string, key: string, value: string): Hex {
  return encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setText", args: [dnsEncode(name), key, value] });
}

export function encodeSetAddress(name: string, coinType: bigint, address: Address): Hex {
  return encodeFunctionData({ abi: permissionedResolverAbi, functionName: "setAddress", args: [dnsEncode(name), coinType, address] });
}
