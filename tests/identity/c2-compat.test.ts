/**
 * Cross-owner compatibility evidence: C2's COMMITTED live adapter + canonicalizer
 * (read-only import from the product worktree) driven against C1's CURRENT handlers.
 * Opt-in: C2_ROOT=/path/to/vestige-product npx vitest run --config vitest.config.ts c2-compat
 * DEV MOCK World portal / attester / ENS (helpers.ts): proves API compatibility only.
 */
import { describe, expect, it } from "vitest";
import { canonicalize as c1Canonicalize } from "../../src/modules/agreements/canonical";
import { handlers } from "../../src/modules/identity/http";
import { FakeHuman, lower, makeHarness, newWallet } from "./helpers";
import { buildVectors, INVALID, SPECIAL } from "./vectors/build-canonical-vectors";

const C2 = process.env.C2_ROOT;

describe.skipIf(!C2)("C2 live adapter ↔ C1 handlers (current)", () => {
  it("canonical JSON: C2 canonicalize reproduces every C1 vector byte-for-byte", async () => {
    const t = await import(/* @vite-ignore */ `${C2}/src/modules/ui/agreement/terms.ts`);
    const v = buildVectors();
    const mismatches: string[] = [];
    const run = (f: () => string) => { try { return f(); } catch { return "<threw>"; } };
    for (const x of v.valid) if (run(() => t.canonicalize(x.input)) !== x.canonical) mismatches.push(`valid:${x.name}`);
    for (const x of SPECIAL) if (run(() => t.canonicalize((0, eval)(x.js))) !== x.canonical) mismatches.push(`special:${x.name}`);
    for (const x of INVALID) if (run(() => t.canonicalize((0, eval)(x.js))) !== "<threw>") mismatches.push(`invalid-accepted:${x.name}`);
    console.log(`C2 canonicalize vs C1 vectors: ${v.valid.length + SPECIAL.length + INVALID.length - mismatches.length}/${v.valid.length + SPECIAL.length + INVALID.length} agree; mismatches=${JSON.stringify(mismatches)}`);
    expect(mismatches).toEqual([]);
    // the exact founding-terms document
    expect(t.docHashOf(c1Canonicalize(JSON.parse(v.foundingTerms.canonical)))).toBe(v.foundingTerms.docHash);
  });

  it("full founder journey through C2's adapter", async () => {
    const { createLiveAdapter } = await import(/* @vite-ignore */ `${C2}/src/modules/ui/live-adapter.ts`);
    const h = makeHarness();
    const api = handlers(h);
    let lastWorldRequest: any = null;
    const route = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const u = new URL(String(input), "https://vestige.test");
      const req = new Request(u, { method: init?.method ?? "GET", headers: init?.headers, body: init?.body ?? undefined });
      const p = u.pathname;
      let m: RegExpExecArray | null;
      if (p === "/api/identity/auth/challenge") return api.authChallenge(req);
      if (p === "/api/identity/auth/session") return req.method === "DELETE" ? api.authLogout(req) : api.authSession(req);
      if (p === "/api/identity/ventures") return req.method === "GET" ? api.listVentures(req) : api.createVenture(req);
      if ((m = /^\/api\/identity\/ventures\/(0x[0-9a-f]{64})$/.exec(p))) return api.getVenture(req, m[1]!);
      if ((m = /^\/api\/identity\/ventures\/(0x[0-9a-f]{64})\/invites$/.exec(p))) return api.createInvite(req, m[1]!);
      if ((m = /^\/api\/identity\/ventures\/(0x[0-9a-f]{64})\/join$/.exec(p))) return api.join(req, m[1]!);
      if ((m = /^\/api\/identity\/ventures\/(0x[0-9a-f]{64})\/listing$/.exec(p))) return api.setListing(req, m[1]!);
      if ((m = /^\/api\/identity\/ventures\/(0x[0-9a-f]{64})\/world\/request$/.exec(p))) {
        const r = await api.worldRequest(req, m[1]!);
        lastWorldRequest = await r.clone().json();
        return r;
      }
      if ((m = /^\/api\/identity\/ventures\/(0x[0-9a-f]{64})\/world\/verify$/.exec(p))) return api.worldVerify(req, m[1]!);
      if ((m = /^\/api\/identity\/public\/(.+)$/.exec(p))) return api.publicSummary(req, m[1]!);
      if ((m = /^\/api\/agreements\/ventures\/(0x[0-9a-f]{64})\/versions$/.exec(p))) return api.createAgreementVersion(req, m[1]!);
      if ((m = /^\/api\/agreements\/ventures\/(0x[0-9a-f]{64})\/sign$/.exec(p))) return req.method === "GET" ? api.signingPayload(req, m[1]!) : api.signAgreement(req, m[1]!);
      return new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    };
    const A = newWallet(), B = newWallet();
    const ca = createLiveAdapter({ baseUrl: "https://vestige.test", fetchImpl: route as typeof fetch, now: () => h.clock.now() });
    const cb = createLiveAdapter({ baseUrl: "https://vestige.test", fetchImpl: route as typeof fetch, now: () => h.clock.now() });
    const log: string[] = [];
    const must = <T,>(r: { ok: boolean; value?: T; error?: unknown }, what: string): T => {
      if (!r.ok) throw new Error(`${what}: ${JSON.stringify(r.error)}`);
      log.push(`${what} ok`);
      return r.value as T;
    };
    must(await ca.signIn(A.address, (m: string) => A.signMessage({ message: m })), "signIn A");
    must(await cb.signIn(B.address, (m: string) => B.signMessage({ message: m })), "signIn B");
    const v: any = must(await ca.createVenture({ displayName: "Northstar Labs", slug: "northstar", founderLabel: "ada", wallet: A.address }), "createVenture");
    const vid = v.ventureId ?? v.venture?.ventureId;
    expect(vid).toMatch(/^0x[0-9a-f]{64}$/);
    const inv: any = must(await ca.createInvite(vid, { wallet: A.address }), "createInvite");
    must(await cb.joinVenture(vid, { inviteCode: inv.inviteCode, founderLabel: "bob", wallet: B.address }), "joinVenture");
    const humans = [new FakeHuman(), new FakeHuman()];
    for (const [i, [c, w]] of ([[ca, A], [cb, B]] as const).entries()) {
      must(await c.requestWorld(vid, { wallet: w.address }), `requestWorld ${i}`);
      must(await c.verifyWorld(vid, { wallet: w.address, proof: { kind: "idkit", result: humans[i]!.prove(lastWorldRequest) } }), `verifyWorld ${i}`);
    }
    await h.flush();
    const detail: any = must(await ca.getVenture(vid, A.address), "getVenture");
    const s = JSON.stringify(detail);
    expect(s).toContain("staging"); // CR-C2-006 provenance reaches C2's mapped model
    must(await ca.setListing(vid, { listed: true, wallet: A.address }), "setListing A");
    const afterA: any = must(await ca.getVenture(vid, A.address), "getVenture after consent");
    expect(afterA.listing).toEqual({ listed: false, consents: expect.arrayContaining([{ wallet: expect.stringMatching(/^0x/i), listed: true }]) });
    must(await cb.setListing(vid, { listed: true, wallet: B.address }), "setListing B");
    const list: any[] = must(await ca.listVentures(), "listVentures");
    expect(list.length).toBe(1);
    const terms = {
      effectiveDate: "2026-11-07", decisionRule: "Both founders must approve spending.", notes: "",
      founders: [
        { wallet: A.address, role: "CEO", contribution: "Product", ownershipBps: 5000, vestingIntent: "4y, 1y cliff" },
        { wallet: B.address, role: "CTO", contribution: "Engineering", ownershipBps: 5000, vestingIntent: "4y, 1y cliff" },
      ],
    };
    const withTerms: any = must(await ca.createAgreementVersion(vid, { terms, wallet: A.address }), "createAgreementVersion");
    const agreement = withTerms.agreement ?? withTerms;
    const c1Agreement = h.agreements.view(vid, { includeText: false })!;
    expect(JSON.stringify(agreement)).toContain(c1Agreement.docHash);
    for (const [c, w] of [[ca, A], [cb, B]] as const) {
      must(await c.signAgreement(vid, { version: 1, docHash: c1Agreement.docHash, wallet: w.address }, (td: any) => w.signTypedData(td)), `signAgreement ${lower(w.address).slice(0, 6)}`);
    }
    expect(h.agreements.view(vid, { includeText: false })!.complete).toBe(true);
    const pub: any = must(await ca.getPublicEvidence("northstar.vestige.eth"), "getPublicEvidence");
    expect(JSON.stringify(pub)).toContain("staging");
    await ca.signOut();
    const afterOut = await ca.getVenture(vid, A.address);
    expect(afterOut.ok).toBe(false);
    // server-side revocation: the DELETE route was hit (session row gone)
    expect(h.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM identity_sessions WHERE wallet = ?", lower(A.address))!.n).toBe(0);
    console.log(log.join(" | "));
  });
});
