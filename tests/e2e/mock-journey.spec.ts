/**
 * UX-01 / UX-03 against the DEV MOCK adapter. This proves the UI's states and
 * negative paths render correctly. It does NOT prove any protocol behaviour —
 * every assertion that would be a chain/World/signature fact also asserts the
 * MOCK marker is present.
 */
import { expect, test, type Page } from "@playwright/test";

const asRole = async (page: Page, role: string) => {
  await page.evaluate((r) => sessionStorage.setItem("vestige.devmock.role", r), role);
};
const signWallet = async (page: Page, chain?: 11155111 | 1874) => {
  await expect(page.getByTestId("wallet-prompt")).toBeVisible();
  await expect(page.getByTestId("wallet-prompt")).not.toContainText("seed");
  if (chain) await expect(page.getByTestId("sig-network")).toHaveAttribute("data-chain", String(chain));
  await page.getByTestId("wallet-sign").click();
};
const SECRET = "Secret-contribution-e2e";
const worldVerify = async (page: Page, human: string) => {
  await page.getByTestId("verify-start").click();
  await page.getByTestId(`sim-${human}`).check();
  await page.getByTestId("world-verify").click();
};

test("founder A + founder B + funder + public verifier (DEV MOCK)", async ({ context }) => {
  const slug = `e2e${Date.now().toString(36)}`;
  const a = await context.newPage();
  await a.goto("/");
  await expect(a.getByTestId("banner-devmock")).toBeVisible();
  await asRole(a, "founderA");

  // --- Founder A creates the venture
  await a.goto("/founder");
  await a.getByTestId("venture-name-input").fill("E2E Labs");
  await a.getByTestId("venture-slug-input").fill(slug);
  await a.getByTestId("founder-label-input").fill("asha");
  await a.getByTestId("create-venture-submit").click();
  await expect(a.getByTestId("venture-ens")).toHaveText(`${slug}.vestige.eth`);
  await expect(a.getByText("Workspace — not legally incorporated").first()).toBeVisible();
  const ventureUrl = a.url();
  await a.getByTestId("invite-create").click();
  const inviteUrl = await a.getByTestId("invite-url").inputValue();
  expect(inviteUrl).toMatch(/\/join\/0x[0-9a-f]{64}#code=/); // code in the fragment, never sent to a server
  await expect(a.getByTestId("listing-toggle")).toHaveText("I agree to be listed");
  await a.getByTestId("listing-toggle").click();
  await expect(a.getByTestId("card-listing")).toContainText("1 of 1 founders agreed");

  // --- World ID: cancel is graceful, then verify human 1
  await a.getByTestId("next-verify").click();
  await a.getByTestId("verify-start").click();
  await a.getByTestId("world-cancel").click();
  await expect(a.getByTestId("verify-cancelled")).toBeVisible();
  await worldVerify(a, "sim-human-1");
  await expect(a.getByTestId("verify-success")).toContainText("DEV MOCK");

  // --- Founder B joins in another tab
  const b = await context.newPage();
  await b.goto("/");
  await asRole(b, "founderB");
  await b.goto(inviteUrl);
  await b.getByTestId("join-label-input").fill("ravi");
  await b.getByTestId("join-submit").click();
  await expect(b).toHaveURL(/\/verify$/);

  // --- Never-cut: same human is refused the second seat
  await worldVerify(b, "sim-human-1");
  await expect(b.getByTestId("duplicate-refusal")).toContainText("This human already holds a seat in E2E Labs.");
  await expect(b.locator('[data-testid=seat-row][data-world="FAILED"]')).toHaveCount(1);
  await worldVerify(b, "sim-human-2");
  await expect(b.locator('[data-testid=seat-row][data-chain="VERIFIED"]')).toHaveCount(2, { timeout: 20_000 });

  // --- Terms v1 (C1's exact document shape) signed by both, then re-versioned → signatures reset
  await b.getByTestId("next-terms").click();
  for (const i of [0, 1]) {
    await b.getByTestId(`terms-role-${i}`).fill(i ? "COO" : "CEO");
    await b.getByTestId(`terms-contribution-${i}`).fill(`${SECRET} ${i}`);
    await b.getByTestId(`terms-vesting-${i}`).fill("4 years, 1-year cliff");
  }
  await b.getByTestId("terms-decisionRule").fill("Both founders approve every payment.");
  await expect(b.getByTestId("terms-total")).toContainText("100%");
  await expect(b.getByTestId("terms-preview-hash")).toHaveText(/^0x[0-9a-f]{8}…[0-9a-f]{8}$/);
  const previewHead = (await b.getByTestId("terms-preview-hash").innerText()).slice(0, 10);
  await b.getByTestId("terms-save").click();
  const v1 = await b.getByTestId("terms-hash").innerText();
  expect(v1.startsWith(previewHead)).toBe(true); // preview = stored hash (C1 algorithm)
  await b.getByTestId("terms-sign").click();
  await signWallet(b, 11155111);
  await expect(b.getByTestId("terms-i-signed")).toBeVisible();

  await a.goto(ventureUrl + "/terms");
  await a.getByTestId("terms-sign").click();
  await signWallet(a);
  await expect(a.getByTestId("nav-terms")).toHaveAttribute("data-state", "done");
  await a.getByTestId("terms-edit").click();
  await expect(a.getByText("Saving creates a new version and clears all signatures")).toBeVisible();
  await a.getByTestId("terms-pct-0").fill("60");
  await expect(a.getByTestId("terms-total")).toContainText("must be 100%");
  await expect(a.getByTestId("terms-save")).toBeDisabled();
  await a.getByTestId("terms-pct-1").fill("40");
  await a.getByTestId("terms-save").click();
  await expect(a.getByTestId("terms-hash")).not.toHaveText(v1);
  await expect(a.getByTestId("nav-terms")).toHaveAttribute("data-state", "todo");
  await a.getByTestId("terms-sign").click();
  await signWallet(a);
  await b.reload();
  await b.getByTestId("terms-sign").click();
  await signWallet(b);
  await expect(b.getByTestId("nav-terms")).toHaveAttribute("data-state", "done");

  // --- Treasury: shown active only after (simulated) readback, and marked MOCK
  await a.goto(ventureUrl + "/treasury");
  await a.getByTestId("treasury-deploy").click();
  await expect(a.getByTestId("card-treasury")).toContainText("Not active until read back");
  const activePill = a.locator('[data-testid=card-treasury] [data-testid=status-pill][data-status="ACTIVE"]');
  await expect(activePill).toBeVisible({ timeout: 20_000 });
  await expect(activePill).toHaveAttribute("data-mock", "true");
  await expect(a.getByTestId("funding-link")).toHaveValue(new RegExp(`/funder/${slug}\\.vestige\\.eth$`));

  // --- Listing needs BOTH founders' consent
  await b.goto(ventureUrl);
  await b.getByTestId("listing-toggle").click();
  await expect(b.getByTestId("card-listing")).toContainText("2 of 2 founders agreed.");

  // --- Funder signs one message to deposit 1,000 USDT
  const f = await context.newPage();
  await f.goto("/");
  await asRole(f, "funder");
  await f.goto("/funder");
  const row = f.getByTestId("venture-row").filter({ hasText: "E2E Labs" });
  await expect(row.getByTestId("badge-humans")).toHaveAttribute("data-ok", "true");
  await row.getByTestId("fund-link").click();
  await f.getByTestId("fund-amount").fill("1000");
  await f.getByTestId("fund-submit").click();
  await expect(f).toHaveURL(new RegExp(`/funder/${slug}\\.vestige\\.eth$`));
  await expect(f.getByTestId("funder-ens-status")).toContainText("DEV MOCK");
  await expect(f.getByTestId("wallet-prompt")).toContainText("Approve sending 1,000 USDT");
  await signWallet(f, 1874);
  await expect(f.getByTestId("funder-balance")).toHaveText("1,000 USDT", { timeout: 20_000 });

  // --- Payment: 1-of-2 refused by relayer, 2-of-2 executes
  await a.goto(ventureUrl + "/payments");
  await a.getByTestId("use-mock-payee").click();
  await a.getByTestId("payment-amount").fill("500");
  await a.getByTestId("payment-reason").fill("Contract design work");
  await a.getByTestId("payment-propose").click();
  await a.getByTestId("payment-sign").click();
  await signWallet(a, 1874);
  await expect(a.getByTestId("payment-execute")).toHaveText("Try to execute with 1 of 2");
  await a.getByTestId("payment-execute").click();
  await expect(a.getByTestId("relayer-refused")).toContainText("GS020");
  await expect(a.getByTestId("rejected-attempt-missing")).toBeVisible(); // never faked

  await b.goto(ventureUrl + "/payments");
  await b.getByTestId("payment-sign").click();
  await signWallet(b);
  await b.getByTestId("payment-execute").click();
  await expect(b.locator('[data-testid=payment-body][data-status="EXECUTED"]')).toBeVisible({ timeout: 20_000 });

  // --- Public verifier: mock chain view is labelled, no private data leaks
  const p = await context.newPage();
  await p.goto(`/v/${slug}.vestige.eth?source=mock`);
  await expect(p.getByTestId("public-mock-notice")).toBeVisible();
  await expect(p.getByTestId("public-evidence")).toHaveAttribute("data-phase", "done", { timeout: 20_000 });
  await expect(p.getByTestId("treasury-balance")).toHaveText("500 USDT");
  await expect(p.getByTestId("humans-verified")).toContainText("2 of 2");
  await expect(p.locator('[data-testid=timeline-item][data-kind="DUPLICATE_REFUSED"]')).toHaveCount(1);
  const body = await p.locator("body").innerText();
  for (const secret of [SECRET, "Contract design work", "sim-human"]) expect(body).not.toContain(secret);
  await expect(p.getByTestId("ens-venture-id")).toHaveAttribute("data-status", "VERIFIED");
  const unmarked = await p.locator('[data-testid=evidence-badge]:not([data-source="DEV_MOCK"])').count();
  expect(unmarked).toBe(0);
});

test("public page with real chains: unregistered name is shown unresolved, no fallback", async ({ page }) => {
  await page.goto("/v/definitely-not-registered-vestige-e2e.vestige.eth");
  await expect(page.getByTestId("public-evidence")).toHaveAttribute("data-phase", "done", { timeout: 45_000 });
  await expect(page.getByTestId("ens-unresolved")).toBeVisible();
  await expect(page.getByTestId("phase-whitechain")).toHaveAttribute("data-outcome", "skipped");
  await expect(page.locator('[data-testid=check-safe]')).toHaveCount(0);
});

