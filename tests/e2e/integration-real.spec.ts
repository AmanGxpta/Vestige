/**
 * INTEGRATION E2E against REAL C1 + X route handlers in one integrated Next app.
 * Runs only when E2E_INTEGRATION_URL is set (H's integrated root, or C2's scratch
 * integration tree). No route fixtures: every /api call hits the real handlers.
 *
 * The browser wallet is an injected EIP-1193 shim whose signatures are REAL: it forwards
 * personal_sign / eth_signTypedData_v4 to throwaway viem accounts in the test process
 * (generated per run, never persisted), so C1 genuinely verifies them.
 * World/ENS/treasury results are whatever the configured server returns — the test asserts
 * the UI shows them honestly (verified, BLOCKED, UNKNOWN), never invents success.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

const BASE = process.env.E2E_INTEGRATION_URL;
test.skip(!BASE, "E2E_INTEGRATION_URL not set (needs the integrated root with C1 + X handlers)");

type TD = { domain: Record<string, unknown>; types: Record<string, { name: string; type: string }[]>; primaryType: string; message: Record<string, unknown> };
function reviveUints(td: TD): TD {
  const walk = (type: string, v: unknown): unknown => {
    if (/^u?int\d*$/.test(type)) return BigInt(v as string);
    const fields = td.types[type];
    if (!fields || typeof v !== "object" || v === null) return v;
    return Object.fromEntries(fields.map((f) => [f.name, walk(f.type, (v as Record<string, unknown>)[f.name])]));
  };
  const { EIP712Domain: _d, ...types } = td.types;
  return { ...td, types, message: walk(td.primaryType, td.message) as Record<string, unknown> };
}

async function realWallet(ctx: BrowserContext, acct: PrivateKeyAccount, chainId = 11155111) {
  await ctx.exposeFunction("__vestigeTestSign", async (method: string, params: unknown[]) => {
    if (method === "personal_sign") return acct.signMessage({ message: { raw: params[0] as `0x${string}` } });
    if (method === "eth_signTypedData_v4") return acct.signTypedData(reviveUints(JSON.parse(params[1] as string)) as never);
    throw new Error(`unsupported ${method}`);
  });
  await ctx.addInitScript(
    ({ account, chainId }) => {
      let chain = chainId;
      const known = new Set([11155111]);
      const listeners: Record<string, ((v: unknown) => void)[]> = {};
      const emit = (e: string, v: unknown) => (listeners[e] ?? []).forEach((l) => l(v));
      const sign = (window as unknown as { __vestigeTestSign: (m: string, p: unknown[]) => Promise<string> }).__vestigeTestSign;
      const provider = {
        on: (e: string, l: (v: unknown) => void) => (listeners[e] ??= []).push(l),
        removeListener: (e: string, l: (v: unknown) => void) => (listeners[e] = (listeners[e] ?? []).filter((x) => x !== l)),
        async request({ method, params }: { method: string; params?: unknown[] }) {
          if (method === "eth_requestAccounts" || method === "eth_accounts") return [account];
          if (method === "eth_chainId") return `0x${chain.toString(16)}`;
          if (method === "wallet_switchEthereumChain") {
            const id = parseInt((params as [{ chainId: string }])[0].chainId, 16);
            if (!known.has(id)) throw Object.assign(new Error("Unrecognized chain"), { code: 4902 });
            chain = id;
            emit("chainChanged", `0x${id.toString(16)}`);
            return null;
          }
          if (method === "wallet_addEthereumChain") {
            const id = parseInt((params as [{ chainId: string }])[0].chainId, 16);
            known.add(id);
            chain = id;
            emit("chainChanged", `0x${id.toString(16)}`);
            return null;
          }
          if (method === "personal_sign" || method === "eth_signTypedData_v4") return sign(method, params ?? []);
          throw new Error(`unsupported ${method}`);
        },
      };
      (window as unknown as { ethereum: unknown }).ethereum = provider;
      window.addEventListener("eip6963:requestProvider", () =>
        window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: "itest", name: "Integration Test Wallet", icon: "", rdns: "test.integration" }, provider } })),
      );
    },
    { account: acct.address, chainId },
  );
}

async function connectAndSignIn(page: Page) {
  await page.getByTestId("wallet-connect").click();
  await page.getByTestId("wallet-chip").click();
  await page.getByTestId("wallet-signin").click();
  await expect(page.getByTestId("wallet-chip")).toContainText("signed in");
  await page.getByTestId("wallet-chip").click();
}

test.use({ baseURL: BASE });

test("integrated: real C1 auth/ventures/invite/listing/World gate + X treasury readback + public page", async ({ browser }) => {
  const A = privateKeyToAccount(generatePrivateKey());
  const B = privateKeyToAccount(generatePrivateKey());
  const slug = `it${Date.now().toString(36)}`;
  const ca = await browser.newContext();
  await realWallet(ca, A);
  const a = await ca.newPage();

  // Founder A: real sign-in → real venture
  await a.goto("/founder");
  await expect(a.getByTestId("banner-devmock")).toHaveCount(0);
  await connectAndSignIn(a);
  await a.getByTestId("venture-name-input").fill("Integration Labs");
  await a.getByTestId("venture-slug-input").fill(slug);
  await a.getByTestId("founder-label-input").fill("asha");
  await a.getByTestId("create-venture-submit").click();
  await expect(a.getByTestId("venture-ens")).toHaveText(`${slug}.vestige.eth`);
  const ventureUrl = a.url();
  expect(ventureUrl).toMatch(/\/founder\/0x[0-9a-f]{64}$/); // server-allocated ventureId
  await a.getByTestId("invite-create").click();
  const invite = await a.getByTestId("invite-url").inputValue();
  expect(invite).toContain("#code=");
  await a.getByTestId("listing-toggle").click();
  await expect(a.getByTestId("card-listing")).toContainText("1 of 1 founders agreed");

  // Founder B: real sign-in → join with the single-use invite
  const cb = await browser.newContext();
  await realWallet(cb, B);
  const b = await cb.newPage();
  await b.goto(invite);
  await connectAndSignIn(b);
  await b.getByTestId("join-label-input").fill("ravi");
  await b.getByTestId("join-submit").click();
  await expect(b).toHaveURL(/\/verify$/);

  // World: whatever the server is configured for is shown honestly
  await b.getByTestId("verify-start").click();
  const worldOutcome = await Promise.race([
    b.getByTestId("idkit-prompt").waitFor().then(() => "IDKIT_OPENED"),
    b.getByTestId("blocked-notice").waitFor().then(() => "BLOCKED"),
    b.getByTestId("error-notice").waitFor().then(() => "ERROR"),
  ]);
  test.info().annotations.push({ type: "world", description: worldOutcome });
  console.log(`[integration] World outcome: ${worldOutcome}: ${await b.getByTestId(worldOutcome === "BLOCKED" ? "blocked-notice" : worldOutcome === "ERROR" ? "error-notice" : "idkit-prompt").innerText()}`);
  if (worldOutcome === "IDKIT_OPENED") {
    await expect(b.getByTestId("idkit-prompt")).toContainText(/staging|World App/i);
    await b.getByTestId("world-cancel").click();
  } else {
    await expect(b.locator('[data-testid=seat-row][data-world="VERIFIED"]')).toHaveCount(0); // no fake verification
  }

  // Both consent → listed (C1 listing.consents). In-app navigation: a full reload would
  // (by contract) drop the memory-only session and show the sign-in prompt instead.
  await b.getByTestId("nav-team").click();
  await b.getByTestId("listing-toggle").click();
  await expect(b.getByTestId("card-listing")).toContainText("2 of 2 founders agreed.");

  // Funder (no wallet) sees the consented summary; treasury unknown, never invented
  const cf = await browser.newContext();
  const f = await cf.newPage();
  await f.goto("/funder");
  const row = f.getByTestId("venture-row").filter({ hasText: "Integration Labs" });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId("badge-treasury")).toHaveAttribute("data-ok", "unknown");

  // Treasury page: X readback (UNKNOWN without manifest) or TREASURY_UNCONFIGURED → never "Active"
  await a.getByTestId("nav-treasury").click();
  await expect(a.getByTestId("card-treasury-setup").or(a.getByTestId("blocked-notice"))).toBeVisible();
  await expect(a.locator('[data-testid=status-pill][data-status="ACTIVE"]')).toHaveCount(0);
  console.log(`[integration] treasury page: ${(await a.locator("main").innerText()).split("\n").filter((l) => /treasury|Not connected|Deploy|Both founders/i.test(l)).slice(0, 4).join(" | ")}`);

  // Public page: real Sepolia ENS (name not yet registered → unresolved) + real C1 off-chain summary
  await f.goto(`/v/${slug}.vestige.eth`);
  await expect(f.getByTestId("public-evidence")).toHaveAttribute("data-phase", "done", { timeout: 45_000 });
  await expect(f.getByTestId("humans-verified")).toContainText("of 2 founders");
  // vestige.eth is registered on Sepolia but this venture's subname is not yet: the wildcard
  // parent resolver must NOT count as "resolved".
  await expect(f.getByTestId("ens-unresolved")).toBeVisible();
  console.log(`[integration] public page: ${await f.getByTestId("humans-verified").innerText()} · ens-unresolved=${await f.getByTestId("ens-unresolved").count()}`);

  // Logout revokes server-side
  await a.getByTestId("wallet-chip").click();
  await a.getByTestId("wallet-disconnect").click();
  await expect(a.getByTestId("wallet-connect")).toBeVisible();
});
