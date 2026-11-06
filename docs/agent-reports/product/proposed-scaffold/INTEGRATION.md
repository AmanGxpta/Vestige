# Root scaffold proposal and exact integration steps (for H)

**Prepared by:** C2, 2026-11-07. **Verified on:** a scratch integration tree containing:
- `main@30d1ef6`;
- `agent/identity@a00016b`;
- `agent/treasury@4d44fa8` (same code as `1d2ff44`);
- `agent/product` (C2 HEAD);
- the files in this folder.

Results on that tree:
- `tsc --noEmit` is clean.
- `next build` succeeds and serves all 19 C1/X API routes plus the UI.
- The real-handler browser E2E passes (`2026-11-07-integration-e2e-real-handlers.txt`).

Nothing here was applied to `main` or to any shared file. H owns that step.

## 1. Merge (dry-run verified conflict-free)

```bash
cd ../vestige                       # integration checkout, on main @30d1ef6
git status --short                  # commit or stash YOUR pending shared-doc edits first
git switch -c integration/v0
git merge --no-ff agent/identity    # a00016b
git merge --no-ff agent/treasury    # 4d44fa8
git merge --no-ff agent/product     # C2 HEAD named in the C2 report
```

`git merge-tree --write-tree` showed no conflicts for main + identity, then + treasury, then + product.

## 2. Root scaffold files (H-owned; copy from this folder)

| Target | Source | Notes |
|---|---|---|
| `package.json` | `package.json.txt` | next 16.4.5, react 19.3.1, **viem 2.57.16** (D-023 pin, also C1's and X's), `@worldcoin/idkit-core 4.6.0` (same as C1), `qrcode 1.5.4`; dev: typescript 5.9.3, vitest 4.1.12, @playwright/test 1.65.0, `@types/qrcode 1.5.5`. Dev and start port **3200**. |
| `tsconfig.json` | `tsconfig.json.txt` | **Excludes `tests/identity` and `tests/treasury`.** Those harnesses typecheck under their own configs, and under Next's types `ProcessEnv` requires `NODE_ENV`, which fails 8 C1 test lines otherwise. App code, including X's `.mjs` behind `.d.mts`, typechecks clean. |
| `next.config.ts` | `next.config.ts.txt` | `reactStrictMode` only. |
| `vitest.config.ts` | `vitest.config.ts.txt` | C2 unit tests (`src/**`, `components/**`). C1 runs `tests/identity/vitest.config.ts`; X runs `node --test`. |
| `app/layout.tsx` | `app_layout.tsx.txt` | Imports `globals.css` and wraps pages in C2's `AppShell`. |
| `pnpm-lock.yaml` | regenerate with `pnpm install` | The C2 worktree's untracked lock was used for the run above. |

`.gitignore` additions: `private/` (because `VESTIGE_DB_PATH=./private/vestige.db`, as C1 also noted), `tsconfig.tsbuildinfo` and `next-env.d.ts`.

## 3. Runtime composition H still has to add (not owned by any agent)

- **Seat attester:** register X's `SeatAttester` with C1, using `registerSeatAttester()` from `src/modules/identity/container.ts` and X's `getTreasuryRuntime().seatAttester`. For example, put it in a root `instrumentation.ts`. Without it, C1 uses `UnconfiguredPort`, and every on-chain seat shows **Attestation failed**, honestly.
- **CR-ID-05 treasury summary port**, if H approves it. Until then the public list's `treasuryActive` and `funded` are `null`, and the UI shows "Unknown".
- **One SQLite file for both owners** (`VESTIGE_DB_PATH`). X's store reads C1's `identity_sessions` and `identity_seats`. C1 migrates on its first request; X's `020` migration has foreign keys to `identity_ventures`. That works in either order, and was verified on one shared file in the cross-owner run.

## 4. Environment (names locked by CONTRACTS v0)

```bash
VESTIGE_DB_PATH=./private/vestige.db
VESTIGE_AUTH_DOMAIN=localhost:3200
VESTIGE_AUTH_URI=http://localhost:3200
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
WHITECHAIN_RPC_URL=https://rpc.testnet.whitechain.io
RELAYER_ENABLED=false
# World staging (C1's configured app/RP; the key only in a gitignored, mode-600 file):
WORLD_APP_ID=…  WORLD_RP_ID=…  WORLD_RP_SIGNING_KEY=…  WORLD_ENVIRONMENT=staging  WORLD_PROTOCOL_VERSION=4.0
# Once X publishes a reviewed treasury manifest:
VESTIGE_DEPLOYMENT_MANIFEST_PATH=…            # server (X)
NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL=… # browser (C2); serve the same JSON same-origin
```

The auth domain and URI **must equal the origin you browse**. C1 rejects anything else, and X rejects mutations whose `Origin` differs from `VESTIGE_AUTH_URI`.

## 5. Acceptance commands (run in the integrated root)

```bash
pnpm install
pnpm typecheck
pnpm test                                                        # C2 unit tests
(cd tests/identity && npx vitest run --config vitest.config.ts)  # C1
node --test tests/treasury/*.test.mjs                            # X
pnpm build && pnpm start &                                       # port 3200, env from §4
E2E_INTEGRATION_URL=http://localhost:3200 pnpm exec playwright test -c tests/e2e/playwright.config.ts --project=integration
```

The integration project uses **no route fixtures**. Every `/api` call hits C1 or X. The injected test wallet produces real signatures from per-run throwaway keys. World, ENS and treasury results are asserted to be shown honestly: verified, BLOCKED or UNKNOWN, never invented. Only this project closes integration; the mock and live projects are UI-level evidence.
