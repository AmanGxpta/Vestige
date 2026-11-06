/**
 * LIVE adapter in a production build (DEV MOCK is impossible there).
 *
 * TEST DOUBLES, clearly: the injected EIP-1193 wallet is a fake (no keys, dummy
 * signatures) and the C1 identity routes in the second test are Playwright route
 * fixtures shaped like agent/identity@1b502e6 responses. This proves the UI's wallet,
 * explicit network switching and refuse/BLOCKED behaviour in a real browser — it is
 * NOT a real-wallet or real-backend test (that remains an H gate).
 */
import { expect, test, type Page } from "@playwright/test";

const FOUNDER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const VID = `0x${"ab".repeat(32)}`;
const DOC = `0x${"cd".repeat(32)}`;

/** Fake injected wallet: EIP-6963 announce + window.ethereum. Whitechain unknown until added (4902). */
async function installFakeWallet(page: Page, opts: { chainId: number; rejectSwitch?: boolean }) {
  await page.addInitScript(
    ({ account, chainId, rejectSwitch }) => {
      const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
      const known = new Set([11155111]);
      let chain = chainId;
      const calls: { method: string; params?: unknown }[] = [];
      (window as unknown as { __walletCalls: typeof calls }).__walletCalls = calls;
      const emit = (ev: string, v: unknown) => (listeners[ev] ?? []).forEach((l) => l(v));
      const provider = {
        isFakeTestWallet: true,
        on: (ev: string, l: (...a: unknown[]) => void) => ((listeners[ev] ??= []).push(l)),
        removeListener: (ev: string, l: (...a: unknown[]) => void) => (listeners[ev] = (listeners[ev] ?? []).filter((x) => x !== l)),
        async request({ method, params }: { method: string; params?: unknown[] }) {
          calls.push({ method, params });
          switch (method) {
            case "eth_requestAccounts":
            case "eth_accounts":
              return [account];
            case "eth_chainId":
              return `0x${chain.toString(16)}`;
            case "wallet_switchEthereumChain": {
              if (rejectSwitch) throw Object.assign(new Error("User rejected the request."), { code: 4001 });
              const id = parseInt((params as [{ chainId: string }])[0].chainId, 16);
              if (!known.has(id)) throw Object.assign(new Error("Unrecognized chain ID"), { code: 4902 });
              chain = id;
              emit("chainChanged", `0x${id.toString(16)}`);
              return null;
            }
            case "wallet_addEthereumChain": {
              const id = parseInt((params as [{ chainId: string }])[0].chainId, 16);
              known.add(id);
              chain = id;
              emit("chainChanged", `0x${id.toString(16)}`);
              return null;
            }
            case "personal_sign":
            case "eth_signTypedData_v4":
              return `0x${"11".repeat(65)}`;
            default:
              throw new Error(`fake wallet: unsupported ${method}`);
          }
        },
      };
      (window as unknown as { ethereum: unknown }).ethereum = provider;
      window.addEventListener("eip6963:requestProvider", () =>
        window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: { info: { uuid: "fake-1", name: "Fake Test Wallet", icon: "", rdns: "test.fake" }, provider } })),
      );
    },
    { account: FOUNDER, chainId: opts.chainId, rejectSwitch: !!opts.rejectSwitch },
  );
}
const walletCalls = (page: Page) => page.evaluate(() => (window as unknown as { __walletCalls: { method: string; params?: unknown }[] }).__walletCalls);

test("live build: connect injected wallet, explicit switch both ways, honest BLOCKED sign-in when C1 is not deployed", async ({ page }) => {
  await installFakeWallet(page, { chainId: 11155111 });
  await page.goto("/founder");
  await expect(page.getByTestId("banner-devmock")).toHaveCount(0);
  await page.getByTestId("wallet-connect").click();
  await expect(page.getByTestId("wallet-chain")).toHaveAttribute("data-chain", "11155111");

  // Nothing switched by itself on connect
  expect((await walletCalls(page)).some((c) => c.method === "wallet_switchEthereumChain")).toBe(false);

  await page.getByTestId("wallet-chip").click();
  await page.getByTestId("switch-1874").click(); // user action → switch → 4902 → add Whitechain
  await expect(page.getByTestId("wallet-chain")).toHaveAttribute("data-chain", "1874");
  const calls = await walletCalls(page);
  expect(calls.map((c) => c.method)).toContain("wallet_addEthereumChain");
  const add = calls.find((c) => c.method === "wallet_addEthereumChain")!.params as [{ chainId: string; rpcUrls: string[] }];
  expect(add[0].chainId).toBe("0x752");
  await page.getByTestId("switch-11155111").click();
  await expect(page.getByTestId("wallet-chain")).toHaveAttribute("data-chain", "11155111");

  // C1 routes are not part of this build → sign-in reports BLOCKED and never asks the wallet to sign
  await page.getByTestId("wallet-signin").click();
  await expect(page.getByTestId("wallet-menu-error")).toContainText(/Not connected yet.*\/api\/identity\/auth\/challenge.*not deployed/);
  expect((await walletCalls(page)).some((c) => c.method === "personal_sign")).toBe(false);
});

test("live build: rejected network switch stays actionable", async ({ page }) => {
  await installFakeWallet(page, { chainId: 1874, rejectSwitch: true });
  await page.goto("/");
  await page.getByTestId("wallet-connect").click();
  await page.getByTestId("wallet-chip").click();
  await page.getByTestId("switch-11155111").click();
  await expect(page.getByTestId("wallet-menu-error")).toContainText("You declined");
  await expect(page.getByTestId("wallet-chain")).toHaveAttribute("data-chain", "1874");
});

test("live build: signing founding terms requires an explicit switch to Sepolia; payload checked; C1-shaped fixtures", async ({ page }) => {
  await installFakeWallet(page, { chainId: 1874 }); // wallet starts on Whitechain
  const doc = {
    schema: "vestige.founding-terms/1",
    ventureId: VID,
    effectiveDate: "2026-11-07",
    decisionRule: "Both founders approve every payment.",
    founders: [
      { wallet: FOUNDER, role: "CEO", contribution: "Product", ownershipBps: 5000, vestingIntent: "4y" },
      { wallet: OTHER, role: "COO", contribution: "GTM", ownershipBps: 5000, vestingIntent: "4y" },
    ],
    notes: "",
    disclaimer: "Workspace agreement between founders. Not a legal incorporation, not legal advice, and not an equity or token issuance.",
  };
  let signed = false;
  const seat = (wallet: string, label: string) => ({
    ventureId: VID, wallet, founderLabel: label, founderSubname: `${label}.fixture.vestige.eth`, worldProofStatus: "VERIFIED", onchainSeatStatus: "VERIFIED", subnameStatus: "VERIFIED",
  });
  const fixture = () => ({
    venture: { ventureId: VID, slug: "fixture", ensName: "fixture.vestige.eth", displayName: "Fixture Labs", status: "workspace", ensStatus: "VERIFIED", seats: [seat(FOUNDER, "asha"), seat(OTHER, "ravi")], humansVerified: 2, maxSeats: 2 },
    agreement: {
      ventureId: VID, agreementId: VID, version: 1, docHash: DOC, canonicalJson: JSON.stringify(doc),
      signatures: signed ? [{ signer: FOUNDER, verifiedAt: new Date().toISOString(), label: "SIGNED" }] : [],
      requiredSigners: [FOUNDER, OTHER], complete: false, ensStatus: "UNKNOWN",
    },
  });
  const j = (body: unknown, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
  await page.route("**/api/identity/auth/challenge", (r) =>
    r.fulfill(j({ nonce: "n", message: `localhost wants you to sign in with your Ethereum account:\n${FOUNDER}\n\nChain ID: 11155111\nNonce: n`, expiresAt: "2099-01-01T00:00:00Z" }, 201)),
  );
  await page.route("**/api/identity/auth/session", (r) => r.fulfill(j({ token: "T".repeat(43), wallet: FOUNDER, expiresAt: "2099-01-01T00:00:00Z" }, 201)));
  await page.route(`**/api/identity/ventures/${VID}`, (r) => r.fulfill(j(fixture())));
  await page.route(`**/api/agreements/ventures/${VID}/sign*`, async (r) => {
    if (r.request().method() === "GET")
      return r.fulfill(
        j({
          domain: { name: "vestige", version: "1", chainId: 11155111 },
          types: { FoundingTerms: [{ name: "ventureId", type: "bytes32" }, { name: "agreementId", type: "bytes32" }, { name: "version", type: "uint256" }, { name: "docHash", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "expiry", type: "uint256" }] },
          primaryType: "FoundingTerms",
          message: { ventureId: VID, agreementId: VID, version: "1", docHash: DOC, nonce: "7", expiry: "9999999999" },
        }),
      );
    const body = r.request().postDataJSON();
    expect(body).toMatchObject({ version: 1, nonce: "7", expiry: 9999999999 });
    expect(r.request().headers().authorization).toBe(`Bearer ${"T".repeat(43)}`);
    signed = true;
    return r.fulfill(j(fixture().agreement));
  });

  await page.goto(`/founder/${VID}/terms`);
  await page.getByTestId("signin-connect").click();
  await page.getByTestId("signin-button").click();
  await expect(page.getByTestId("terms-doc")).toContainText("Fixture Labs");
  await expect(page.getByTestId("terms-hash")).toHaveText(DOC);

  await page.getByTestId("terms-sign").click();
  await expect(page.getByTestId("wallet-prompt")).toBeVisible();
  await expect(page.getByTestId("sig-network")).toHaveAttribute("data-chain", "11155111");
  await expect(page.getByTestId("sig-switch-needed")).toBeVisible(); // explicit, not silent
  await expect(page.getByTestId("wallet-sign")).toHaveCount(0);
  expect((await walletCalls(page)).some((c) => c.method === "eth_signTypedData_v4")).toBe(false);
  await page.getByTestId("wallet-switch").click();
  await expect(page.getByTestId("wallet-sign")).toBeVisible();
  await page.getByTestId("wallet-sign").click();
  await expect(page.getByTestId("terms-i-signed")).toBeVisible();

  const td = (await walletCalls(page)).find((c) => c.method === "eth_signTypedData_v4")!;
  const payload = JSON.parse((td.params as [string, string])[1]);
  expect(payload.domain).toEqual({ name: "vestige", version: "1", chainId: 11155111 });
  expect(payload.message).toMatchObject({ ventureId: VID, docHash: DOC, version: "1", nonce: "7" });
  // Session token never placed in storage
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toContain("T".repeat(43));
});

test("live build: public page and funder page read real Sepolia; unregistered name stays unresolved; no manifest → never ACTIVE", async ({ page }) => {
  await page.goto("/v/definitely-not-registered-vestige-e2e.vestige.eth?source=mock");
  await expect(page.getByTestId("public-mock-notice")).toHaveCount(0); // mock refused in production
  await expect(page.getByTestId("public-evidence")).toHaveAttribute("data-phase", "done", { timeout: 45_000 });
  await expect(page.getByTestId("ens-unresolved")).toBeVisible();
  await page.goto("/funder/definitely-not-registered-vestige-e2e.vestige.eth");
  await expect(page.getByTestId("funder-ens-status")).toContainText("does not resolve", { timeout: 45_000 });
  await expect(page.getByTestId("fund-submit")).toHaveCount(0);
});
