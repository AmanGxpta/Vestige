/**
 * CONTRACTS v0 @30d1ef6 follow-through (C1). DEV MOCK ports (helpers.ts) — these
 * prove C1 server logic only; no World, ENS or Whitechain network behaviour.
 */
import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256 } from "viem";
import { AuthService, validateAuthConfig } from "../../src/modules/identity/auth";
import { IdentityError } from "../../src/modules/identity/errors";
import { assertSameOrigin, handlers } from "../../src/modules/identity/http";
import { worldConfigFromEnv } from "../../src/modules/identity/container";
import { FakeHuman, lower, makeHarness, newWallet, req, signIn, type Harness } from "./helpers";

const code = async (p: Promise<unknown> | (() => unknown)) => {
  try { await (typeof p === "function" ? p() : p); } catch (e) { return (e as IdentityError).code; }
  return "OK";
};

const seatOf = (h: Harness, vid: `0x${string}`, w: string) => h.ventures.view(vid).seats.find((s) => s.wallet === w)!;

async function twoFounders(h: Harness) {
  const A = newWallet(), B = newWallet();
  const a = lower(A.address), b = lower(B.address);
  const vid = h.ventures.create(a, { name: "Northstar Labs", founderLabel: "ada" }).ventureId;
  const { inviteToken } = h.ventures.createInvite(a, vid);
  h.ventures.join(b, vid, { inviteToken, founderLabel: "bob" });
  return { A, B, a, b, vid };
}

describe("CR-ID-04 / CR-ID-03: hashed nullifier through the SeatAttestationPort", () => {
  it("X receives only keccak256(abi.encode(uint256 nullifier)); raw value never leaves C1", async () => {
    const h = makeHarness();
    const { a, vid } = await twoFounders(h);
    const human = new FakeHuman();
    const r = h.ventures.worldRequest(a, vid);
    const proof = human.prove(r);
    const out = await h.ventures.verifyWorld(a, vid, { idkitResult: proof });
    await h.flush();
    const raw = BigInt(proof.responses[0]!.nullifier);
    expect(h.attester.submitted).toEqual([{ ventureId: vid, wallet: a, nullifierHash: keccak256(encodeAbiParameters([{ type: "uint256" }], [raw])) }]);
    const leaked = JSON.stringify({ submitted: h.attester.submitted, out, view: h.ventures.view(vid) });
    expect(leaked).not.toContain(raw.toString(10));
    expect(leaked).not.toContain(raw.toString(16));
    expect(seatOf(h, vid, a).onchainSeatStatus).toBe("VERIFIED");
  });

  it("off-contract adapter results are treated as failures, never as success", async () => {
    for (const bad of [
      { submit: () => ({ txHash: "0x1234", chainId: 1874 }), want: "FAILED" },
      { submit: () => ({ txHash: `0x${"a".repeat(64)}`, chainId: 11155111 }), want: "FAILED" },
    ]) {
      const h = makeHarness();
      const { a, vid } = await twoFounders(h);
      h.attester.submitOverride = bad.submit;
      const r = h.ventures.worldRequest(a, vid);
      const out = await h.ventures.verifyWorld(a, vid, { idkitResult: new FakeHuman().prove(r) });
      expect(out.attestation.status).toBe(bad.want);
      expect(seatOf(h, vid, a).worldProofStatus).toBe("VERIFIED"); // off-chain stays verified
      expect(seatOf(h, vid, a).onchainSeatStatus).toBe("FAILED");
    }
    for (const conf of [
      { state: "CONFIRMED", chainId: 1, blockNumber: 5n, confirmedAt: 1_762_430_400_000 },
      { state: "CONFIRMED", chainId: 1874, blockNumber: 0n, confirmedAt: 1_762_430_400_000 },
      { state: "CONFIRMED", chainId: 1874, blockNumber: 5n },
      { state: "WHATEVER" },
    ]) {
      const h = makeHarness();
      const { a, vid } = await twoFounders(h);
      h.attester.confirmOverride = () => conf;
      const r = h.ventures.worldRequest(a, vid);
      await h.ventures.verifyWorld(a, vid, { idkitResult: new FakeHuman().prove(r) });
      await h.flush();
      expect(seatOf(h, vid, a).onchainSeatStatus, JSON.stringify(conf, (_k, v) => (typeof v === "bigint" ? `${v}n` : v))).toBe("FAILED");
    }
  });

  it("confirm() throwing keeps PENDING (no promotion); retryAttestation only re-submits when no tx exists", async () => {
    const h = makeHarness();
    const { a, b, vid } = await twoFounders(h);
    h.attester.confirmOverride = () => { throw new Error("rpc down"); };
    let r = h.ventures.worldRequest(a, vid);
    await h.ventures.verifyWorld(a, vid, { idkitResult: new FakeHuman().prove(r) });
    await h.flush();
    expect(seatOf(h, vid, a).onchainSeatStatus).toBe("PENDING");
    h.attester.confirmOverride = undefined;
    expect(await h.ventures.retryAttestation(vid, a)).toBe("VERIFIED"); // re-confirms the existing tx
    expect(h.attester.submitted).toHaveLength(1); // no second submission

    h.attester.failSubmit = true; // X unconfigured/down at verify time
    r = h.ventures.worldRequest(b, vid);
    await h.ventures.verifyWorld(b, vid, { idkitResult: new FakeHuman().prove(r) });
    expect(h.ventures.view(vid).seats.find((s) => s.wallet === b)!.onchainSeatStatus).toBe("FAILED");
    h.attester.failSubmit = false;
    expect(await h.ventures.retryAttestation(vid, b)).toBe("PENDING");
    await h.flush();
    expect(h.ventures.view(vid).seats.find((s) => s.wallet === b)!.onchainSeatStatus).toBe("VERIFIED");
    expect(await code(h.ventures.retryAttestation(vid, lower(newWallet().address)))).toBe("NOT_VERIFIED_FOUNDER");
  });

  it("reconcile(): promotes only on independent read-back, never re-broadcasts", async () => {
    const h = makeHarness();
    h.ens.readBack = false; // receipts "fail" read-back at write time
    const { vid } = await twoFounders(h);
    await h.flush();
    expect(h.ventures.view(vid).ensStatus).toBe("FAILED");
    const sent = h.ens.ventures.length;
    h.ventures.checks.ventureName = async () => false;
    let rec = await h.ventures.reconcile();
    expect(rec.stillOpen.some((x) => x.startsWith("ens-venture:northstar-labs.vestige.eth"))).toBe(true);
    h.ventures.checks.ventureName = async (_n, id) => id === vid; // read-back now matches
    rec = await h.ventures.reconcile();
    expect(rec.ensVerified).toBe(1);
    expect(h.ventures.view(vid).ensStatus).toBe("VERIFIED");
    expect(h.ens.ventures.length).toBe(sent);
  });
});

describe("CR-C2-002: ENS vestige.ventureId", () => {
  it("registerVenture carries the server ventureId; confirmation requires it to read back", async () => {
    const h = makeHarness();
    const { vid } = await twoFounders(h);
    await h.flush();
    expect(h.ens.ventureIds).toEqual([vid]);
    expect(h.ventures.view(vid).ensStatus).toBe("VERIFIED");
    // a resolver reporting a different ventureId must not confirm
    const h2 = makeHarness();
    h2.ventures.checks.ventureName = async () => false;
    const v2 = h2.ventures.create(lower(newWallet().address), { name: "Other Co", founderLabel: "ada" });
    await h2.flush();
    expect(h2.ventures.view(v2.ventureId).ensStatus).toBe("FAILED");
  });
});

describe("CR-C2-001: founder-consented public list", () => {
  it("default private; all current founders must opt in; any founder withdraws; new founder resets", async () => {
    const h = makeHarness();
    const api = handlers(h);
    const A = newWallet(), B = newWallet(), C = newWallet();
    const authA = await signIn(h, A), authB = await signIn(h, B), authC = await signIn(h, C);
    const v = await (await api.createVenture(req(authA, { name: "Northstar Labs", founderLabel: "ada" }))).json();
    const list = async () => (await api.listVentures(req())).json();
    expect(await list()).toEqual([]);
    expect((await api.setListing(req(authA, { listed: true }), v.ventureId)).status).toBe(200);
    expect((await list()).map((x: { ventureId: string }) => x.ventureId)).toEqual([v.ventureId]); // sole founder consented
    const { inviteToken } = await (await api.createInvite(req(authA, {}), v.ventureId)).json();
    await api.join(req(authB, { inviteToken, founderLabel: "bob" }), v.ventureId);
    expect(await list()).toEqual([]); // B has not consented
    await api.setListing(req(authB, { listed: true }), v.ventureId);
    const [item] = await list();
    expect(Object.keys(item).sort()).toEqual(["displayName", "ensName", "funded", "humansVerified", "observedAt", "source", "termsSigned", "treasuryActive", "ventureId", "verificationStatus"]);
    expect(item).toMatchObject({ displayName: "Northstar Labs", ensName: "northstar-labs.vestige.eth", humansVerified: 0, termsSigned: false, treasuryActive: null, funded: null, source: "vestige-api" });
    expect(JSON.stringify(item)).not.toContain(lower(A.address).slice(2));
    await api.setListing(req(authB, { listed: false }), v.ventureId);
    expect(await list()).toEqual([]);
    expect((await api.setListing(req(authC, { listed: true }), v.ventureId)).status).toBe(403); // outsider
    expect((await api.setListing(req(authA, { listed: "yes" }), v.ventureId)).status).toBe(400);
    expect((await api.setListing(req({}, { listed: true }), v.ventureId)).status).toBe(401);
  });
});

describe("session hardening (D-010)", () => {
  it("auth config: required, https outside localhost, domain = URI host", async () => {
    expect(await code(() => validateAuthConfig({}))).toBe("CONFIG_MISSING");
    expect(await code(() => validateAuthConfig({ domain: "vestige.app", uri: "http://vestige.app" }))).toBe("CONFIG_MISSING");
    expect(await code(() => validateAuthConfig({ domain: "evil.app", uri: "https://vestige.app" }))).toBe("CONFIG_MISSING");
    expect(validateAuthConfig({ domain: "localhost:3200", uri: "http://localhost:3200" })).toEqual({ domain: "localhost:3200", uri: "http://localhost:3200" });
    const h = makeHarness();
    const unconfigured = new AuthService(h.db, { domain: undefined, uri: undefined }, h.clock);
    expect(await code(() => unconfigured.createChallenge(newWallet().address))).toBe("CONFIG_MISSING");
  });

  it("logout revokes server-side; malformed bearer rejected; expiry fails closed", async () => {
    const h = makeHarness();
    const api = handlers(h);
    const A = newWallet();
    const auth = await signIn(h, A);
    expect((await api.createVenture(req(auth, { name: "Alpha Co", founderLabel: "ada" }))).status).toBe(201);
    const del = await api.authLogout(new Request("https://vestige.test/api", { method: "DELETE", headers: auth }));
    expect(del.status).toBe(204);
    expect(del.headers.get("cache-control")).toBe("no-store");
    expect((await api.createVenture(req(auth, { name: "Beta Co", founderLabel: "ada" }))).status).toBe(401);
    expect((await api.createVenture(req({ authorization: "Bearer short" }, { name: "Beta Co", founderLabel: "ada" }))).status).toBe(401);
    const auth2 = await signIn(h, A);
    h.clock.advance(12 * 3600_000 + 1);
    expect((await api.createVenture(req(auth2, { name: "Gamma Co", founderLabel: "ada" }))).status).toBe(401);
  });

  it("challenge rate limits: per-wallet open challenges and per-minute window", async () => {
    const h = makeHarness();
    const w = newWallet().address;
    for (let i = 0; i < 5; i++) h.auth.createChallenge(w);
    expect(await code(() => h.auth.createChallenge(w))).toBe("RATE_LIMITED");
    h.clock.advance(5 * 60_000 + 1); // open challenges expire
    for (let i = 0; i < 5; i++) h.auth.createChallenge(w);
    expect(await code(() => h.auth.createChallenge(w))).toBe("RATE_LIMITED"); // 11th in window or 6th open
    const r = await handlers(h).authChallenge(req({}, { wallet: w }));
    expect(r.status).toBe(429);
    expect((await r.json()).error.code).toBe("RATE_LIMITED");
  });

  it("same-origin mutation checks; no CORS headers", async () => {
    expect(await code(() => assertSameOrigin(new Request("https://x", { headers: { origin: "https://evil.example" } }), "https://vestige.test"))).toBe("ORIGIN_FORBIDDEN");
    expect(await code(() => assertSameOrigin(new Request("https://x", { headers: { "sec-fetch-site": "cross-site" } }), "https://vestige.test"))).toBe("ORIGIN_FORBIDDEN");
    expect(await code(() => assertSameOrigin(new Request("https://x", { headers: { origin: "https://vestige.test", "sec-fetch-site": "same-origin" } }), "https://vestige.test"))).toBe("OK");
    const h = makeHarness();
    const api = handlers(h);
    const auth = await signIn(h, newWallet());
    const res = await api.createVenture(req({ ...auth, origin: "https://evil.example" }, { name: "Evil Co", founderLabel: "ada" }));
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    const ch = await api.authChallenge(req({ origin: "https://evil.example" }, { wallet: newWallet().address }));
    expect(ch.status).toBe(403);
  });
});

describe("Idempotency-Key", () => {
  it("identical retry returns the original; changed body → 409; scoped per wallet", async () => {
    const h = makeHarness();
    const api = handlers(h);
    const A = newWallet(), B = newWallet();
    const authA = await signIn(h, A), authB = await signIn(h, B);
    const k = { "idempotency-key": "create-venture-0001" };
    const r1 = await api.createVenture(req({ ...authA, ...k }, { name: "Northstar Labs", founderLabel: "ada" }));
    const r2 = await api.createVenture(req({ ...authA, ...k }, { founderLabel: "ada", name: "Northstar Labs" }));
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.headers.get("idempotent-replayed")).toBe("true");
    expect(await r2.json()).toEqual(await r1.json());
    expect(h.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM identity_ventures")!.n).toBe(1);
    const r3 = await api.createVenture(req({ ...authA, ...k }, { name: "Different", founderLabel: "ada" }));
    expect(r3.status).toBe(409);
    expect((await r3.json()).error.code).toBe("IDEMPOTENCY_CONFLICT");
    // same key, other wallet → independent operation (and here: slug taken, a real 409)
    const r4 = await api.createVenture(req({ ...authB, ...k }, { name: "Northstar Labs", founderLabel: "bob" }));
    expect((await r4.json()).error.code).toBe("SLUG_TAKEN");
    expect((await api.createVenture(req({ ...authA, "idempotency-key": "x" }, { name: "Z Co", founderLabel: "ada" }))).status).toBe(400);
  });

  it("world/verify retry after success replays the result instead of failing on the consumed nonce", async () => {
    const h = makeHarness();
    const api = handlers(h);
    const A = newWallet();
    const auth = await signIn(h, A);
    const v = await (await api.createVenture(req(auth, { name: "Northstar Labs", founderLabel: "ada" }))).json();
    const wr = await (await api.worldRequest(req(auth, {}), v.ventureId)).json();
    const proof = new FakeHuman().prove(wr);
    const k = { "idempotency-key": "verify-ada-000001" };
    const first = await api.worldVerify(req({ ...auth, ...k }, { idkitResult: proof }), v.ventureId);
    const again = await api.worldVerify(req({ ...auth, ...k }, { idkitResult: proof }), v.ventureId);
    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(await first.json());
    expect(h.portal.calls).toHaveLength(1); // World verified once
  });
});

describe("World config is pinned (D-016/D-021)", () => {
  const base = { WORLD_APP_ID: "app_464659fa58b71bf5f1a1b65c69d0b744", WORLD_RP_ID: "rp_ec275669640f9143", WORLD_RP_SIGNING_KEY: `0x${"1".repeat(64)}`, WORLD_ENVIRONMENT: "staging", WORLD_PROTOCOL_VERSION: "4.0" };
  it("requires explicit environment + protocol 4.0; refuses 3.0 and unknown values", () => {
    expect(worldConfigFromEnv(base)).toMatchObject({ environment: "staging", protocolVersion: "4.0" });
    expect(worldConfigFromEnv({ ...base, WORLD_PROTOCOL_VERSION: "3.0" })).toBeNull();
    expect(worldConfigFromEnv({ ...base, WORLD_ENVIRONMENT: undefined })).toBeNull();
    expect(worldConfigFromEnv({ ...base, WORLD_ENVIRONMENT: "prod" })).toBeNull();
    expect(worldConfigFromEnv({ ...base, WORLD_RP_SIGNING_KEY: "not-a-key" })).toBeNull();
  });
});

describe("CR-C2-006 / CR-C2-007 (C1-ACKed, H pending): provenance + listing shape", () => {
  it("worldEnvironment on seats and public founders; event source exposed; listing {listed, consents[]}", async () => {
    const h = makeHarness(); // harness World config is staging
    const api = handlers(h);
    const A = newWallet(), B = newWallet();
    const authA = await signIn(h, A), authB = await signIn(h, B);
    const v = await (await api.createVenture(req(authA, { name: "Northstar Labs", founderLabel: "ada" }))).json();
    const { inviteToken } = await (await api.createInvite(req(authA, {}), v.ventureId)).json();
    await api.join(req(authB, { inviteToken, founderLabel: "bob" }), v.ventureId);
    const wr = await (await api.worldRequest(req(authA, {}), v.ventureId)).json();
    await api.worldVerify(req(authA, { idkitResult: new FakeHuman().prove(wr) }), v.ventureId);
    const detail = await (await api.getVenture(req(authA), v.ventureId)).json();
    const seatA = detail.venture.seats.find((s: { wallet: string }) => s.wallet === lower(A.address));
    const seatB = detail.venture.seats.find((s: { wallet: string }) => s.wallet === lower(B.address));
    expect(seatA.worldEnvironment).toBe("staging");
    expect(seatB.worldEnvironment).toBeUndefined(); // not verified yet → absent, never guessed
    expect(detail.venture.listing.listed).toBe(false);
    expect(detail.venture.listing.consents.every((c: { listed: boolean }) => !c.listed)).toBe(true);
    await api.setListing(req(authB, { listed: true }), v.ventureId);
    const l = (await (await api.getVenture(req(authA), v.ventureId)).json()).venture.listing;
    expect(l.listed).toBe(false);
    expect(l.consents).toEqual(expect.arrayContaining([{ wallet: lower(B.address), listed: true }, { wallet: lower(A.address), listed: false }]));
    const pub = await (await api.publicSummary(req(), "northstar-labs.vestige.eth")).json();
    expect(pub.founders.find((f: { wallet: string }) => f.wallet === lower(A.address)).worldEnvironment).toBe("staging");
    const verified = pub.events.find((e: { kind: string }) => e.kind === "founder_verified");
    expect(verified.source).toBe("world-id-staging-4.0");
    for (const e of pub.events) expect(typeof e.source).toBe("string");
    expect(JSON.stringify(pub)).not.toContain("consents"); // consent detail is founders-only
  });
});

describe("reconcileIdentity (resync)", () => {
  it("read-only by default; retry re-runs only never-broadcast steps; agreement + humans records", async () => {
    const { reconcileIdentity } = await import("../../src/modules/identity/scripts/reconcile");
    const h = makeHarness();
    const { a, b, vid } = await twoFounders(h);
    await h.flush();
    // venture name confirmed; now verify both founders while ENS read-back is broken
    h.ens.readBack = false;
    h.ventures.checks.founderName = async () => h.ens.readBack;
    h.ventures.checks.humans = async () => h.ens.readBack;
    for (const w of [a, b]) {
      const r = h.ventures.worldRequest(w, vid);
      await h.ventures.verifyWorld(w, vid, { idkitResult: new FakeHuman().prove(r) });
    }
    await h.flush();
    expect(seatOf(h, vid, a).subnameStatus).toBe("FAILED");
    const sentBefore = h.ens.founders.length;
    let rep = await reconcileIdentity(h);
    expect(rep.mode).toBe("read-only");
    expect(h.ens.founders.length).toBe(sentBefore); // nothing re-broadcast
    expect(rep.stillOpen.some((x) => x.startsWith("ens-founder:"))).toBe(true);
    // a founder step had a tx recorded (memory port returns 0x02) → retry must NOT resend it
    rep = await reconcileIdentity(h, { retry: true });
    expect(rep.needsManualReview.filter((x) => x.includes("tx-recorded")).length).toBe(2);
    expect(h.ens.founders.length).toBe(sentBefore);
    // read-back recovers (tx actually landed) → promoted without any new write
    h.ens.readBack = true;
    rep = await reconcileIdentity(h);
    expect(rep.ensVerifiedByReadback).toBe(2);
    expect(seatOf(h, vid, a).subnameStatus).toBe("VERIFIED");
    expect(h.ens.founders.length).toBe(sentBefore);
  });

  it("attestation that failed before any tx is re-submitted only in retry mode", async () => {
    const { reconcileIdentity } = await import("../../src/modules/identity/scripts/reconcile");
    const h = makeHarness();
    const { a, vid } = await twoFounders(h);
    h.attester.failSubmit = true;
    const r = h.ventures.worldRequest(a, vid);
    await h.ventures.verifyWorld(a, vid, { idkitResult: new FakeHuman().prove(r) });
    h.attester.failSubmit = false;
    await reconcileIdentity(h);
    expect(h.attester.submitted).toHaveLength(0);
    const rep = await reconcileIdentity(h, { retry: true });
    expect(rep.retried.some((x) => x.startsWith("attestation:"))).toBe(true);
    await h.flush();
    expect(seatOf(h, vid, a).onchainSeatStatus).toBe("VERIFIED");
  });
});
