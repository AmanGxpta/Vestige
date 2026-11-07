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
  /** H decision A: only the four pinned pre-existing anchors may carry this (creation tx from the explorer indexer). */
  provenance?: "EXPLORER_ATTESTED";
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

/*
 * Rules mirror X's validator exactly (agent/treasury 1d2ff44 src/modules/treasury/manifest.mjs)
 * so the browser and the treasury service accept and reject the same manifests:
 * no unknown keys, non-zero addresses/hashes, 40-hex sourceCommit, UTC approvedAt,
 * the Whitechain explorer, contracts/abi/*.json paths, canonical singleton/factory/token
 * anchors, and deploymentBlock === contracts.safe.deploymentBlock. Cross-checked against
 * X's code in docs/agent-reports/product/2026-11-07-cross-owner-*.txt.
 */
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const H32 = /^0x[0-9a-fA-F]{64}$/;
const VID = /^0x[0-9a-f]{64}$/;
const ZERO_ADDR = /^0x0{40}$/;
const ZERO_H32 = /^0x0{64}$/;
export const MANIFEST_ANCHORS = {
  singleton: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
  factory: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
  token: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
} as const;
/** H decision A (mirrors X's EXPLORER_ATTESTED_ANCHORS): the ONLY artifacts allowed provenance:"EXPLORER_ATTESTED". */
export const EXPLORER_ATTESTED_ANCHORS = {
  singleton: { address: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762", runtimeCodeHash: "0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff" },
  factory: { address: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", runtimeCodeHash: "0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317" },
  token: { address: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7", runtimeCodeHash: "0x4d9be648c5bf39973670d9f8b481d5d0b971e6a2db2deccc6b98cde21c5dd83e" },
  "token.implementation": { address: "0x26425662D126412128967ECf0a02EC48573026F7", runtimeCodeHash: "0xb5c69874a061f6c8750294eefc2de2f45a7c229e961b03fc901f3612010822d6" },
} as const;
const EXPLORERS = ["https://explorer.testnet.whitechain.io", "https://explorer.testnet.whitechain.io/"];
const ART_KEYS = ["address", "deploymentTxHash", "deploymentBlock", "runtimeCodeHash", "abiPath", "abiSha256", "verifiedSourceUrl", "provenance"];
const TOKEN_KEYS = [...ART_KEYS, "decimals", "eip712Domain", "domainSeparator", "implementation"];
const TOP_KEYS = ["schemaVersion", "chainId", "sourceCommit", "approvedAt", "explorerBaseUrl", "contracts", "network", "deploymentBlock", "ventureId", "ensName", "owners", "threshold", "setupInitializerHash"];
const eqi = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const extraKeys = (o: object, allowed: string[]) => Object.keys(o).filter((k) => !allowed.includes(k));

function artifactProblems(name: string, a: unknown, token = false): string[] {
  const x = a as Partial<ContractArtifact> | undefined;
  if (!x || typeof x !== "object" || Array.isArray(x)) return [`contracts.${name} is missing`];
  const p: string[] = [];
  const extra = extraKeys(x, token ? TOKEN_KEYS : ART_KEYS);
  if (extra.length) p.push(`contracts.${name} has unknown keys: ${extra.join(", ")}`);
  if (!ADDR.test(String(x.address)) || ZERO_ADDR.test(String(x.address))) p.push(`contracts.${name}.address is not a non-zero address`);
  if (!H32.test(String(x.deploymentTxHash)) || ZERO_H32.test(String(x.deploymentTxHash))) p.push(`contracts.${name}.deploymentTxHash is not a tx hash`);
  if (!Number.isSafeInteger(x.deploymentBlock) || (x.deploymentBlock as number) < 0) p.push(`contracts.${name}.deploymentBlock is not a block number`);
  if (!H32.test(String(x.runtimeCodeHash))) p.push(`contracts.${name}.runtimeCodeHash is not a bytes32`);
  if (typeof x.abiPath !== "string" || !/^contracts\/abi\/[A-Za-z0-9_.-]+\.json$/.test(x.abiPath)) p.push(`contracts.${name}.abiPath must be contracts/abi/<name>.json`);
  if (typeof x.abiSha256 !== "string" || !/^[0-9a-f]{64}$/.test(x.abiSha256)) p.push(`contracts.${name}.abiSha256 is not a lowercase sha256`);
  if (x.verifiedSourceUrl !== undefined && !/^https:\/\//.test(String(x.verifiedSourceUrl))) p.push(`contracts.${name}.verifiedSourceUrl must be https`);
  if (x.provenance !== undefined) {
    const anchor = (EXPLORER_ATTESTED_ANCHORS as Record<string, { address: string; runtimeCodeHash: string }>)[name];
    if (x.provenance !== "EXPLORER_ATTESTED" || !anchor || !eqi(x.address, anchor.address) || String(x.runtimeCodeHash).toLowerCase() !== anchor.runtimeCodeHash)
      p.push(`contracts.${name}.provenance is only allowed as EXPLORER_ATTESTED on the pinned pre-existing anchors`);
  }
  return p;
}

/** Structural validation of a treasury manifest. Returns problems; empty = structurally valid. */
export function validateManifest(m: unknown): string[] {
  const x = m as Partial<DeploymentManifestV1> | undefined;
  if (!x || typeof x !== "object" || Array.isArray(x)) return ["manifest is not a JSON object"];
  const p: string[] = [];
  if ((x as { kind?: string }).kind === "infrastructure") p.push("this is an InfrastructureManifestV1; a treasury manifest is required");
  const extra = extraKeys(x, TOP_KEYS);
  if (extra.length) p.push(`manifest has unknown keys: ${extra.join(", ")}`);
  if (x.schemaVersion !== 1) p.push("schemaVersion must be 1");
  if (x.network !== "whitechain-sepolia") p.push('network must be "whitechain-sepolia"');
  if (x.chainId !== WHITECHAIN_CHAIN_ID) p.push("chainId must be 1874");
  if (!Number.isSafeInteger(x.deploymentBlock) || (x.deploymentBlock as number) < 0) p.push("deploymentBlock is not a block number");
  if (typeof x.sourceCommit !== "string" || !/^[0-9a-f]{40}$/.test(x.sourceCommit)) p.push("sourceCommit must be a full 40-hex git commit");
  if (!EXPLORERS.includes(String(x.explorerBaseUrl))) p.push("explorerBaseUrl must be https://explorer.testnet.whitechain.io");
  if (!VID.test(String(x.ventureId)) || ZERO_H32.test(String(x.ventureId))) p.push("ventureId must be 0x + 64 lowercase hex");
  if (typeof x.ensName !== "string" || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vestige\.eth$/.test(x.ensName)) p.push("ensName must be <label>.vestige.eth");
  if (!Array.isArray(x.owners) || x.owners.length !== 2 || !x.owners.every((o) => ADDR.test(String(o)) && !ZERO_ADDR.test(String(o)))) p.push("owners must be two addresses");
  else if (eqi(x.owners[0], x.owners[1])) p.push("owners must be distinct");
  if (x.threshold !== 2) p.push("threshold must be 2");
  if (!H32.test(String(x.setupInitializerHash))) p.push("setupInitializerHash is not a bytes32");
  if (typeof x.approvedAt !== "string" || Number.isNaN(Date.parse(x.approvedAt)) || !x.approvedAt.endsWith("Z")) p.push("approvedAt must be an ISO-8601 UTC time ending in Z");
  const c = x.contracts as DeploymentManifestV1["contracts"] | undefined;
  if (!c || typeof c !== "object") return [...p, "contracts is missing"];
  const names = ["safe", "guard", "registry", "singleton", "factory", "setup", "token"] as const;
  const cExtra = extraKeys(c, [...names]);
  if (cExtra.length) p.push(`contracts has unknown keys: ${cExtra.join(", ")}`);
  for (const k of names) p.push(...artifactProblems(k, c[k], k === "token"));
  for (const k of ["singleton", "factory", "token"] as const) if (c[k] && !eqi(c[k].address, MANIFEST_ANCHORS[k])) p.push(`contracts.${k}.address must be the approved anchor ${MANIFEST_ANCHORS[k]}`);
  if (c.safe && x.deploymentBlock !== c.safe.deploymentBlock) p.push("deploymentBlock must equal contracts.safe.deploymentBlock");
  const t = c.token;
  if (t) {
    if (t.decimals !== 6) p.push("contracts.token.decimals must be 6");
    p.push(...artifactProblems("token.implementation", t.implementation));
    if (!H32.test(String(t.domainSeparator))) p.push("contracts.token.domainSeparator is not a bytes32");
    const d = t.eip712Domain;
    if (!d || extraKeys(d, ["name", "version", "chainId", "verifyingContract"]).length || d.name !== "Tether USD" || d.version !== "1" || d.chainId !== WHITECHAIN_CHAIN_ID || !eqi(d.verifyingContract, t.address))
      p.push('contracts.token.eip712Domain must be {"Tether USD","1",1874,token address}');
  }
  return p;
}

/**
 * CR-C2-008: NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL may contain "{ensName}", e.g.
 * "/manifests/{ensName}.json", so each venture resolves its own reviewed manifest.
 * The name is lowercased and must be a vestige venture name (<label>.vestige.eth); it is
 * URI-encoded into the path. A URL without the token is used as-is (single manifest).
 * Hosting convention: operator-reviewed JSON at public/manifests/<ensName>.json (same
 * origin), byte-identical to X's VESTIGE_DEPLOYMENT_MANIFEST_PATH file for that venture.
 */
export const ENS_NAME_TOKEN = "{ensName}";
export function manifestUrlFor(template: string | undefined, ensName: string | undefined): string | undefined {
  if (!template) return undefined;
  if (!template.includes(ENS_NAME_TOKEN)) return template;
  const name = (ensName ?? "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vestige\.eth$/.test(name)) return undefined; // no guessing for other names
  return template.split(ENS_NAME_TOKEN).join(encodeURIComponent(name));
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
