/**
 * Builds identity services from environment. Env names are LOCKED by CONTRACTS v0
 * (@30d1ef6 / .env.example). Missing config → fail-closed (CONFIG_MISSING or
 * FAILED/UNVERIFIED ports), never a mock. DEV MOCK ports exist only in tests/identity.
 * Secrets (WORLD_RP_SIGNING_KEY, ENS_REGISTRAR_PRIVATE_KEY) are read from the
 * process environment only and never logged or returned.
 */
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { AgreementService } from "../agreements/service";
import { AuthService } from "./auth";
import { migrateIdentity, SqliteDb } from "./db";
import { EnsReader, ViemEnsRegistrar } from "./ens/registrar";
import type { IdentityServices } from "./http";
import { ApprovalGatedEnsPort, UnconfiguredPort, type EnsPort, type SeatAttestationPort, type TreasurySummaryPort } from "./ports";
import { VentureService } from "./ventures";
import type { WorldConfig } from "./world";
import { ENS_KEYS } from "./config";

export const IDENTITY_ENV = [
  "VESTIGE_DB_PATH",
  "VESTIGE_AUTH_DOMAIN",
  "VESTIGE_AUTH_URI",
  "WORLD_APP_ID",
  "WORLD_RP_ID",
  "WORLD_RP_SIGNING_KEY", // secret
  "WORLD_ENVIRONMENT", // production | staging
  "WORLD_PROTOCOL_VERSION", // 4.0 (default) | 3.0 — never both
  "SEPOLIA_RPC_URL",
  "ENS_REGISTRAR_PRIVATE_KEY", // secret, registrar role only
  "VESTIGE_ENS_PARENT", // default vestige.eth
  "VESTIGE_PARENT_REGISTRY", // UserRegistry under vestige.eth
  "VESTIGE_ENS_EXPIRY", // uint64 seconds
] as const;

let singleton: IdentityServices | null = null;

/**
 * World config is all-or-nothing and pinned (D-016/D-021): explicit environment and
 * protocol are required; unknown values fail closed instead of defaulting.
 */
export function worldConfigFromEnv(env: NodeJS.ProcessEnv): WorldConfig | null {
  const { WORLD_APP_ID: appId, WORLD_RP_ID: rpId, WORLD_RP_SIGNING_KEY: key, WORLD_ENVIRONMENT: environment, WORLD_PROTOCOL_VERSION: protocol } = env;
  if (!appId || !rpId || !key) return null;
  if (!/^app_[A-Za-z0-9_]+$/.test(appId) || !/^rp_[A-Za-z0-9]+$/.test(rpId)) return null;
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(key)) return null;
  if (environment !== "staging" && environment !== "production") return null;
  if (protocol !== "4.0") return null; // 3.0 fallback needs H approval + fresh namespace (D-021)
  return { appId, rpId, signingKeyHex: key, environment, protocolVersion: "4.0" };
}

/** X injects its SeatRegistry attester here at integration (CR-ID-03, the only seam). */
let treasuryOverride: TreasurySummaryPort | undefined;
export function registerTreasurySummary(p: TreasurySummaryPort) { treasuryOverride = p; singleton = null; }

let attesterOverride: SeatAttestationPort | null = null;
export function registerSeatAttester(p: SeatAttestationPort) {
  attesterOverride = p;
  singleton = null;
}

export function getIdentityServices(env: NodeJS.ProcessEnv = process.env): IdentityServices {
  if (singleton) return singleton;
  const db = new SqliteDb(env.VESTIGE_DB_PATH ?? "vestige-identity.db");
  migrateIdentity(db);

  const world = worldConfigFromEnv(env);

  const parentName = env.VESTIGE_ENS_PARENT ?? "vestige.eth";
  // No registrar key in the server env ⇒ approval-gated: the API never broadcasts ENS writes;
  // H-approved digest-bound plans are broadcast by the operator and reconciled by read-back.
  let ens: EnsPort = new ApprovalGatedEnsPort();
  let reader: EnsReader | null = null;
  if (env.SEPOLIA_RPC_URL) {
    const client = createPublicClient({ chain: sepolia, transport: http(env.SEPOLIA_RPC_URL) });
    reader = new EnsReader(client);
    if (env.ENS_REGISTRAR_PRIVATE_KEY && env.VESTIGE_PARENT_REGISTRY && env.VESTIGE_ENS_EXPIRY) {
      const wallet = createWalletClient({ chain: sepolia, transport: http(env.SEPOLIA_RPC_URL), account: privateKeyToAccount(env.ENS_REGISTRAR_PRIVATE_KEY as Hex) });
      ens = new ViemEnsRegistrar(
        { parentName, parentRegistry: env.VESTIGE_PARENT_REGISTRY as Hex, expiry: BigInt(env.VESTIGE_ENS_EXPIRY) },
        wallet,
        client,
      );
    }
  }

  const ventures = new VentureService({ db, world, treasury: treasuryOverride, attester: attesterOverride ?? new UnconfiguredPort("SeatRegistry attester"), ens, parentName });
  if (reader) {
    const r = reader;
    ventures.checks = {
      ventureName: async (n, id) => (await r.text(n, ENS_KEYS.status)) === "workspace" && (await r.text(n, ENS_KEYS.ventureId)) === id,
      founderName: async (n, w) => (await r.address(n))?.toLowerCase() === w.toLowerCase(),
      humans: async (n, k) => (await r.text(n, ENS_KEYS.humans)) === String(k),
    };
  }
  const agreements = new AgreementService(db, ventures, ens, {
    checkAgreementRecord: reader ? async (n, h) => (await reader!.text(n, ENS_KEYS.agreement))?.toLowerCase() === h.toLowerCase() : undefined,
  });
  // No defaults: domain/URI must come from trusted config (CONTRACTS v0); otherwise sign-in fails closed.
  const auth = new AuthService(db, { domain: env.VESTIGE_AUTH_DOMAIN, uri: env.VESTIGE_AUTH_URI });
  singleton = { db, auth, ventures, agreements, parentName };
  return singleton;
}
