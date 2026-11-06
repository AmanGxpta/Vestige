/**
 * DeploymentManifestV1 (CONTRACTS v0 @ 30d1ef6, D-013/D-022). Operator-reviewed,
 * committed JSON. Missing, stale, mismatched or unverifiable manifests FAIL CLOSED:
 * the public verdict can never be ACTIVE without one that matches ENS and chain.
 *
 * A manifest is a trust anchor for expected addresses/code hashes — never a
 * substitute for the independent chain reads in chain-reader.ts.
 */
import type { Address, Hex } from "@/src/modules/ui/types";
import { WHITECHAIN_CHAIN_ID } from "@/src/modules/ui/types";

export interface ContractArtifact {
  address: Address;
  deploymentTxHash: Hex;
  deploymentBlock: number;
  runtimeCodeHash: Hex;
  abiPath: string;
  abiSha256: string;
  verifiedSourceUrl?: string;
}
export interface TokenDomain {
  name: "Tether USD";
  version: "1";
  chainId: 1874;
  verifyingContract: Address;
}
export interface DeploymentManifestV1 {
  schemaVersion: 1;
  network: "whitechain-sepolia";
  chainId: 1874;
  deploymentBlock: number;
  sourceCommit: string;
  explorerBaseUrl: string;
  ventureId: Hex;
  ensName: string;
  owners: [Address, Address];
  threshold: 2;
  setupInitializerHash: Hex;
  approvedAt: string;
  contracts: {
    safe: ContractArtifact;
    guard: ContractArtifact;
    registry: ContractArtifact;
    singleton: ContractArtifact;
    factory: ContractArtifact;
    setup: ContractArtifact;
    token: ContractArtifact & { decimals: 6; eip712Domain: TokenDomain; domainSeparator: Hex; implementation: ContractArtifact };
  };
}

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const H32 = /^0x[0-9a-fA-F]{64}$/;
const VID = /^0x[0-9a-f]{64}$/;

function artifactProblems(name: string, a: unknown): string[] {
  const x = a as Partial<ContractArtifact> | undefined;
  if (!x || typeof x !== "object") return [`contracts.${name} is missing`];
  const p: string[] = [];
  if (!ADDR.test(String(x.address))) p.push(`contracts.${name}.address is not an address`);
  if (!H32.test(String(x.deploymentTxHash))) p.push(`contracts.${name}.deploymentTxHash is not a tx hash`);
  if (!Number.isSafeInteger(x.deploymentBlock) || (x.deploymentBlock as number) < 0) p.push(`contracts.${name}.deploymentBlock is not a block number`);
  if (!H32.test(String(x.runtimeCodeHash))) p.push(`contracts.${name}.runtimeCodeHash is not a bytes32`);
  if (typeof x.abiPath !== "string" || !x.abiPath) p.push(`contracts.${name}.abiPath is missing`);
  if (typeof x.abiSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(x.abiSha256)) p.push(`contracts.${name}.abiSha256 is not a sha256`);
  return p;
}

/** Structural validation of a treasury manifest. Returns problems; empty = structurally valid. */
export function validateManifest(m: unknown): string[] {
  const x = m as Partial<DeploymentManifestV1> | undefined;
  if (!x || typeof x !== "object") return ["manifest is not a JSON object"];
  const p: string[] = [];
  if (x.schemaVersion !== 1) p.push("schemaVersion must be 1");
  if ((x as { kind?: string }).kind === "infrastructure") p.push("this is an InfrastructureManifestV1; a treasury manifest is required");
  if (x.network !== "whitechain-sepolia") p.push('network must be "whitechain-sepolia"');
  if (x.chainId !== WHITECHAIN_CHAIN_ID) p.push("chainId must be 1874");
  if (!Number.isSafeInteger(x.deploymentBlock) || (x.deploymentBlock as number) < 0) p.push("deploymentBlock is not a block number");
  if (typeof x.sourceCommit !== "string" || !/^[0-9a-f]{7,40}$/.test(x.sourceCommit)) p.push("sourceCommit is not a git commit");
  if (typeof x.explorerBaseUrl !== "string" || !/^https:\/\//.test(x.explorerBaseUrl)) p.push("explorerBaseUrl must be https");
  if (!VID.test(String(x.ventureId))) p.push("ventureId must be 0x + 64 lowercase hex");
  if (typeof x.ensName !== "string" || !x.ensName.endsWith(".eth")) p.push("ensName is missing");
  if (!Array.isArray(x.owners) || x.owners.length !== 2 || !x.owners.every((o) => ADDR.test(String(o)))) p.push("owners must be two addresses");
  else if (x.owners[0].toLowerCase() === x.owners[1].toLowerCase()) p.push("owners must be distinct");
  if (x.threshold !== 2) p.push("threshold must be 2");
  if (!H32.test(String(x.setupInitializerHash))) p.push("setupInitializerHash is not a bytes32");
  if (typeof x.approvedAt !== "string" || Number.isNaN(Date.parse(x.approvedAt))) p.push("approvedAt is not an ISO-8601 time");
  const c = x.contracts as DeploymentManifestV1["contracts"] | undefined;
  if (!c) return [...p, "contracts is missing"];
  for (const k of ["safe", "guard", "registry", "singleton", "factory", "setup", "token"] as const) p.push(...artifactProblems(k, c[k]));
  const t = c.token;
  if (t) {
    if (t.decimals !== 6) p.push("contracts.token.decimals must be 6");
    p.push(...artifactProblems("token.implementation", t.implementation));
    if (!H32.test(String(t.domainSeparator))) p.push("contracts.token.domainSeparator is not a bytes32");
    const d = t.eip712Domain;
    if (!d || d.name !== "Tether USD" || d.version !== "1" || d.chainId !== WHITECHAIN_CHAIN_ID || String(d.verifyingContract).toLowerCase() !== String(t.address).toLowerCase())
      p.push('contracts.token.eip712Domain must be {"Tether USD","1",1874,token address}');
  }
  return p;
}

export type ManifestLoad =
  | { status: "NOT_CONFIGURED" }
  | { status: "INVALID"; problems: string[]; url: string }
  | { status: "UNREACHABLE"; error: string; url: string }
  | { status: "LOADED"; manifest: DeploymentManifestV1; url: string };

/** Fetch + validate. Same-origin or https only; cached per URL for the page lifetime. */
const cache = new Map<string, Promise<ManifestLoad>>();
export function loadManifest(url: string | undefined, fetchImpl: typeof fetch = (...a) => fetch(...a)): Promise<ManifestLoad> {
  if (!url) return Promise.resolve({ status: "NOT_CONFIGURED" });
  if (!url.startsWith("/") && !url.startsWith("https://")) return Promise.resolve({ status: "INVALID", problems: ["manifest URL must be same-origin or https"], url });
  const hit = cache.get(url);
  if (hit) return hit;
  const p = (async (): Promise<ManifestLoad> => {
    try {
      const r = await fetchImpl(url, { cache: "no-store" });
      if (!r.ok) return { status: "UNREACHABLE", error: `HTTP ${r.status}`, url };
      const json = (await r.json()) as unknown;
      const problems = validateManifest(json);
      return problems.length ? { status: "INVALID", problems, url } : { status: "LOADED", manifest: json as DeploymentManifestV1, url };
    } catch (e) {
      return { status: "UNREACHABLE", error: e instanceof Error ? e.message : String(e), url };
    }
  })();
  cache.set(url, p);
  return p;
}
