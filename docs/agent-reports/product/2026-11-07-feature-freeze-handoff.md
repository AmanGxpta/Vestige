# C2 product — feature-freeze handoff (deadline 09:00 IST)

**Branch:** `agent/product`, synced with main `62f9bec`. Merge commits: `54d3b95` (main `770bf00`) and the sync to `62f9bec`. No transactions signed or broadcast. No root, shared-doc, C1 or X source edited.

## 1. Main sync and H's live-adapter/types edits

- **They conflicted textually.** H's uncommitted (later `770bf00`) edits touched the same hunks as C2's `aa6bb67` in:
  - `src/modules/ui/live-adapter.ts`: proposer cache, POST field, `safeTypedData`/`relay` mapping.
  - `src/modules/ui/types.ts`: `blockNumber`.
  - The founder treasury page: deposit-history line.
- **No semantic conflict.** C2's side is a superset:
  - it maps the nested `TreasuryReadV1` (with nullable `relay`, `depositsStatus` including FAILED, decimal `blockNumber`);
  - it fills the v0 proposer-tab gap only when `schemaVersion !== 1`, so v1 payloads that are null (stale or terminal) stay unsignable.
- **Same resolution as H.** I resolved to the C2 side. H's own merge `a2407d6` resolved these files identically: there is no diff in `src/modules/ui` between `a2407d6` and C2's merge.
- **Already merged.** My 4 commits (`fb8fd09`, `a272b4c`, `aa6bb67`, `0faa621`) are in main through `a2407d6`.
- **New on top:** `e883165` (code) and this docs commit.

## 2. northstar.vestige.eth

**Live ENS read, today, real Sepolia RPC:**
- Resolver `0x17cb013B4E8B3d47A7A1F3A8D08A5a4a04189C08`.
- `vestige.ventureId = 0xe68b1b43989080cfe7581731204a977009d67e3b3660062d24157562cc93e3ff`, `vestige.status = workspace`, `vestige.humans = 1`.
- `vestige.agreement`, `vestige.guard` and the ENSIP-11 treasury are not set.
- Run with `VESTIGE_LIVE=1 pnpm exec vitest run src/modules/public-view/northstar.live.test.ts` (passes).
- Screenshots: `screens/northstar-public-top.jpg` and `screens/northstar-public-ens.jpg`.

**Fixed in `e883165`:**
- **Override seats were mislabelled.** C1 returns override seats as `worldProofStatus: "VERIFIED"` plus `demoOverride: true` (CR-ID-06). C2 would have shown them as HUMAN_VERIFIED. They now render **SELF_REPORTED · DEMO OVERRIDE · NOT WORLD-VERIFIED** in the seat list, public founders, funder page and verify page.
  - They are never counted as humans. The Founders stat reads "1 / 2 verified · TESTED IN SIMULATOR · 1 demo override" and is never green.
  - The public mapper refuses VERIFIED for an override even if `humanVerified` were wrongly true (unit test).
- **No-treasury wording.** A workspace with no Safe linked now reads "No treasury published yet" (UNKNOWN) instead of FAILED. The phase line reads "name resolved · no treasury published yet". The verdict is still UNRESOLVED and never ACTIVE.

**Not verifiable from C2:** the off-chain section for northstar needs H's server DB. My servers don't have that venture, and I didn't copy H's private DB. The mapping is unit-tested against the shape in `post-deploy-northstar.json`. **H pre-flight:** run `curl $ORIGIN/api/identity/public/northstar.vestige.eth` and check that `aman` has `worldEnvironment: "staging"`.

## 3. Manifest drop-in (when X publishes; none created)

1. X hands over the reviewed manifest. Copy it **byte-identical** to `public/manifests/northstar.vestige.eth.json`. It must be the same file as X's `VESTIGE_DEPLOYMENT_MANIFEST_PATH`.
2. `pnpm test src/modules/public-view/manifest-dropin.test.ts` must pass. It checks:
   - the filename equals `ensName`;
   - the same validator the browser uses passes;
   - the northstar `ventureId` matches ENS.
3. Build with `NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL=/manifests/{ensName}.json`. Public env is baked in at build time, so **rebuild**.
4. Open `/v/northstar.vestige.eth`. It reads ACTIVE only once ENSIP-11 points at the Safe *and* every Whitechain check matches the manifest.

## 4. Deliverables

- **README draft:** `docs/agent-reports/product/README.draft.md`. Copy it to root `README.md`, which is H-owned.
  - All 17 explorer links were checked against the receipt files.
  - 7 of them were re-read on-chain today: status 1, blocks match.
- **Demo script (≤3:00):** `docs/agent-reports/product/2026-11-07-demo-script.md`. Each step is marked LIVE, LIVE·SIM or PENDING X; the four never-cut items are marked.
- **MetaMask two-profile checklist:** `docs/agent-reports/product/2026-11-07-metamask-smoke-checklist.md`.

## 5. Tests on this tree (= main `62f9bec` + `e883165`)

| Suite | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm test` | **107 passed**, 2 skipped (opt-in live) |
| `pnpm build` | OK |
| Cross-owner (v0 + v1, real C1/X modules) | 2 passed |
| Playwright mock + live | 6 passed |
| Playwright integration (real handlers via `src/shared/composition.ts`, port 3300) | 1 passed |
| Live ENS northstar | 1 passed |

Transcript: `2026-11-07-e2e-main-62f9bec.txt`.

## 6. For H (root, not C2)

- **`src/shared/composition.ts`** throws `ROOT_CONFIG_REQUIRED` when server env is missing, so every API route returns a bare **HTTP 500** with no `{error:{code}}` envelope. The UI shows "Unexpected response … (HTTP 500)" and still refuses safely.
  - Suggest catching it in the routes and returning `503 CONFIG_MISSING`.
  - C2's live spec now accepts either, and still asserts that no signature is requested.

## 7. Remaining blockers

1. **X: Whitechain.** Deploy SeatRegistry, Guard and the northstar Safe; set ENSIP-11/`vestige.guard`; publish the reviewed manifest. Until then the public page can't show ACTIVE.
2. **X / H: GS020.** The mined one-signer revert (NC2) needs separate H approval.
3. **H: relayer.** Activate it for the gasless deposit and payment. It is currently disabled.
4. **World.** Two distinct founders stay MOCK_ONLY. B continues only via the labelled CR-ID-06 override.
5. **H: MetaMask.** Run the two-profile smoke checklist.
6. **H: root wiring.** Copy the README draft to root and fix the route 500 envelope (optional).
