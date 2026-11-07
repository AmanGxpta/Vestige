/**
 * C2 cross-owner compatibility run, against the ACTUAL integrated sources in this tree
 * (main 6aba6ac: C1 + X merged). Not part of the default unit run; see vitest.config.ts here.
 *   C2 live adapter  (src/modules/ui/live-adapter.ts)
 *   C1 handlers      (src/modules/identity, src/modules/agreements) — real auth, ventures, World gate, agreements, listing, public
 *   X  handlers      (src/modules/treasury, src/modules/relayer) — real http/service/store/relayer policy;
 *                    mode "v1" installs X's CR-X-002 candidate projection (readback-payload.mjs), mode "v0" is X's current default
 * One shared SQLite FILE (C1 migrations then X 020). Doubles, labelled:
 *   World portal = C1 FakeWorldPortal (MOCK_ONLY); seat attester = C1 MemoryAttester;
 *   ENS = C1 MemoryEns; X chain IO = in-memory fixture (LOCAL_FIXTURE_CHAIN, no network).
 * Signatures are real (viem throwaway accounts): personal_sign, FoundingTerms, EIP-3009, SafeTx.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { zeroAddress } from "viem";
import { FakeHuman, FakeWorldPortal, MemoryAttester, MemoryEns, makeWorldConfig } from "@/tests/identity/helpers";
import { SqliteDb, migrateIdentity } from "@/src/modules/identity/db";
import { VentureService } from "@/src/modules/identity/ventures";
import { AgreementService } from "@/src/modules/agreements/service";
import { AuthService } from "@/src/modules/identity/auth";
import { handlers as c1handlers } from "@/src/modules/identity/http";
// @ts-ignore X modules are .mjs
import { openTreasuryStore } from "@/src/modules/treasury/store.mjs";
// @ts-ignore
import { TreasuryService } from "@/src/modules/treasury/service.mjs";
// @ts-ignore
import { createTreasuryHandlers } from "@/src/modules/treasury/http.mjs";
// @ts-ignore
import { validateManifest as xValidate } from "@/src/modules/treasury/manifest.mjs";
// @ts-ignore
import { RestrictedRelayer } from "@/src/modules/relayer/relayer.mjs";
// @ts-ignore
import { MemoryJournal } from "@/tests/treasury/fixtures.mjs";
// @ts-ignore
import { paymentCreatedV1, treasuryReadV1 } from "@/src/modules/treasury/readback-payload.mjs";
import { createLiveAdapter } from "@/src/modules/ui/live-adapter";
import { previewTerms } from "@/src/modules/ui/agreement/terms";
import { validateManifest as c2Validate } from "@/src/modules/public-view/manifest";

const ORIGIN = "http://localhost:3200";
const USDT = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const H = (c: string) => `0x${c.repeat(64)}` as `0x${string}`;
const log: string[] = [];

function manifestFor(ventureId: string, ensName: string, owners: [string, string]) {
  const art = (address: string, c: string) => ({ address, deploymentTxHash: H("5"), deploymentBlock: 7, runtimeCodeHash: H(c), abiPath: "contracts/abi/SeatRegistry.json", abiSha256: "a".repeat(64) });
  return {
    schemaVersion: 1, network: "whitechain-sepolia", chainId: 1874, deploymentBlock: 7, sourceCommit: "a".repeat(40),
    explorerBaseUrl: "https://explorer.testnet.whitechain.io", ventureId, ensName, owners, threshold: 2, setupInitializerHash: H("6"), approvedAt: "2026-11-07T00:00:00.000Z",
    contracts: {
      safe: art(addr(200), "1"), guard: art(addr(300), "2"), registry: art(addr(400), "3"),
      singleton: art("0x29fcB43b46531BcA003ddC8FCB67FFE91900C762", "4"), factory: art("0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", "5"),
      setup: art(addr(500), "6"),
      token: { ...art(USDT, "7"), decimals: 6, domainSeparator: H("8"), implementation: art(addr(600), "9"), eip712Domain: { name: "Tether USD", version: "1", chainId: 1874, verifyingContract: USDT } },
    },
  };
}

function relayFor(ventureId: string, owners: string[]) {
  const manifest = { ventureId, safe: addr(200), guard: addr(300), registry: addr(400), singleton: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" };
  const token = { address: USDT, domain: { name: "Tether USD", version: "1", chainId: 1874, verifyingContract: USDT } };
  const chain = { chainId: 1874, owners, seats: [true, true], threshold: 2, guard: manifest.guard, registry: manifest.registry, ventureId, modules: [], handler: zeroAddress,
    singleton: manifest.singleton, fingerprintsVerified: true, attester: addr(888), nonce: 0n, blockNumber: 12345n, blockHash: H("6") };
  const sends: unknown[] = [];
  const io = { sender: addr(999), snapshot: async () => chain, gasPrice: async () => 1n, estimate: async () => 100000n, balance: async () => 10n ** 18n,
    simulate: async () => true, send: async (c: unknown) => { sends.push(c); return H("c"); }, senderNonce: async () => 0,
    quoteL1: async () => ({ l1Fee: 1n, blockNumber: 10n, blockHash: H("6"), at: Math.floor(Date.now() / 1000) * 1000 }),
    confirm: async () => ({ verified: true, blockNumber: 10n, blockHash: H("6"), fee: { evm: 100n, l1: 1n } }) };
  const limits = { dailyBudgetWei: 10n ** 18n, maxGas: 500000n, maxGasPrice: 10n ** 9n, l1FeeReserveWei: 10000n, minBalanceWei: 1000n, maxPerMinute: 10 };
  const relay = new RestrictedRelayer({ manifests: [manifest], token, io, journal: new MemoryJournal(), limits, enabled: true, safety: { ready: async () => {}, notify: async () => {} } });
  return { relay, sends, chain };
}

for (const mode of ["v0", "v1"] as const) describe(`cross-owner (${mode === "v0" ? "X default v0 readback" : "X CR-X-002 candidate readback"})`, () => {
  it("journey with real handlers and shared SQLite", async () => {
    log.length = 0;
    log.push(`mode=${mode}`);
    const dbPath = join(mkdtempSync(join(tmpdir(), "vestige-xo-")), "vestige.db");
    const db = new SqliteDb(dbPath);
    migrateIdentity(db);
    const portal = new FakeWorldPortal(), attester = new MemoryAttester(), ens = new MemoryEns();
    const tasks: Promise<void>[] = [];
    const defer = (t: () => Promise<void>) => void tasks.push(t());
    const flush = async () => { while (tasks.length) await tasks.shift(); };
    const ventures = new VentureService({ db, world: makeWorldConfig(), attester, ens, fetchImpl: portal.fetch, defer });
    ventures.checks = { ventureName: async (_n: string, id: string) => ens.ventureIds.includes(id as `0x${string}`), founderName: async () => true, humans: async () => true };
    const agreements = new AgreementService(db, ventures, ens, { defer, checkAgreementRecord: async () => true });
    const auth = new AuthService(db, { domain: "localhost:3200", uri: ORIGIN });
    const C1 = c1handlers({ db, auth, ventures, agreements });
    const store = openTreasuryStore(dbPath); // X migration 020 on the same file (FKs to identity_ventures)
    let X: ReturnType<typeof createTreasuryHandlers> | null = null;
    let service: any = null;

    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), ORIGIN);
      const headers = new Headers(init?.headers);
      const m = (init?.method ?? "GET").toUpperCase();
      if (m !== "GET") headers.set("origin", ORIGIN); // a browser sends this on same-origin POST/DELETE
      const req = new Request(url, { method: m, headers, body: init?.body as BodyInit | undefined });
      const p = url.pathname;
      let x: RegExpMatchArray | null;
      if (p === "/api/identity/auth/challenge" && m === "POST") return C1.authChallenge(req);
      if (p === "/api/identity/auth/session") return m === "POST" ? C1.authSession(req) : C1.authLogout(req);
      if (p === "/api/identity/ventures") return m === "POST" ? C1.createVenture(req) : C1.listVentures(req);
      if ((x = p.match(/^\/api\/identity\/ventures\/(0x[0-9a-f]{64})$/))) return C1.getVenture(req, x[1]);
      if ((x = p.match(/^\/api\/identity\/ventures\/(0x[0-9a-f]{64})\/(invites|join|listing|world\/request|world\/verify)$/))) {
        const k = x[2];
        return k === "invites" ? C1.createInvite(req, x[1]) : k === "join" ? C1.join(req, x[1]) : k === "listing" ? C1.setListing(req, x[1]) : k === "world/request" ? C1.worldRequest(req, x[1]) : C1.worldVerify(req, x[1]);
      }
      if ((x = p.match(/^\/api\/agreements\/ventures\/(0x[0-9a-f]{64})\/versions$/))) return C1.createAgreementVersion(req, x[1]);
      if ((x = p.match(/^\/api\/agreements\/ventures\/(0x[0-9a-f]{64})\/sign$/))) return m === "GET" ? C1.signingPayload(req, x[1]) : C1.signAgreement(req, x[1]);
      if ((x = p.match(/^\/api\/identity\/public\/(.+)$/))) return C1.publicSummary(req, x[1]);
      if ((x = p.match(/^\/api\/treasury\/ventures\/(0x[0-9a-f]{64})(?:\/(deploy|fund|payments)(?:\/([0-9a-f-]{36})\/(sign|execute))?)?$/))) {
        if (!X) return new Response(JSON.stringify({ error: { code: "TREASURY_UNCONFIGURED", message: "Treasury configuration is incomplete." } }), { status: 503, headers: { "content-type": "application/json" } });
        const action = !x[2] ? "read" : x[4] ?? x[2];
        return X.handle(req, action, { id: x[1], pid: x[3] });
      }
      return new Response("<html>404</html>", { status: 404, headers: { "content-type": "text/html" } });
    }) as typeof fetch;

    const A = privateKeyToAccount(generatePrivateKey()), B = privateKeyToAccount(generatePrivateKey()), F = privateKeyToAccount(generatePrivateKey());
    let manifest: any = null;
    // CR-C2-008: the adapter asks for the manifest of a specific ENS name.
    const mk = () => createLiveAdapter({ fetchImpl, usdtAddress: USDT, getManifest: async (n?: string) => (manifest && (n === undefined || manifest.ensName === n) ? manifest : null) });
    const ca = mk(), cb = mk(), cf = mk();
    const must = <T,>(r: { ok: boolean; value?: T; error?: unknown }, what: string): T => { if (!r.ok) throw new Error(`${what}: ${JSON.stringify(r.error)}`); return r.value as T; };

    // 1. Sign-in (real challenge, real personal_sign, 43-char bearer)
    for (const [c, w] of [[ca, A], [cb, B], [cf, F]] as const) must(await c.signIn(w.address, (msg) => w.signMessage({ message: msg })), "signIn");
    log.push("1 sign-in A/B/F via C1 challenge+session: ok");

    // 2. Create / invite / join
    const v = must(await ca.createVenture({ displayName: "Northstar Labs", slug: "northstar", founderLabel: "asha", wallet: A.address }), "create");
    const id = v.ventureId;
    const { inviteCode } = must(await ca.createInvite(id, { wallet: A.address }), "invite");
    must(await cb.joinVenture(id, { inviteCode, founderLabel: "ravi", wallet: B.address }), "join");
    const reuse = await cf.joinVenture(id, { inviteCode, founderLabel: "eve", wallet: F.address });
    expect(reuse.ok).toBe(false);
    log.push(`2 create ${v.ensName} ${id.slice(0, 10)}…, invite, join: ok; reused invite → ${!reuse.ok && reuse.error.code}`);

    // 3. Listing consent: C1 listing.consents mapped exactly
    must(await ca.setListing(id, { listed: true, wallet: A.address }), "listing A");
    expect(must(await ca.listVentures(), "list")).toHaveLength(0);
    const afterB = must(await cb.setListing(id, { listed: true, wallet: B.address }), "listing B");
    expect(afterB.listing?.listed).toBe(true);
    expect(afterB.listing?.consents.every((c) => c.listed)).toBe(true);
    const list = must(await cf.listVentures(), "list2");
    expect(list).toHaveLength(1);
    expect(list[0].treasuryActive).toBeNull();
    log.push(`3 listing: A only → 0 listed; A+B → 1 listed; consents=${JSON.stringify(afterB.listing?.consents.map((c) => c.listed))}; treasuryActive=${list[0].treasuryActive} (CR-ID-05 not registered → null)`);

    // 4. World (FakeWorldPortal = MOCK_ONLY), duplicate refusal, attestation via MemoryAttester
    const h1 = new FakeHuman();
    const ra = must(await ca.requestWorld(id, { wallet: A.address }), "worldReq A");
    if (ra.kind !== "idkit") throw new Error("kind");
    must(await ca.verifyWorld(id, { wallet: A.address, proof: { kind: "idkit", result: h1.prove(ra.params as never) } }), "verify A");
    const rb = must(await cb.requestWorld(id, { wallet: B.address }), "worldReq B");
    if (rb.kind !== "idkit") throw new Error("kind");
    const dup = await cb.verifyWorld(id, { wallet: B.address, proof: { kind: "idkit", result: h1.prove(rb.params as never) } });
    expect(!dup.ok && dup.error.code).toBe("DUPLICATE_HUMAN");
    const rb2 = must(await cb.requestWorld(id, { wallet: B.address }), "worldReq B2");
    if (rb2.kind !== "idkit") throw new Error("kind");
    must(await cb.verifyWorld(id, { wallet: B.address, proof: { kind: "idkit", result: new FakeHuman().prove(rb2.params as never) } }), "verify B");
    await flush();
    const vv = must(await ca.getVenture(id, A.address), "get");
    expect(vv.seats.every((s) => s.worldProofStatus === "VERIFIED" && s.onchainSeatStatus === "VERIFIED")).toBe(true);
    // CR-C2-006 (D-025): staging seats carry worldEnvironment → UI shows TESTED_IN_SIMULATOR, never production uniqueness.
    expect(vv.seats.every((s) => s.worldEnvironment === "staging")).toBe(true);
    log.push(`4 World (MOCK portal, env=${ra.params.environment}): dup → "${!dup.ok && dup.error.message}"; seats ${vv.seats.map((s) => `${s.worldProofStatus}/${s.onchainSeatStatus}/${s.worldEnvironment}`).join(",")} (CR-C2-006 delivered)`);

    // 5. Terms: exact hash, server-issued nonces, both sign, reset on v2
    const terms = { effectiveDate: "2026-11-07", decisionRule: "Both founders approve every payment.", notes: "Café", founders: [
      { wallet: A.address, role: "CEO", contribution: "Product", ownershipBps: 6000, vestingIntent: "4y" },
      { wallet: B.address, role: "COO", contribution: "GTM", ownershipBps: 4000, vestingIntent: "4y" } ] };
    const pv = previewTerms(id, vv.seats.map((s) => s.wallet), terms);
    if (!pv.ok) throw new Error("preview");
    const t1 = must(await ca.createAgreementVersion(id, { terms, wallet: A.address }), "v1");
    expect(t1.agreement!.docHash).toBe(pv.hash);
    expect(t1.agreement!.canonicalJson).toBe(pv.json);
    must(await ca.signAgreement(id, { version: 1, docHash: pv.hash, wallet: A.address }, (td) => A.signTypedData(td as never)), "sign A");
    const s2 = must(await cb.signAgreement(id, { version: 1, docHash: pv.hash, wallet: B.address }, (td) => B.signTypedData(td as never)), "sign B");
    expect(s2.agreement!.complete).toBe(true);
    const t2 = must(await cb.createAgreementVersion(id, { terms: { ...terms, decisionRule: "Unanimous." }, wallet: B.address }), "v2");
    expect(t2.agreement!.signatures).toHaveLength(0);
    const stale = await ca.signAgreement(id, { version: 1, docHash: pv.hash, wallet: A.address }, (td) => A.signTypedData(td as never));
    expect(!stale.ok && stale.error.code).toBe("VERSION_SUPERSEDED");
    log.push(`5 terms: C2 preview == C1 docHash ${pv.hash}; v1 complete; v2 reset (0 sigs); stale v1 → ${!stale.ok && stale.error.code}`);

    // 6. Treasury: unconfigured → BLOCKED; no manifest → UNKNOWN; manifest → ACTIVE (fixture chain)
    const blocked = await ca.getTreasury(id);
    expect(!blocked.ok && blocked.error.code).toBe("BLOCKED");
    const { relay, sends, chain } = relayFor(id, [A.address, B.address]);
    service = new TreasuryService({ store, relay, manifests: [], readConfirmedSeats: async () => true });
    if (mode === "v1") {
      // Install X's CR-X-002 candidate exactly as X ships it (not yet the runtime default).
      const mutate = service.mutate.bind(service);
      service.read = (id: string, actor: string | null) => treasuryReadV1(service, id, actor);
      service.mutate = async (action: string, args: unknown) => {
        const r = await mutate(action, args);
        return action === "payments" ? paymentCreatedV1(r) : r;
      };
    }
    X = createTreasuryHandlers(service, { authURI: ORIGIN });
    const unknown = must(await ca.getTreasury(id), "read unknown");
    expect(unknown.treasury).toBeUndefined();
    manifest = manifestFor(id, v.ensName, [A.address, B.address]);
    expect(xValidate(structuredClone(manifest))).toBeTruthy();
    expect(c2Validate(manifest)).toEqual([]);
    for (const bad of [{ ...manifest, sourceCommit: "abc1234" }, { ...manifest, deploymentBlock: 8 }, { ...manifest, extra: 1 }]) {
      let xOk = true; try { xValidate(structuredClone(bad)); } catch { xOk = false; }
      expect(xOk).toBe(false);
      expect(c2Validate(bad).length).toBeGreaterThan(0);
    }
    service.manifests = [manifest];
    const active = must(await ca.getTreasury(id), "read active");
    expect(active.treasury?.verificationStatus).toBe("ACTIVE");
    expect(active.treasury?.safeAddress.toLowerCase()).toBe(addr(200));
    expect(active.balanceRaw).toBeUndefined();
    log.push(`6 treasury: unconfigured → BLOCKED; no manifest → treasury undefined (UNKNOWN); manifest → ${active.treasury?.verificationStatus} (LOCAL_FIXTURE_CHAIN) worldSource=${active.worldSource} block=${active.readAtBlock}; X & C2 manifest validators agree on 1 valid + 3 invalid`);

    const dep = await ca.deployTreasury(id, { wallet: A.address });
    expect(!dep.ok && dep.error.code).toBe("NOT_READY");
    log.push(`6b deploy → ${!dep.ok && dep.error.message} [${!dep.ok && dep.error.detail}]`);

    // 7. Funding: C2-built EIP-3009 typed data accepted by X's recovery + relay policy
    const fund = await cf.fundTreasury(id, { from: F.address, to: addr(200), amountRaw: "1000000000", ensName: v.ensName }, (td) => F.signTypedData(td as never));
    expect(fund.ok).toBe(true);
    expect(sends.length).toBe(1);
    log.push(`7 fund 1,000 USDT: X recovered C2's EIP-3009 signature and relayed via fixture IO (sends=${sends.length}); readback deposits=${fund.ok ? fund.value.deposits.length : "-"} depositsStatus=${fund.ok ? (fund.value.depositsStatus ?? "n/a (v0)") : "-"} (UI reads balance/deposits from chain)`);

    // 8. Payment: propose → A signs → 1-of-2 execute refused; then (v1) B approves after a reload
    const prop = must(await ca.proposePayment(id, { recipient: addr(700), amountRaw: "500000000", reason: "design", wallet: A.address }), "propose");
    const pid = prop.payments[0].paymentId;
    expect(prop.approvalsReported).toBe(mode === "v1"); // v0 rows carry no signerWallets
    if (mode === "v1") expect(prop.payments[0].safeTypedData).toBeTruthy(); // reloadable from the readback itself
    must(await ca.signPayment(id, pid, { wallet: A.address }, (td) => A.signTypedData(td as never)), "sign A");
    const one = await ca.executePayment(id, pid, { wallet: A.address });
    expect(!one.ok && one.error.code).toBe("RELAYER_REFUSED");
    expect(sends.length).toBe(1);
    log.push(`8 execute with 1 of 2 approvals → ${!one.ok && one.error.code} "${!one.ok && one.error.message}" (no send)`);
    if (mode === "v0") {
      const bTry = await cb.signPayment(id, pid, { wallet: B.address }, (td) => B.signTypedData(td as never));
      expect(!bTry.ok && bTry.error.code).toBe("BLOCKED");
      log.push(`8a v0: founder B (other browser) → ${!bTry.ok && bTry.error.code} — readback carries no payload (CR-X-002 not yet the default)`);
      console.log(log.join("\n"));
      return;
    }
    // v1: founder B reloads in a FRESH adapter (no tab cache) and approves from the readback alone.
    const cbFresh = mk();
    must(await cbFresh.signIn(B.address, (msg) => B.signMessage({ message: msg })), "signIn B fresh");
    const before = must(await cbFresh.getTreasury(id), "reload B");
    expect(before.schemaVersion).toBe(1);
    expect(before.payments[0].signerWallets.map((w) => w.toLowerCase())).toEqual([A.address.toLowerCase()]);
    must(await cbFresh.signPayment(id, pid, { wallet: B.address }, (td) => B.signTypedData(td as never)), "sign B (reloaded)");
    const ready = must(await cbFresh.getTreasury(id), "ready");
    expect(ready.payments[0].status).toBe("READY");
    expect(ready.payments[0].signerWallets).toHaveLength(2);
    const ex = must(await cbFresh.executePayment(id, pid, { wallet: B.address }), "execute");
    expect(sends.length).toBe(2);
    log.push(`8b v1: fresh founder-B adapter reloads safeTypedData + signerWallets, approves, READY 2/2, execute relays (sends=${sends.length}) → ${ex.payments[0]?.status}; stale/terminal safeTypedData=${ex.payments[0]?.safeTypedData === undefined ? "null (unsignable)" : "present"}`);
    // Public (no bearer) readers get chain facts but no payments.
    const anon = must(await createLiveAdapter({ fetchImpl }).getTreasury(id), "anon read");
    expect(anon.payments).toHaveLength(0);
    expect(anon.balanceRaw).toBeUndefined(); // no read port registered → unknown, never zero
    expect(anon.depositsStatus).toBe("UNKNOWN");
    log.push(`8c v1 public read: payments=${anon.payments.length}, balance=${anon.balanceRaw ?? "unknown"}, depositsStatus=${anon.depositsStatus}, evidence=${anon.evidence?.length ?? 0} (no mined GS020)`);

    // 9. Public summary + logout
    const pub = must(await createLiveAdapter({ fetchImpl }).getPublicEvidence(v.ensName), "public");
    expect(pub.ventureId).toBe(id);
    expect(pub.founders.every((f) => f.worldEnvironment === "staging")).toBe(true);
    const humanEvents = pub.evidence.filter((e) => e.label === "HUMAN_VERIFIED" && e.kind === "FOUNDER_VERIFIED");
    expect(humanEvents.length).toBeGreaterThan(0);
    expect(humanEvents.every((e) => e.qualifier === "TESTED_IN_SIMULATOR")).toBe(true);
    await ca.signOut();
    expect(ca.sessionWallet()).toBeNull();
    const afterLogout = await createLiveAdapter({ fetchImpl }).getVenture(id);
    expect(afterLogout.ok).toBe(false);
    log.push(`9 public summary humans=${pub.humansVerified} (env=${pub.founders.map((f) => f.worldEnvironment).join("/")}), FOUNDER_VERIFIED events qualified TESTED_IN_SIMULATOR=${humanEvents.length}; logout DELETE → 204 and session cleared`);
    void chain;
    console.log(log.join("\n"));
  });
});
