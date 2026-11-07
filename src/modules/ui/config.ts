/**
 * Client-visible configuration. Names are LOCKED by CONTRACTS v0 @ 30d1ef6
 * ("Environment variables → Public/browser configuration"):
 *
 *   NEXT_PUBLIC_VESTIGE_ADAPTER                  "live" | "mock" (mock is dev-only; forced live in production)
 *   NEXT_PUBLIC_SEPOLIA_RPC_URL
 *   NEXT_PUBLIC_WHITECHAIN_RPC_URL
 *   NEXT_PUBLIC_WHITECHAIN_EXPLORER_URL
 *   NEXT_PUBLIC_ENS_UNIVERSAL_RESOLVER
 *   NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL  reviewed DeploymentManifestV1; may contain "{ensName}" (CR-C2-008),
 *                                                e.g. "/manifests/{ensName}.json" → public/manifests/<name>.json
 *
 * The per-address env vars C2 proposed earlier (guard/registry/USDT/rejected tx) were
 * replaced by the manifest and receipt-backed evidence records; they are gone.
 */
import type { Address } from "./types";

const env = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export const IS_PRODUCTION_BUILD = process.env.NODE_ENV === "production";

const requestedAdapter = env(process.env.NEXT_PUBLIC_VESTIGE_ADAPTER);
/** DEV MOCK is never allowed in a production build (MASTER §3, CONTRACTS env rules). */
export const ADAPTER_KIND: "dev-mock" | "live" = IS_PRODUCTION_BUILD ? "live" : requestedAdapter === "live" ? "live" : "dev-mock";
export const MOCK_REFUSED_IN_PROD = IS_PRODUCTION_BUILD && requestedAdapter === "mock";

/** CONTRACTS "Network and approved runtime anchors": official test USDT on Whitechain 1874. */
export const APPROVED_USDT: Address = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";

export const CONFIG = {
  sepoliaRpcUrl: env(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL) ?? "https://ethereum-sepolia-rpc.publicnode.com",
  whitechainRpcUrl: env(process.env.NEXT_PUBLIC_WHITECHAIN_RPC_URL) ?? "https://rpc.testnet.whitechain.io",
  whitechainExplorerUrl: env(process.env.NEXT_PUBLIC_WHITECHAIN_EXPLORER_URL) ?? "https://explorer.testnet.whitechain.io",
  sepoliaExplorerUrl: "https://sepolia.etherscan.io",
  ensUniversalResolver: env(process.env.NEXT_PUBLIC_ENS_UNIVERSAL_RESOLVER) as Address | undefined,
  manifestUrl: env(process.env.NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL),
  usdtAddress: APPROVED_USDT,
  ensParent: "vestige.eth",
} as const;

export function explorerTx(chainId: number, hash: string): string | undefined {
  if (chainId === 1874) return `${CONFIG.whitechainExplorerUrl}/tx/${hash}`;
  if (chainId === 11155111) return `${CONFIG.sepoliaExplorerUrl}/tx/${hash}`;
  return undefined;
}

export function explorerAddress(chainId: number, address: string): string | undefined {
  if (chainId === 1874) return `${CONFIG.whitechainExplorerUrl}/address/${address}`;
  if (chainId === 11155111) return `${CONFIG.sepoliaExplorerUrl}/address/${address}`;
  return undefined;
}
