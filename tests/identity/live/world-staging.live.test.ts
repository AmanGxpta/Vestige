/**
 * LIVE World ID 4.0 STAGING end-to-end through C1's real server code.
 * Every result here is TESTED_IN_SIMULATOR (World ID Simulator, staging). It is NOT
 * evidence of real or distinct humans, and must never be described as such.
 *
 * Real: RP signing (idkit signRequest), IDKit bridge request, Simulator proof,
 *       Developer Portal /api/v4/verify, C1 VentureService uniqueness gate, SQLite.
 * DEV MOCK: SeatAttestationPort + EnsPort (no chain writes in this test).
 *
 * Secrets: WORLD_RP_SIGNING_KEY is read from a local file (default <repo>/.env.local,
 * must be mode 600 and gitignored). It is never printed, logged or written to evidence.
 *
 * Run (H or C1, interactive — paste each connector URI into simulator.worldcoin.org):
 *   VESTIGE_WORLD_STAGING=1 WORLD_E2E_OUT=/path/progress.jsonl npm run test:live -- world-staging
 */
import { appendFileSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { IDKit, proofOfHuman } from "@worldcoin/idkit-core";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Address } from "viem";
import { AgreementService } from "../../../src/modules/agreements/service";
import { AuthService } from "../../../src/modules/identity/auth";
import { migrateIdentity, SqliteDb } from "../../../src/modules/identity/db";
import { IdentityError } from "../../../src/modules/identity/errors";
import { VentureService } from "../../../src/modules/identity/ventures";
import { nullifierHash, type WorldConfig } from "../../../src/modules/identity/world";
import { MemoryAttester, MemoryEns } from "../helpers";

const RUN = process.env.VESTIGE_WORLD_STAGING === "1";
const repo = new URL("../../../", import.meta.url).pathname;
const OUT = process.env.WORLD_E2E_OUT ?? `${repo}tests/identity/live/.world-staging-progress.jsonl`;
const EVIDENCE = process.env.WORLD_E2E_EVIDENCE ?? `${repo}docs/agent-reports/identity/evidence/world-staging-e2e.json`;

function loadSecretFile(path: string): Record<string, string> {
  if (!existsSync(path)) throw new Error(`missing ${path}: put WORLD_RP_SIGNING_KEY there (mode 600). See report §human actions.`);
  const mode = statSync(path).mode & 0o777;
  if (mode & 0o077) throw new Error(`${path} must not be group/world readable (chmod 600); found ${mode.toString(8)}`);
  try {
    execFileSync("git", ["-C", repo, "check-ignore", "-q", path]);
  } catch {
    throw new Error(`${path} is not gitignored; refusing to read a secret from a trackable file`);
  }
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
  return out;
}

const log = (o: Record<string, unknown>) => appendFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), ...o }) + "\n");

describe.skipIf(!RUN)("LIVE World 4.0 staging simulator (TESTED_IN_SIMULATOR)", () => {
  it("two distinct simulated identities seat; identity 1 with a second wallet is refused", async () => {
    writeFileSync(OUT, "");
    const env = loadSecretFile(process.env.WORLD_ENV_FILE ?? `${repo}.env.local`);
    const key = env.WORLD_RP_SIGNING_KEY;
    if (!key || !/^(0x)?[0-9a-fA-F]{64}$/.test(key)) throw new Error("WORLD_RP_SIGNING_KEY missing or not 32-byte hex (value not shown)");
    const world: WorldConfig = {
      appId: env.WORLD_APP_ID ?? "app_464659fa58b71bf5f1a1b65c69d0b744",
      rpId: env.WORLD_RP_ID ?? "rp_ec275669640f9143",
      signingKeyHex: key,
      environment: "staging",
      protocolVersion: "4.0",
    };

    // Record every Developer Portal verify exchange; raw nullifiers are replaced by their CR-ID-04 digest.
    const exchanges: Record<string, unknown>[] = [];
    const redact = (v: unknown): unknown => {
      if (Array.isArray(v)) return v.map(redact);
      if (v && typeof v === "object") {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => {
          if (k === "nullifier" && typeof x === "string") return ["nullifierHash", safeHash(x)];
          if (k === "proof") return ["proof", "<omitted>"];
          return [k, redact(x)];
        }));
      }
      return v;
    };
    const recordingFetch: typeof fetch = async (input, init) => {
      const res = await fetch(input, init);
      const text = await res.clone().text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* keep text */ }
      exchanges.push({
        url: String(input),
        request: redact(JSON.parse(String(init?.body ?? "{}"))),
        status: res.status,
        response: redact(body),
        at: new Date().toISOString(),
      });
      return res;
    };

    const db = new SqliteDb(":memory:");
    migrateIdentity(db);
    const attester = new MemoryAttester();
    const ens = new MemoryEns();
    const tasks: Promise<void>[] = [];
    const ventures = new VentureService({ db, world, attester, ens, fetchImpl: recordingFetch, defer: (t) => { tasks.push(t().catch(() => undefined)); } });
    ventures.checks = { ventureName: async () => true, founderName: async () => true, humans: async () => true };
    new AgreementService(db, ventures, ens);
    new AuthService(db, { domain: "localhost:3200", uri: "http://localhost:3200" });

    // Throwaway wallets generated in memory for this run only; never funded, never reused.
    const wallet = () => privateKeyToAccount(generatePrivateKey()).address.toLowerCase() as Address;
    const A = wallet(), B = wallet(), C = wallet();

    async function prove(step: string, identityHint: string, w: Address, vid: `0x${string}`) {
      const params = ventures.worldRequest(w, vid);
      const request = await IDKit.request({
        app_id: params.app_id as `app_${string}`,
        action: params.action,
        rp_context: params.rp_context,
        allow_legacy_proofs: false,
        environment: "staging",
      }).preset(proofOfHuman({ signal: params.signal }));
      log({ step, identityHint, wallet: w, ventureId: vid, action: params.action, connectorURI: request.connectorURI, status: "WAITING_FOR_SIMULATOR" });
      const done = await request.pollUntilCompletion({ pollInterval: 2000, timeout: 14 * 60_000 });
      if (!done.success) {
        log({ step, status: "IDKIT_FAILED", error: done.error });
        throw new Error(`IDKit ${step} failed: ${done.error}`);
      }
      const r = done.result as { protocol_version: string; environment: string; responses: { identifier: string; issuer_schema_id?: number; nullifier: string }[] };
      const resp = r.responses[0];
      log({ step, status: "PROOF_RECEIVED", protocol: r.protocol_version, environment: r.environment, identifier: resp?.identifier, issuer: resp?.issuer_schema_id });
      try {
        const out = await ventures.verifyWorld(w, vid, { idkitResult: done.result });
        log({ step, status: "SERVER_VERIFIED", seat: out.seat.worldProofStatus, attestation: out.attestation.status });
        return { outcome: "VERIFIED" as const, nullifierHash: safeHash(resp!.nullifier), protocol: r.protocol_version, issuer: resp?.issuer_schema_id };
      } catch (e) {
        const err = e instanceof IdentityError ? { code: e.code, message: e.message } : { code: "UNEXPECTED", message: (e as Error).message };
        log({ step, status: "SERVER_REFUSED", ...err });
        return { outcome: err.code, message: err.message, nullifierHash: safeHash(resp!.nullifier), protocol: r.protocol_version, issuer: resp?.issuer_schema_id };
      }
    }

    // Venture 1: two distinct simulated identities.
    const v1 = ventures.create(A, { name: `Vestige Sim One ${Date.now() % 100000}`, founderLabel: "ada" }).ventureId;
    const inv1 = ventures.createInvite(A, v1);
    ventures.join(B, v1, { inviteToken: inv1.inviteToken, founderLabel: "bob" });
    const s1 = await prove("1-venture1-walletA-identity1", "SIMULATOR IDENTITY #1", A, v1);
    const s2 = await prove("2-venture1-walletB-identity2", "SIMULATOR IDENTITY #2 (create/switch to a NEW identity)", B, v1);

    // Venture 2: identity 1 again (allowed: different venture), then identity 1 with a SECOND wallet (must be refused).
    const v2 = ventures.create(A, { name: `Vestige Sim Two ${Date.now() % 100000}`, founderLabel: "ada" }).ventureId;
    const inv2 = ventures.createInvite(A, v2);
    ventures.join(C, v2, { inviteToken: inv2.inviteToken, founderLabel: "cy1" });
    const s3 = await prove("3-venture2-walletA-identity1", "SIMULATOR IDENTITY #1 (switch back)", A, v2);
    const s4 = await prove("4-venture2-walletC-identity1", "SIMULATOR IDENTITY #1 again, second wallet", C, v2);
    await Promise.all(tasks);

    const evidence = {
      label: "TESTED_IN_SIMULATOR",
      disclaimer: "World ID Simulator (staging) identities. Not real people, not proof of two distinct humans, not production World ID.",
      environment: "staging",
      protocolPinned: "4.0",
      appId: world.appId,
      rpId: world.rpId,
      mocks: "SeatAttestationPort and EnsPort are DEV MOCK in this run; no chain transaction was sent.",
      ventures: { v1, v2 },
      wallets: { A, B, C, note: "throwaway in-memory keys, discarded after the run" },
      steps: { s1, s2, s3, s4 },
      assertions: {
        "ID-02 two distinct simulated identities seated in venture 1": s1.outcome === "VERIFIED" && s2.outcome === "VERIFIED" && s1.nullifierHash !== s2.nullifierHash,
        "ID-04 identity 1 allowed in a different venture": s3.outcome === "VERIFIED",
        "ID-03 identity 1 with a second wallet refused in the same venture": s4.outcome === "DUPLICATE_HUMAN",
        "same identity + same action → same nullifier (refusal is by nullifier)": s3.nullifierHash === s4.nullifierHash,
        "portal accepted the reused nullifier (uniqueness is C1's job)": null as boolean | null,
        "C2-visible seat state after refusal": ventures.view(v2).seats.map((s) => ({ wallet: s.wallet, worldProofStatus: s.worldProofStatus })),
      },
      attesterCalls: attester.submitted,
      portalExchanges: exchanges,
    };
    // s4's proof is refused by C1 *after* the portal verified it; record what the portal said.
    const last = exchanges.at(-1) as { response?: { success?: boolean } } | undefined;
    evidence.assertions["portal accepted the reused nullifier (uniqueness is C1's job)"] = s4.outcome === "DUPLICATE_HUMAN" ? last?.response?.success === true : null;
    writeFileSync(EVIDENCE, JSON.stringify(evidence, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n");
    log({ status: "DONE", evidence: EVIDENCE });

    expect(s1.outcome).toBe("VERIFIED");
    expect(s2.outcome).toBe("VERIFIED");
    expect(s1.nullifierHash).not.toBe(s2.nullifierHash);
    expect(s3.outcome).toBe("VERIFIED");
    expect(s4.outcome).toBe("DUPLICATE_HUMAN");
  }, 60 * 60_000);
});

function safeHash(n: string): string {
  try { return nullifierHash(n); } catch { return "<unparseable>"; }
}
