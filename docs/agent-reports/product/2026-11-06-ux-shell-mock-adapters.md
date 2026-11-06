# C2 Product — UX shell, DEV MOCK adapters, ENS-first public page

**Role:** C2 (Claude Product) · **Branch/worktree:** `agent/product` @ `../vestige-product` · **Interface version:** CONTRACTS v0 **PROPOSED** (not locked) · **Written:** 2026-11-06T08:02Z

> Claim classes used below follow MASTER §11. Everything driven by the DEV MOCK adapter is **MOCK_ONLY**. The only network facts claimed are **read-only** RPC results, listed in *Evidence*. No transaction was sent, no wallet or key was used.

## What changed

- **App shell:** a permanent `TESTNET — NOT REAL MONEY` banner, a `DEV MOCK` banner whenever the mock adapter is active, a "Workspace — not legally incorporated" notice on every venture surface, and header nav plus a per-tab role switcher (Founder A / Founder B / A's 2nd wallet / Funder / Contractor / Visitor).
- **Typed seam** (`src/modules/ui/adapter.ts`): there is one `VestigeClient` method per CONTRACTS v0 route, and every method returns `Result<T>` with typed error codes (`DUPLICATE_HUMAN`, `CANCELLED`, `RELAYER_REFUSED`, `BLOCKED`, …).
  - **Live adapter:** every method returns `BLOCKED` with the route it is waiting for, because contracts aren't locked. The UI renders BLOCKED as "Not connected yet" and never as success.
  - **DEV MOCK adapter:** runs in the browser on localStorage, so several tabs share one store while each tab keeps its own role. It models duplicate-human refusal, single-use invites, re-versioning that invalidates signatures, pending→confirmed transitions, and a relayer 1-of-2 refusal (GS020).
  - **Mock refused in production:** `NODE_ENV=production` forces `live` even when `NEXT_PUBLIC_VESTIGE_ADAPTER=mock` (verified, see Tests).
- **Founder journey:** create venture → single-use invite → Founder B joins → World ID step (success / duplicate refusal / cancel / retry) → terms (6-clause template, live hash preview, sign, edit→new version→signatures reset) → treasury (deploy; shown "Active" only after readback) → payments (propose, approve, execute; 1-of-2 attempt allowed and refused by the relayer; card for the on-chain GS020 proof).
- **Funder:** venture list with 4 badges (FR-6), and a "Fund this team" page with a pre-funding checklist and one-signature deposit copy.
- **Public verifier `/v/<ens>`:** see the next section.
- **Honesty guards:** StatusPill/CheckIcon/EvidenceBadge carry a mock state (hatched + `MOCK`). Mock tx hashes never link to an explorer. The GS020 card shows a real tx only after reading its receipt (`status: reverted`) from Whitechain.

### Public evidence page (never-cut EV-01)

`src/modules/public-view/chain-reader.ts`, real viem reads, in this order:

1. **Sepolia ENS:** resolver via the Universal Resolver, then `addr(node, 2147485522)` (ENSIP-11), then text records `vestige.agreement|status|humans|guard|treasury`. The `vestige.treasury = eip155:1874:<addr>` fallback (MASTER §11.1) is parsed strictly and labelled as a fallback.
2. **Whitechain 1874:** `eth_getCode`, `VERSION()`, `getOwners()`, `getThreshold()`, the Guard storage slot, `getModulesPaginated` (modules bypass Guards, per SPIKE C), USDT `balanceOf/decimals/symbol`, `SeatRegistry.isSeat(ventureId, owner)`, and USDT Transfer logs in and out.
3. **Join C1's off-chain evidence:** humans, agreement version and hash, and signature count. The page also cross-checks the ENS `vestige.agreement` record against the API hash.

How results are judged:

- **Verdict** (`verdict.ts`, unit-tested): `ACTIVE` only if every check is VERIFIED (2 distinct owners, threshold 2, Guard matches ENS and/or the manifest, no modules, all owners are seats). An RPC failure gives `UNVERIFIED`, a broken rule gives `NOT_ACTIVE`, and no name or no treasury link gives `UNRESOLVED`.
- **No hard-coded fallback address**, ever.
- **Phase tracker** shows ok / failed / skipped per phase. It no longer shows a blanket tick, which was a bug found in Chrome.

## Commits / files

| SHA | Summary |
|---|---|
| `7e07ff0` | App shell, adapters, founder/funder flows, ENS-first public page, 21 unit tests |
| `0c44cf4` | Mock data can never read as verified; E2E journey; mobile fixes; 10k getLogs window |
| *(this commit)* | This report + scaffold proposal copies |

Owned paths only: `app/page.tsx`, `app/globals.css`, `app/v/**`, `app/(founder)/**`, `app/(funder)/**`, `components/**`, `src/modules/ui/**`, `src/modules/public-view/**`, `tests/e2e/**`, `docs/agent-reports/product/**`.

**Not committed (H-owned root files):** `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `app/layout.tsx`. They exist locally so the app runs. Copies are in `docs/agent-reports/product/proposed-scaffold/*.txt` for review. Proposal: pnpm 9.15, Next 16.4.5, React 19.3.1, viem 2.57.16, TypeScript 5.9.3, Vitest 4.1.12, Playwright 1.65.0 (uses installed Chrome, no browser download), plain CSS (no Tailwind/PostCSS config), `@/*` path alias to the repo root.

## Tests + actual output

```
$ pnpm typecheck                      → (no output, exit 0)
$ pnpm test
 Test Files  3 passed | 1 skipped (4)
      Tests  21 passed | 1 skipped (22)
$ VESTIGE_LIVE=1 pnpm exec vitest run src/modules/public-view/chain-reader.live.test.ts
 {"block":"12355733","code":"VERIFIED","version":"1.4.1","threshold":1,"guard":"FAILED",
  "modules":"UNKNOWN","token":{"symbol":"USDT","decimals":6,"balanceRaw":"0"},"transfers":"VERIFIED"}
 Tests  1 passed (1)
$ pnpm test:e2e      (Playwright, headless local Chrome, dev server :3200)
  ✓ founder A + founder B + funder + public verifier (DEV MOCK) (43.5s)
  ✓ public page with real chains: unregistered name is shown unresolved, no fallback (1.3s)
  2 passed (45.4s)
$ NEXT_PUBLIC_VESTIGE_ADAPTER=mock pnpm build   → ✓ Compiled successfully; 13 routes
$ next start -p 3201 → served HTML contains banner-testnet, NOT banner-devmock;
  /founder shows "Wallet: not connected", no role switcher; /funder shows "Not connected yet … CR-C2-001".
```

The unit tests cover:

- Verdict: threshold 1, duplicate owner, Guard mismatch, no expected Guard, enabled module, RPC failure, unresolved name, `incorporated` status.
- Mock state machine: duplicate human, same human in another venture, invite reuse, slug collision, re-version reset, unverified signer, deploy preconditions, relayer refusal, 2-of-2 execution.
- Bigint amounts, slugs (this caught a real `slugify` bug), canonical JSON, and the strict text-record parser.

**Claude-in-Chrome manual pass** (DEV MOCK, tab `localhost:3200`):

- Ran the whole journey: create → cancel World ID → verify → B joins → same human **refused** with "This human already holds a seat in Northstar Labs." → verify a different human → terms v1 signed by both → "50 / 50"→"60 / 40" gives v2 with a new hash, signatures cleared → treasury Confirming→Active → funder deposit 1,000 → A's 1-of-2 execute refused (GS020, "Nothing was sent") → B signs, EXECUTED → public mock page balance 500 USDT, duplicate refusal on the timeline, no agreement text or simulated-human IDs on the page.
- An automated DOM scan over 9 routes found **0 success pills, ticks or badges without a MOCK marker**.
- Mobile at 390 px: no horizontal overflow on all 11 routes.
- **Screenshots: NOT CAPTURED.** The extension returned "Permission denied for this action on this domain" for screenshots on `localhost`. Text, DOM, form and click actions worked. See H-C2-01.

**NOT RUN:** a real wallet; IDKit; any C1/X endpoint (none exist on this branch); lint (no ESLint config in the proposal).

## Evidence URLs / tx hashes

No transactions. Read-only RPC observations (2026-11-06):

- `rpc.testnet.whitechain.io`: `eth_chainId` = `0x752` (1874); CORS `*`. Test USDT `0xcedf…55a7` has code (a proxy), `decimals()` = 6, `symbol()` = "USDT". The Safe v1.4.1 L2 singleton `0x29fc…C762` reports `VERSION()` = "1.4.1" at block 12355733. **`eth_getLogs` max span is 10,000 blocks** (error `-32602 "query exceeds max block range 10000"`).
- `ethereum-sepolia-rpc.publicnode.com`: CORS `*`. With viem's default Sepolia Universal Resolver `0xeeee…eeee`, `vitalik.eth`, `nick.eth` and `gregskril.eth` resolve (resolver `0x322B…9Cb0`). **`vestige.eth` has no resolver on Sepolia** (zero address), so the parent name is not set up yet (H-002).
- Explorer: `https://explorer.testnet.whitechain.io` responds 200 and is the explorer listed on the ETHGlobal prize page. `testnet.whitechain.io` returns 403 to curl.

## Decisions proposed / implemented

- **D-C2-01 (implemented, my paths):** DEV MOCK rules:
  - Visible banner.
  - Mock-tagged success markers.
  - No explorer links for mock hashes.
  - Forced off in production builds.
  - Explicit `?source=mock` needed for mock chain data on `/v/`.
- **D-C2-02 (implemented):** the public page reads chains **client-side**, so a verifier can watch the RPC calls in DevTools, and both RPCs allow CORS. Read failures map to UNKNOWN/UNVERIFIED.
- **D-C2-03 (implemented):** the treasury verdict also requires **no enabled Safe modules**, because Guards don't apply to module transactions (MASTER SPIKE C).
- **D-C2-04 (proposed to H):** the scaffold above (pnpm, Next 16, plain CSS).
- **Env var names (proposed, for `.env.example`):**
  - `NEXT_PUBLIC_VESTIGE_ADAPTER`
  - `NEXT_PUBLIC_SEPOLIA_RPC_URL`
  - `NEXT_PUBLIC_WHITECHAIN_RPC_URL`
  - `NEXT_PUBLIC_WHITECHAIN_EXPLORER_URL`
  - `NEXT_PUBLIC_ENS_UNIVERSAL_RESOLVER`
  - `NEXT_PUBLIC_VESTIGE_GUARD_ADDRESS`
  - `NEXT_PUBLIC_VESTIGE_REGISTRY_ADDRESS`
  - `NEXT_PUBLIC_WHITECHAIN_USDT_ADDRESS`
  - `NEXT_PUBLIC_REJECTED_ATTEMPT_TX`

### Contract change requests

- **CR-C2-001:** `GET /api/identity/ventures` → founder-consented public `VentureSummary[]` (`ventureId, displayName, ensName, humansVerified, termsSigned, treasuryActive, funded`). PURPOSE: FR-6 funder list. AFFECTED: C1. MIGRATION: none. Without it the funder list stays BLOCKED (cut-order item 3 allows this).
- **CR-C2-002:** publish `ventureId` from a verifiable source, so the public page can call `SeatRegistry.isSeat(ventureId, owner)` without trusting our API. Options: ENS text `vestige.ventureId` (C1), or a Guard view `ventureOf(address safe) returns (bytes32)` (X). AFFECTED: C1 or X. Until then, the seat check uses the API's ventureId and that dependency is visible on the page.
- **CR-C2-003:** X to publish the deployed **SeatRegistry/Guard ABIs** and a **deployment manifest** (address, tx, block) that the frontend reads. My reader assumes PRD FR-7 `isSeat(bytes32,address)`.
- **CR-C2-004:** the treasury readback (`GET /api/treasury/ventures/:id`) should include `deploymentBlock`, so the public page scans logs from deployment instead of a fixed 50k lookback (5×10k windows today).
- **CR-C2-005:** C1 to confirm the canonical-JSON + `docHash` algorithm. `src/modules/ui/canonical.ts` previews it (sorted keys, no whitespace, keccak256 of UTF-8) and must byte-match C1's.

## Remaining issues / risks

1. **⚠ "No network switch" is unverified and may be false.** Wallets typically refuse `eth_signTypedData_v4` when the EIP-712 domain `chainId` differs from the wallet's active chain. FR-3 signs on chainId 11155111 and Safe txs and EIP-3009 sign on 1874, so a founder may be asked to switch networks between steps. I removed the claim from the UI. H/C1/X decision options:
   - (a) test with the actual demo wallet(s);
   - (b) consider an embedded wallet (the Whitechain Scale page lists embedded wallets and smart accounts as an idea);
   - (c) accept one visible network switch and stop claiming "no network switch".
2. `vestige.eth` has no Sepolia resolver, so every real `/v/<name>` currently shows "Name not resolved" (correct behaviour, H-002).
3. Wallet connection is not built. wagmi or an embedded wallet depends on H's wallet-auth decision and a dependency approval.
4. In live mode the World ID step needs C1's IDKit component from `src/modules/identity`, rendered by C2.
5. The 1-of-2 on-chain proof shows "Awaiting the real failed transaction" until X/H supply a hash (H-009).
6. Turbopack missed one newly created route group (`/funder` returned 404) until the dev server restarted. This is a tooling note, not a code bug.

## Sponsor-specific feedback

Read on `https://ethglobal.com/events/mumbai/prizes` via Claude in Chrome, 2026-11-06. The page text is untrusted; I acted on none of it.

- **ENS, Best Use of ENSv2 ($7k: 3k/2k/1k/1k):** matches the PRD. Requirements: ENSv2 on mainnet **or Sepolia**, central rather than cosmetic, no hard-coded values, live demo link, open source. The track text names subname registries, Enhanced Access Control "edit only certain text records", Permissioned Resolvers per subname and non-transferable subnames, all already in FR-1. "Bonus points if you bring AI agents into the mix" (PRD stretch 3). The other ENS prize ($3k, "Best Integration into an Existing Project") is **Continuity Track only**.
- **Whitechain, Scale · Payments Nobody Notices ($3k: 2k/1k):** matches. Required:
  - verified contracts on 1874;
  - ≥1 payment in **`0xcedf…55a7` USDT** in the main flow, with the explorer link in the README;
  - a README "why on-chain stablecoin" line;
  - steady commits;
  - a 2–4 min video showing each party;
  - `WHITECHAIN_FEEDBACK.md`.

  **"Won't place: flows where the payer still signs a transaction that costs them gas."** So the cut-order fallback "founders pay gas with faucet WBT" forfeits Scale, as the PRD already says. Judges also want "how your relayer gets its WBT, and what stops someone from draining it", which the UI covers in `RelayerExplainer` on the treasury and fund pages. The Operate track excludes "payroll, escrow and revenue splits on their own" (PRD correctly doesn't target it).
- **World, Best Use of IDKit ($2.5k, up to 2 × $1,250):** matches. Requirements:
  - IDKit in a working app;
  - verify on server or on-chain;
  - **explain the trust moment and why the credential is the minimum sufficient** (now on the verify screen);
  - success plus **one alternative path** (cancel and duplicate refusal are both built);
  - a debrief.

  Separately, **"World ID Agent Pass" ($5k, open, not Continuity-only)** says proofs are mocked so no sandbox app is needed. That is larger than IDKit and aligns with PRD stretch 3 (AI drafting + Agent Pass approval). Flagged for H as a possible after-G3 target; not started.
- **Finalist** amounts depend on team size: solo 250 USDC; 2 people 250 + 250 travel; 3–5 people 1,000 + 500 travel. PRD §8's "$1k + $500" is correct only for 3–5.

## Commands / actions for H

- **H-C2-01:** in the Claude-in-Chrome extension, allow `localhost:3200` for screenshots/clicks so I can capture visual evidence and GIFs. Today only DOM and text reads work.
- **H-C2-02:** review and adopt (or replace) the scaffold in `docs/agent-reports/product/proposed-scaffold/`. Lock pnpm/Next versions in DECISIONS and add the env names above to `.env.example`.
- **H-C2-03:** accept or reject CR-C2-001…005 and lock CONTRACTS v0 so I can replace `live-adapter.ts` method by method.
- **H-C2-04:** decide the wallet strategy given risk 1, and which wallet library C2 may add.
- **H-C2-05:** when ready, supply `vestige.eth` Sepolia setup (H-002), deployed Guard/Registry addresses, and the real GS020 tx hash (H-009).
- **Worktree note:** the folders were renamed (`vestige-main`→`vestige`, `dayzero-*`→`vestige-*`). I ran `git -C ../vestige worktree repair ../vestige-product` for my worktree only. `vestige-identity` and `vestige-treasury` still point at `vestige-main/.git/worktrees/dayzero-*` and need the same repair.
- **To run:** `pnpm install && pnpm dev` (port 3200; 3100 was taken by another Next server). Then `pnpm test`, `pnpm test:e2e`, and `VESTIGE_LIVE=1 pnpm test` for live chain reads.

## Route / state table

| Route | Party | Reads | Writes (adapter) | States rendered |
|---|---|---|---|---|
| `/` | all | — | — | pitch, 2-keys vs 2-humans, ENS lookup, label legend |
| `/founder` | Founder A | listVentures (mock only) | createVenture | no-wallet reason, slug/label validation, SLUG_TAKEN |
| `/founder/[id]` | A, B | getVenture | — | seats, invite (A only) unused/used, visitor/non-seat warning |
| `/join/[id]?code=` | Founder B | getVenture | joinVenture | missing code, INVITE_INVALID, already seated |
| `/founder/[id]/verify` | A, B | getVenture (poll while PENDING) | verifyWorld | NONE → cancelled → DUPLICATE_HUMAN (seat FAILED) → VERIFIED + attest PENDING→VERIFIED |
| `/founder/[id]/terms` | A, B | getVenture | createAgreementVersion, signAgreement | draft, preview hash, v_n awaiting, SIGNED, edit warning (signatures reset), NOT_VERIFIED, stale version |
| `/founder/[id]/treasury` | A, B | getTreasury (poll) | deployTreasury | blocked (seats), PENDING "not active until read back", ACTIVE, deposits |
| `/founder/[id]/payments` | A, B | getTreasury (poll) | proposePayment, signPayment, executePayment | AWAITING_APPROVALS, RELAYER_REFUSED (1-of-2), READY, executing, EXECUTED, GS020 proof card (missing / reverted / not-a-revert / unknown) |
| `/funder` | Funder | listVentures | — | BLOCKED (CR-C2-001), empty, 4 badges |
| `/funder/[id]` | Funder | getVenture, getTreasury | fundTreasury | checklist, inactive, cancel, submitted, settling→settled, balance |
| `/v` , `/v/[ens]` | Public | **ENS Sepolia → Whitechain → getPublicEvidence** | — | phases ok/failed/skipped; UNRESOLVED / UNVERIFIED / NOT_ACTIVE / ACTIVE; per-check provenance; transfers; humans & terms; timeline; `?source=mock` banner |

**Key test selectors:** `banner-testnet`, `banner-devmock`, `role-select`, `create-venture-submit`, `invite-url`, `join-submit`, `verify-start`, `world-prompt`, `world-cancel`, `world-verify`, `duplicate-refusal`, `verify-cancelled`, `seat-row[data-world|data-chain]`, `terms-*`, `terms-hash`, `terms-sign`, `wallet-prompt`, `wallet-sign`, `treasury-deploy`, `card-treasury`, `fund-submit`, `payment-execute`, `relayer-refused`, `payment-body[data-status]`, `rejected-attempt[-missing]`, `public-evidence[data-phase]`, `phase-*[data-outcome]`, `check-*[data-status]`, `evidence-badge[data-label|data-source]`, `status-pill[data-status|data-mock]`.

## Demo capture plan (target 3:30, PRD §5)

Recorded on the integrated build (live adapter) with 3 Chrome profiles: Founder A, Founder B, Funder. A 4th incognito window is the public verifier. Desktop at 1360×860, zoom 110%.

| Time | Screen | Action / line | Proof shown |
|---|---|---|---|
| 0:00–0:15 | `/` | The problem; the 2-keys vs 2-humans panel | — |
| 0:15–0:40 | A `/founder` | Create "Northstar Labs" **fresh, live**; invite link | New ENS name, Sepolia tx link (C1) |
| 0:40–1:10 | A, then B `/verify` | A verifies; B opens the invite, **tries with A's World ID → refused**; B verifies as themselves | Refusal message; seats HUMAN_VERIFIED; attestation tx (Whitechain) |
| 1:10–1:35 | `/terms` | Both sign v1; change one word → hash changes, signatures cleared; both sign v2 | Hash before/after; ENS `vestige.agreement` |
| 1:35–1:55 | `/treasury` | Deploy; "Active" appears only after readback | Safe/Guard explorer links |
| 1:55–2:15 | Funder `/funder/[id]` | Deposit 1,000 USDT by **one signature**, no gas | Deposit tx link (Whitechain) |
| 2:15–2:40 | `/payments` | A proposes 500 + signs; A tries alone → relayer refuses; cut to the **real mined GS020 tx** on the explorer; B signs → executes | Refusal; failed-tx explorer; execution tx |
| 2:40–3:20 | Incognito `/v/northstar.vestige.eth` | Phases tick ENS → Whitechain → off-chain; DevTools network shows the direct RPC calls | Each check with block number; transfers table |
| 3:20–3:40 | `/` | Traction numbers (only real, consented) + closing line | — |

Never show DEV MOCK in the video. If any live step fails, show its honest error state rather than switching to mock.

## Next unblocked task

1. Build wallet-connect and live-adapter scaffolding behind a feature flag, ready to point at C1/X routes the moment CONTRACTS is locked. No speculative endpoints get called in the meantime.
2. Add an ENS step to the funder's "Goes to" address: resolve the Safe from the ENS name (FR-6) and refuse to fund if it differs from the API treasury.
3. Capture screenshots and a GIF once H-C2-01 is granted.
4. Render C1's IDKit component once it is exported.
