import { defineConfig } from "@playwright/test";

/**
 * Two projects:
 *  - "mock": dev server (DEV MOCK adapter) — UI states and negative paths only.
 *  - "live": PRODUCTION build (`next build && next start`), where DEV MOCK is impossible;
 *    exercises the injected-wallet + live-adapter UI with labelled test doubles.
 *  - "integration": the integrated root with REAL C1/X route handlers (E2E_INTEGRATION_URL).
 *    Only this project can close integration; the other two are UI-level evidence.
 */
const MOCK_PORT = Number(process.env.E2E_PORT ?? 3200);
const LIVE_PORT = Number(process.env.E2E_LIVE_PORT ?? 3201);

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    // Uses the locally installed Google Chrome — no browser download needed.
    channel: "chrome",
    headless: true,
    viewport: { width: 1360, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  // Inside node_modules/.cache so artifacts are git-ignored without touching root .gitignore (H-owned).
  outputDir: "../../node_modules/.cache/vestige-e2e",
  projects: [
    { name: "mock", testMatch: /mock-.*\.spec\.ts/, use: { baseURL: `http://localhost:${MOCK_PORT}` } },
    { name: "live", testMatch: /live-.*\.spec\.ts/, use: { baseURL: `http://localhost:${LIVE_PORT}` } },
    // Real C1 + X handlers in an integrated root; started separately, URL via E2E_INTEGRATION_URL.
    { name: "integration", testMatch: /integration-.*\.spec\.ts/ },
  ],
  webServer: [
    { command: `pnpm exec next dev -p ${MOCK_PORT}`, url: `http://localhost:${MOCK_PORT}`, reuseExistingServer: true, timeout: 120_000 },
    { command: `pnpm exec next build && pnpm exec next start -p ${LIVE_PORT}`, url: `http://localhost:${LIVE_PORT}`, reuseExistingServer: true, timeout: 300_000 },
  ],
});
