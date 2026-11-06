/**
 * DEV MOCK test doubles. Nothing here is evidence of network behaviour.
 *
 * FakeWorldPortal models the REAL portal behaviour observed in
 * worldcoin/developer-portal (main) web/api/v4/verify/uniqueness-proof/handler.ts:
 *   - verifies against the client-supplied action/signal_hash,
 *   - returns success:true even when a nullifier is REUSED,
 * so our tests prove the duplicate gate lives in OUR backend.
 * FakeHuman derives a deterministic nullifier per (human, action), like World ID.
 */
import { hashSignal } from "@worldcoin/idkit-core/hashing";
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { AgreementService } from "../../src/modules/agreements/service";
import { AuthService, type Clock } from "../../src/modules/identity/auth";
import { migrateIdentity, SqliteDb } from "../../src/modules/identity/db";
import type { IdentityServices } from "../../src/modules/identity/http";
import type { ChainConfirmation, EnsPort, EnsVentureRecords, SeatAttestationPort, SeatConfirmation } from "../../src/modules/identity/ports";
import type { SigningPayload } from "../../src/modules/agreements/service";
import { VentureService } from "../../src/modules/identity/ventures";
import type { WorldConfig, WorldRequestParams } from "../../src/modules/identity/world";

export class FakeClock implements Clock {
  t = Date.UTC(2026, 10, 6, 12, 0, 0);
  now() { return this.t; }
  advance(ms: number) { this.t += ms; }
}

export class FakeHuman {
  constructor(readonly secret = generatePrivateKey()) {}
  nullifierFor(action: string): string {
    return (BigInt(keccak256(stringToHex(`${this.secret}|${action}`))) >> 8n).toString(10);
  }
  /** Builds an IDKit 4.0 uniqueness result for the given request (as World App would). */
  prove(req: WorldRequestParams, opts: { signal?: string; action?: string; nonce?: string; identifier?: string; issuer?: number; environment?: string; protocol?: string } = {}) {
    const action = opts.action ?? req.action;
    return {
      protocol_version: opts.protocol ?? "4.0",
      nonce: opts.nonce ?? req.rp_context.nonce,
      action,
      environment: opts.environment ?? req.environment,
      responses: [
        {
          identifier: opts.identifier ?? "proof_of_human",
          signal_hash: hashSignal(opts.signal ?? req.signal),
          proof: ["1", "2", "3", "4", "5"],
          nullifier: this.nullifierFor(action),
          issuer_schema_id: opts.issuer ?? 1,
          expires_at_min: 1_900_000_000,
        },
      ],
    };
  }
}

export class FakeWorldPortal {
  calls: { url: string; body: any }[] = [];
  invalidProofs = new Set<string>(); // nullifiers whose proof "fails" verification
  down = false;
  readonly fetch: typeof fetch = async (input, init) => {
    if (this.down) throw new TypeError("fetch failed");
    const body = JSON.parse(String(init?.body));
    this.calls.push({ url: String(input), body });
    const item = body.responses?.[0];
    if (!item || this.invalidProofs.has(item.nullifier)) {
      return new Response(JSON.stringify({ success: false, code: "all_verifications_failed" }), { status: 400 });
    }
    return new Response(
      JSON.stringify({ success: true, action: body.action, nullifier: `0x${BigInt(item.nullifier).toString(16)}`, environment: body.environment, protocol_version: body.protocol_version, message: "ok" }),
      { status: 200 },
    );
  };
}

export class MemoryAttester implements SeatAttestationPort {
  submitted: { ventureId: Hex; wallet: Address; nullifierHash: Hex }[] = [];
  confirmState: SeatConfirmation["state"] = "CONFIRMED";
  failSubmit = false;
  /** Simulates an off-contract adapter (wrong chain / malformed hash) to test C1's guards. */
  submitOverride?: () => unknown;
  confirmOverride?: () => unknown;
  async attestSeat(i: { ventureId: Hex; wallet: Address; nullifierHash: Hex }) {
    if (this.failSubmit) throw new Error("attester down");
    this.submitted.push(i);
    if (this.submitOverride) return this.submitOverride() as { txHash: Hex; chainId: 1874 };
    return { txHash: keccak256(stringToHex(`attest${this.submitted.length}`)), chainId: 1874 as const };
  }
  async confirm(): Promise<SeatConfirmation> {
    if (this.confirmOverride) return this.confirmOverride() as SeatConfirmation;
    if (this.confirmState === "CONFIRMED") return { state: "CONFIRMED", chainId: 1874, blockNumber: 42n, confirmedAt: 1_762_430_400_000 };
    if (this.confirmState === "PENDING") return { state: "PENDING" };
    return { state: "FAILED", reason: "reverted" };
  }
}

/** What C2 does client-side: JSON payload (decimal strings) → viem signTypedData args. */
export function toTypedData(p: SigningPayload) {
  return {
    domain: p.domain,
    types: p.types,
    primaryType: p.primaryType,
    message: { ...p.message, version: BigInt(p.message.version), nonce: BigInt(p.message.nonce), expiry: BigInt(p.message.expiry) },
  };
}

export class MemoryEns implements EnsPort {
  ventures: string[] = [];
  ventureIds: Hex[] = [];
  founders: { slug: string; label: string; wallet: Address }[] = [];
  records: { slug: string; records: EnsVentureRecords }[] = [];
  readBack = true;
  async registerVenture(i: { slug: string; ventureId: Hex }) { this.ventures.push(i.slug); this.ventureIds.push(i.ventureId); return { txHashes: ["0x01" as Hex] }; }
  async registerFounder(i: { slug: string; label: string; wallet: Address }) { this.founders.push(i); return { txHashes: ["0x02" as Hex] }; }
  async setVentureRecords(i: { slug: string; records: EnsVentureRecords }) { this.records.push(i); return { txHashes: ["0x03" as Hex] }; }
  async confirm({ check }: { txHashes: Hex[]; check: () => Promise<boolean> }): Promise<ChainConfirmation> {
    const ok = await check(); // the memory port honours the independent read-back like the real one
    return this.readBack && ok ? { state: "CONFIRMED", chainId: 11155111, blockNumber: 7n, confirmedAt: 1 } : { state: "FAILED", reason: "read-back mismatch" };
  }
}

export function makeWorldConfig(over: Partial<WorldConfig> = {}): WorldConfig {
  return { appId: "app_test", rpId: "rp_test", signingKeyHex: generatePrivateKey(), environment: "staging", protocolVersion: "4.0", verifyBaseUrl: "https://portal.test", ...over };
}

export interface Harness extends IdentityServices {
  clock: FakeClock;
  portal: FakeWorldPortal;
  attester: MemoryAttester;
  ens: MemoryEns;
  world: WorldConfig;
  tasks: Promise<void>[];
  flush(): Promise<void>;
}

export function makeHarness(over: { world?: Partial<WorldConfig> } = {}): Harness {
  const db = new SqliteDb(":memory:");
  migrateIdentity(db);
  const clock = new FakeClock();
  const portal = new FakeWorldPortal();
  const attester = new MemoryAttester();
  const ens = new MemoryEns();
  const world = makeWorldConfig(over.world);
  const tasks: Promise<void>[] = [];
  const defer = (t: () => Promise<void>) => { tasks.push(t()); };
  const ventures = new VentureService({ db, world, attester, ens, clock, fetchImpl: portal.fetch, defer });
  ventures.checks = { ventureName: async (_n, id) => ens.ventureIds.includes(id), founderName: async () => true, humans: async () => true };
  const agreements = new AgreementService(db, ventures, ens, { clock, defer, checkAgreementRecord: async () => true });
  const auth = new AuthService(db, { domain: "vestige.test", uri: "https://vestige.test" }, clock);
  void (0 as unknown as ChainConfirmation);
  return {
    db, auth, ventures, agreements, clock, portal, attester, ens, world, tasks,
    async flush() { while (tasks.length) await tasks.shift(); },
  };
}

export function newWallet(): PrivateKeyAccount {
  return privateKeyToAccount(generatePrivateKey());
}

export const lower = (a: Address) => a.toLowerCase() as Address;

/** Signs in through the real challenge/session flow and returns an auth header. */
export async function signIn(h: Harness, acct: PrivateKeyAccount): Promise<Record<string, string>> {
  const c = h.auth.createChallenge(acct.address);
  const sig = await acct.signMessage({ message: c.message });
  const s = await h.auth.createSession({ nonce: c.nonce, signature: sig });
  return { authorization: `Bearer ${s.token}` };
}

export const req = (headers: Record<string, string> = {}, body?: unknown, url = "https://vestige.test/api") =>
  new Request(url, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
