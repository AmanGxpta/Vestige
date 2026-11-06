/**
 * Live adapter refusal rules against a FAKE fetch returning C1-shaped JSON
 * (shapes from agent/identity@1b502e6). The full journey against C1's real
 * handlers is recorded in docs/agent-reports/product/2026-11-07-c2-live-vs-c1.txt.
 */
import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createLiveAdapter, toTreasuryState } from "./live-adapter";

const acct = privateKeyToAccount(generatePrivateKey());
const VID = `0x${"ab".repeat(32)}` as const;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fake(routes: Record<string, (body: unknown, url: URL) => Response>) {
  const seen: { method: string; path: string; auth?: string | null }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://x");
    const method = init?.method ?? "GET";
    seen.push({ method, path: url.pathname, auth: new Headers(init?.headers).get("authorization") });
    const h = routes[`${method} ${url.pathname}`];
    if (!h) return new Response("<html>404</html>", { status: 404, headers: { "content-type": "text/html" } });
    return h(init?.body ? JSON.parse(String(init.body)) : undefined, url);
  }) as typeof fetch;
  return { f, seen };
}

const session = (wallet = acct.address) => ({
  "POST /api/identity/auth/challenge": () =>
    json(201, { nonce: "n1", message: `x wants you to sign in with your Ethereum account:\n${wallet}\n\nChain ID: 11155111\nNonce: n1`, expiresAt: "2099-01-01T00:00:00Z" }),
  "POST /api/identity/auth/session": () => json(201, { token: "t".repeat(43), wallet: wallet.toLowerCase(), expiresAt: "2099-01-01T00:00:00Z" }),
});

async function signedIn(routes: Record<string, (body: unknown, url: URL) => Response> = {}) {
  const fk = fake({ ...session(), ...routes });
  const c = createLiveAdapter({ fetchImpl: fk.f });
  const r = await c.signIn(acct.address, (m) => acct.signMessage({ message: m }));
  expect(r.ok).toBe(true);
  return { c, ...fk };
}

describe("live adapter", () => {
  it("an absent route (HTML 404 / 405) is BLOCKED, never success", async () => {
    const { f } = fake({});
    const r = await createLiveAdapter({ fetchImpl: f }).listVentures();
    expect(r).toMatchObject({ ok: false, error: { code: "BLOCKED" } });
  });

  it("maps C1 error codes and clears the session on UNAUTHENTICATED", async () => {
    const { c } = await signedIn({ [`GET /api/identity/ventures/${VID}`]: () => json(401, { error: { code: "UNAUTHENTICATED", message: "Session expired. Sign in again." } }) });
    const r = await c.getVenture(VID, acct.address);
    expect(r).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED", message: "Session expired. Sign in again." } });
    expect(c.sessionWallet()).toBeNull();
  });

  it("refuses to sign a sign-in challenge that names another wallet", async () => {
    const other = privateKeyToAccount(generatePrivateKey()).address;
    const { f } = fake(session(other));
    let asked = false;
    const r = await createLiveAdapter({ fetchImpl: f }).signIn(acct.address, async () => {
      asked = true;
      return "0x";
    });
    expect(r.ok).toBe(false);
    expect(asked).toBe(false);
  });

  it("bearer token is sent only as Authorization and never in the URL", async () => {
    const { c, seen } = await signedIn({ [`POST /api/identity/ventures/${VID}/invites`]: () => json(201, { inviteToken: "inv" }) });
    await c.createInvite(VID, { wallet: acct.address });
    const call = seen.find((s) => s.path.endsWith("/invites"))!;
    expect(call.auth).toBe(`Bearer ${"t".repeat(43)}`);
    expect(seen.every((s) => !s.path.includes("t".repeat(43)))).toBe(true);
  });

  it("a different connected wallet than the session is refused locally", async () => {
    const { c } = await signedIn();
    const r = await c.getVenture(VID, privateKeyToAccount(generatePrivateKey()).address);
    expect(r).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });

  it("refuses World params for another venture or wallet before opening IDKit", async () => {
    const params = { app_id: "app_x", action: `vestige-founder-seat:${VID}`, environment: "staging", signal: acct.address, allow_legacy_proofs: false, preset: "proofOfHuman", rp_context: { rp_id: "rp", nonce: "n", created_at: 1, expires_at: 2, signature: "0x1" } };
    const okC = await signedIn({ [`POST /api/identity/ventures/${VID}/world/request`]: () => json(200, params) });
    expect(await okC.c.requestWorld(VID, { wallet: acct.address })).toMatchObject({ ok: true, value: { kind: "idkit" } });
    const badAction = await signedIn({ [`POST /api/identity/ventures/${VID}/world/request`]: () => json(200, { ...params, action: "vestige-founder-seat:0x00" }) });
    expect((await badAction.c.requestWorld(VID, { wallet: acct.address })).ok).toBe(false);
    const badSignal = await signedIn({ [`POST /api/identity/ventures/${VID}/world/request`]: () => json(200, { ...params, signal: "0x0000000000000000000000000000000000000001" }) });
    expect((await badSignal.c.requestWorld(VID, { wallet: acct.address })).ok).toBe(false);
  });

  it("refuses a FoundingTerms payload with a foreign domain, without calling the wallet", async () => {
    const doc = `0x${"ef".repeat(32)}` as const;
    const payload = (domain: Record<string, unknown>) => ({
      domain,
      types: { FoundingTerms: [{ name: "ventureId", type: "bytes32" }] },
      primaryType: "FoundingTerms",
      message: { ventureId: VID, agreementId: VID, version: "1", docHash: doc, nonce: "1", expiry: "9999999999" },
    });
    for (const domain of [
      { name: "vestige", version: "1", chainId: 1874 },
      { name: "vestige", version: "1", chainId: 11155111, verifyingContract: "0x0000000000000000000000000000000000000001" },
      { name: "evil", version: "1", chainId: 11155111 },
    ]) {
      const { c } = await signedIn({ [`GET /api/agreements/ventures/${VID}/sign`]: () => json(200, payload(domain)) });
      let asked = false;
      const r = await c.signAgreement(VID, { version: 1, docHash: doc, wallet: acct.address }, async () => {
        asked = true;
        return "0x";
      });
      expect(r.ok).toBe(false);
      expect(asked).toBe(false);
    }
  });

  it("listVentures never turns unknown treasury/funding into true/false", async () => {
    const { f } = fake({
      "GET /api/identity/ventures": () =>
        json(200, [{ ventureId: VID, displayName: "N", ensName: "n.vestige.eth", humansVerified: 2, termsSigned: true, treasuryActive: null, funded: null, observedAt: "2026-11-07T00:00:00Z" }]),
    });
    const r = await createLiveAdapter({ fetchImpl: f }).listVentures();
    expect(r).toMatchObject({ ok: true, value: [{ treasuryActive: null, funded: null, source: "API" }] });
  });

  it("treasury readback with an unrecognised status stays UNKNOWN, never ACTIVE", () => {
    const s = toTreasuryState({ treasury: { safeAddress: "0x4444444444444444444444444444444444444444", verificationStatus: "VERIFIED" }, payments: [] });
    expect(s.treasury?.verificationStatus).toBe("UNKNOWN");
  });

  it("funding checks the treasury route BEFORE asking for a signature", async () => {
    const { c } = await signedIn();
    let asked = false;
    const r = await c.fundTreasury(VID, { from: acct.address, to: "0x4444444444444444444444444444444444444444", amountRaw: "1" }, async () => {
      asked = true;
      return "0x";
    });
    expect(r).toMatchObject({ ok: false, error: { code: "BLOCKED" } });
    expect(asked).toBe(false);
  });
});
