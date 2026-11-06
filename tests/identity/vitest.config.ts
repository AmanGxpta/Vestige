// TEMPORARY C1 harness: resolves pinned deps for files outside tests/identity
// (src/modules/identity, src/modules/agreements, app/api/**) until H scaffolds the root.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const nm = (p: string) => fileURLToPath(new URL(`./node_modules/${p}`, import.meta.url));

export default defineConfig({
  root: fileURLToPath(new URL("../..", import.meta.url)),
  resolve: {
    alias: [
      { find: /^viem$/, replacement: nm("viem/_esm/index.js") },
      { find: /^viem\/(accounts|chains|ens)$/, replacement: nm("viem/_esm/$1/index.js") },
      { find: /^@worldcoin\/idkit-core\/(signing|hashing)$/, replacement: nm("@worldcoin/idkit-core/dist/$1.js") },
    ],
  },
  test: {
    include: ["tests/identity/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    environment: "node",
    testTimeout: 30_000,
  },
});
