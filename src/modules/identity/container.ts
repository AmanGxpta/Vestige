/**
 * Builds identity services from environment. PROPOSED env names (H locks them in
 * .env.example). Missing chain config → fail-closed ports (status FAILED/UNVERIFIED),
 * never a mock. DEV MOCK ports exist only in tests/identity.
 */
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { AgreementService } from "../agreements/service";
import { AuthService } from "./auth";
import { migrateIdentity, SqliteDb } from "./db";
import { EnsReader, ViemEnsRegistrar } from "./ens/registrar";
import type { IdentityServices } from "./http";
import { UnconfiguredPort, type EnsPort, type SeatAttestationPort } from "./ports";
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

/** X injects its SeatRegistry attester here at integration (CR-ID-03). */
let attesterOverride: SeatAttestationPort | null = null;
export function registerSeatAttester(p: SeatAttestationPort) {
  attesterOverride = p;
  singleton = null;
}

export function getIdentityServices(env: NodeJS.ProcessEnv = process.env): IdentityServices {
  if (singleton) return singleton;
  const db = new SqliteDb(env.VESTIGE_DB_PATH ?? "vestige-identity.db");
  migrateIdentity(db);

  const world: WorldConfig | null =
    env.WORLD_APP_ID && env.WORLD_RP_ID && env.WORLD_RP_SIGNING_KEY
      ? {
          appId: env.WORLD_APP_ID,
          rpId: env.WORLD_RP_ID,
          signingKeyHex: env.WORLD_RP_SIGNING_KEY,
          environment: env.WORLD_ENVIRONMENT === "staging" ? "staging" : "production",
          protocolVersion: env.WORLD_PROTOCOL_VERSION === "3.0" ? "3.0" : "4.0",
        }
      : null;

  const parentName = env.VESTIGE_ENS_PARENT ?? "vestige.eth";
  let ens: EnsPort = new UnconfiguredPort("ENS registrar");
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

  const ventures = new VentureService({ db, world, attester: attesterOverride ?? new UnconfiguredPort("SeatRegistry attester"), ens, parentName });
  if (reader) {
    const r = reader;
    ventures.checks = {
      ventureName: async (n) => (await r.text(n, ENS_KEYS.status)) === "workspace",
      founderName: async (n, w) => (await r.address(n))?.toLowerCase() === w.toLowerCase(),
      humans: async (n, k) => (await r.text(n, ENS_KEYS.humans)) === String(k),
    };
  }
  const agreements = new AgreementService(db, ventures, ens, {
    checkAgreementRecord: reader ? async (n, h) => (await reader!.text(n, ENS_KEYS.agreement))?.toLowerCase() === h.toLowerCase() : undefined,
  });
  const auth = new AuthService(db, { domain: env.VESTIGE_AUTH_DOMAIN ?? "localhost", uri: env.VESTIGE_AUTH_URI ?? "http://localhost:3000" });
  singleton = { db, auth, ventures, agreements, parentName };
  return singleton;
}
