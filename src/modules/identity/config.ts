/**
 * Network constants for the identity workstream.
 *
 * ENSv2 Sepolia addresses: copied from https://docs.ens.domains/learn/deployments
 * ("Sepolia (ENSv2)") on 2026-11-06 and checked with eth_getCode on Sepolia at
 * block 0xb8404c (all non-empty). See docs/agent-reports/identity/.
 * Treat as config: H's deployment manifest is the source of truth at integration.
 */
import type { Address } from "viem";

export const ENS_CHAIN_ID = 11155111 as const;
export const WHITECHAIN_CHAIN_ID = 1874 as const;
/** ENSIP-11: 0x80000000 | 1874 */
export const WHITECHAIN_COIN_TYPE = 2147485522n;

export const ENSV2_SEPOLIA = {
  ETHRegistry: "0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4",
  ETHRegistrar: "0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3",
  RootRegistry: "0xb458d6a3a77919449d03e7a6903c26827c1ec43f",
  VerifiableFactory: "0xda70306c98e97ece36f997a21368e53298572991",
  PermissionedResolverImpl: "0x115eb53f0c60696633855f90b138178fb40b2b2c",
  UserRegistryImpl: "0x9bd8a88719068d09ecee662f36c0e3856708366a",
  UniversalResolverV2: "0x24e1d8e068620b647ca097f961a61055f4f42d72",
  /** UpgradableUniversalResolverProxy — what viem's ENS actions should call. */
  UniversalResolverProxy: "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe",
  MockUSDC: "0x240b0316df57887dbbe58b586508b19e633a14aa",
} as const satisfies Record<string, Address>;

export const VESTIGE_PARENT_NAME = "vestige.eth";

/** Text record keys (PRD FR-1). Values are always derived from live state. */
export const ENS_KEYS = {
  agreement: "vestige.agreement",
  status: "vestige.status",
  humans: "vestige.humans",
  guard: "vestige.guard",
  /** CR-C2-002: the public verifier resolves the server ventureId from ENS. */
  ventureId: "vestige.ventureId",
  /** Fallback only if ENSIP-11 addr fails live (MASTER §11.1). */
  treasuryFallback: "vestige.treasury",
} as const;

/** `vestige.status` can never be `incorporated` (PRD §13). */
export const VENTURE_STATUS_RECORD = "workspace" as const;

/** A 2-of-2 treasury needs exactly two founder seats in v1. */
export const MAX_FOUNDER_SEATS = 2;
