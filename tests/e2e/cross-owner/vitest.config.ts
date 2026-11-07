import { defineConfig } from "vitest/config";
import path from "node:path";

/** C2's cross-owner compatibility run: `pnpm exec vitest run -c tests/e2e/cross-owner/vitest.config.ts` */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "../../..") } },
  test: { include: ["tests/e2e/cross-owner/**/*.test.ts"], root: path.resolve(__dirname, "../../.."), environment: "node", testTimeout: 60_000 },
});
