import { defineConfig } from "@playwright/test";

/**
 * Two projects:
 *  - "mock": dev server (DEV MOCK adapter) — UI states and negative paths only.
 *  - "live": PRODUCTION build (`next build && next start`), where DEV MOCK is impossible;
 *    exercises the injected-wallet + live-adapter UI with labelled test doubles.
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
  ],
  webServer: [
    { command: `pnpm exec next dev -p ${MOCK_PORT}`, url: `http://localhost:${MOCK_PORT}`, reuseExistingServer: true, timeout: 120_000 },
    { command: `pnpm exec next build && pnpm exec next start -p ${LIVE_PORT}`, url: `http://localhost:${LIVE_PORT}`, reuseExistingServer: true, timeout: 300_000 },
  ],
});
