/**
 * Client-visible configuration. Env var NAMES are proposals for H to lock in
 * `.env.example` (CONTRACTS: "agents propose additions rather than editing root").
 *
 *   NEXT_PUBLIC_VESTIGE_ADAPTER          "mock" | "live"   (default: mock in dev, live in prod)
 *   NEXT_PUBLIC_SEPOLIA_RPC_URL          default https://ethereum-sepolia-rpc.publicnode.com
 *   NEXT_PUBLIC_WHITECHAIN_RPC_URL       default https://rpc.testnet.whitechain.io
 *   NEXT_PUBLIC_WHITECHAIN_EXPLORER_URL  default https://explorer.testnet.whitechain.io
 *   NEXT_PUBLIC_ENS_UNIVERSAL_RESOLVER   optional override for ENSv2 Sepolia (C1 to confirm)
 *   NEXT_PUBLIC_VESTIGE_GUARD_ADDRESS    expected Guard (from deployment manifest)
 *   NEXT_PUBLIC_VESTIGE_REGISTRY_ADDRESS SeatRegistry (from deployment manifest)
 *   NEXT_PUBLIC_WHITECHAIN_USDT_ADDRESS  default 0xcedf…55a7
 */
import type { Address } from "./types";

const env = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export const IS_PRODUCTION_BUILD = process.env.NODE_ENV === "production";

const requestedAdapter = env(process.env.NEXT_PUBLIC_VESTIGE_ADAPTER);
/** DEV MOCK is never allowed in a production build (MASTER §3). */
export const ADAPTER_KIND: "dev-mock" | "live" = IS_PRODUCTION_BUILD ? "live" : requestedAdapter === "live" ? "live" : "dev-mock";
export const MOCK_REFUSED_IN_PROD = IS_PRODUCTION_BUILD && requestedAdapter === "mock";

export const CONFIG = {
  sepoliaRpcUrl: env(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL) ?? "https://ethereum-sepolia-rpc.publicnode.com",
  whitechainRpcUrl: env(process.env.NEXT_PUBLIC_WHITECHAIN_RPC_URL) ?? "https://rpc.testnet.whitechain.io",
  whitechainExplorerUrl: env(process.env.NEXT_PUBLIC_WHITECHAIN_EXPLORER_URL) ?? "https://explorer.testnet.whitechain.io",
  sepoliaExplorerUrl: "https://sepolia.etherscan.io",
  ensUniversalResolver: env(process.env.NEXT_PUBLIC_ENS_UNIVERSAL_RESOLVER) as Address | undefined,
  expectedGuard: env(process.env.NEXT_PUBLIC_VESTIGE_GUARD_ADDRESS) as Address | undefined,
  registryAddress: env(process.env.NEXT_PUBLIC_VESTIGE_REGISTRY_ADDRESS) as Address | undefined,
  usdtAddress: (env(process.env.NEXT_PUBLIC_WHITECHAIN_USDT_ADDRESS) ?? "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7") as Address,
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

/**
 * Real mined failed 1-of-2 tx on Whitechain (supplied by X/H after H-009). Proposed
 * env name; the component verifies the receipt on-chain before labelling it.
 */
export const REJECTED_ATTEMPT_TX = env(process.env.NEXT_PUBLIC_REJECTED_ATTEMPT_TX) as `0x${string}` | undefined;
