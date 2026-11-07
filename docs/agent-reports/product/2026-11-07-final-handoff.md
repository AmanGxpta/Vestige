# C2 product — main sync, CR-C2-008, CR-X-002 ACK, compatibility rerun (handoff)

**Branch:** `agent/product`. **Synced main:** `6aba6ac` (merge commit `a272b4c`). It includes the brand redesign `fb8fd09`, which was committed but not yet in main.
No transactions were signed or broadcast. No shared doc, root config, C1 or X source was edited. C2 commits touch C2-owned paths plus this report.

## 1. Main sync and shared-file reconciliation

- **Shared docs.** Before the merge I compared every uncommitted shared-doc copy in this worktree with the `50efcf2` baseline and with main.
  - 10 of 11 were byte-identical to the baseline already in main, so dropping them loses nothing.
  - `AGENTS.md` differed only by the block `next dev` writes automatically.
- **Root files.** My untracked copies were older, formatting-level variants of what H committed to main. The only content main lacks is the optional `test:e2e` script line, which is now a proposal only.
- **Backup.** All of these files were backed up to the C2 scratchpad (`pre-sync-backup/`) before I removed them. Nothing was committed from them, and nothing of H's was overwritten.
- **Merge.** `git merge --no-ff main` had no conflicts. The worktree is now the integrated root: C1 + X + C2 + root scaffold.

## 2. CR-C2-008 — manifest URL template (implemented)

- **Template.** `NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL` may contain `{ensName}`, for example `/manifests/{ensName}.json`. `manifestUrlFor()` lowercases the name, accepts only `<label>.vestige.eth`, URI-encodes it, and substitutes it.
- **No token.** A URL without the token is used as-is, so single-manifest setups are unchanged.
- **No guessing.** Other names, or path tricks such as `../etc.vestige.eth`, resolve to *no* manifest. The verdict then can't be ACTIVE.
- **Callers.** The public reader, the live adapter's funding check (`getManifest(ensName)`) and the funder page all pass the venture's ENS name. Funding also requires `manifest.ventureId === ventureId` and `manifest.ensName === ensName`.
- **Hosting convention (proposed).** Operator-reviewed JSON goes at `public/manifests/<ensName>.json`, byte-identical to X's `VESTIGE_DEPLOYMENT_MANIFEST_PATH` file for that venture. **No manifest file is added**, because no reviewed live deployment exists. Inventing one is exactly what the fail-closed rule forbids.
- **Tests.** Three unit tests: substitution and encoding, token-free passthrough, and refusal of non-venture names and path tricks.

## 3. Treasury readback — C2 ACK of X's CR-X-002 (f083222)

**C2 ACKs CR-X-002 exactly as specified** (spec SHA-256 `4360cfa0…4b77`). This settles the differences between it and C2's revised CR-C2-009 in X's favour:

| Difference | Resolution |
|---|---|
| `typedData` vs `safeTypedData` | **`safeTypedData`** is canonical in POST and GET. C2 reads `typedData` only while X's runtime still serves v0. The proposer-tab cache fills **v0 gaps only**; under v1 a `null` (stale or terminal) is never filled and is refused as NOT_READY. |
| `operations[].kind` | **Withdrawn** by C2. The existing v0 operation shape is fine. |
| Evidence status | **`status: "VERIFIED"` + `revertReason: "GS020"` + `reasonSource: "MINED_TRACE"`** accepted. C2 still re-reads the receipt from Whitechain before labelling it. |
| Balance and deposits | Accepted, with `balanceRaw: null` meaning unknown, never zero, and `depositsStatus` PENDING/UNKNOWN meaning partial history. The UI's primary money facts stay **independent chain reads** from `deploymentBlock`. |
| Number formats | `Evidence.blockNumber` is a decimal string, per v0. |

X's two requested caller fixes were already in C2 at `ef9e3be`: an optional bearer on GET, and an `Idempotency-Key` on approval. On top of those, C2 now maps:
- the nested `TreasuryReadV1`: `schemaVersion`, nullable `treasury`, `readStatus`, `depositsStatus`, nullable `relay` and `executedTxHash`, and `provenance.source`;
- shows "Treasury not verified" when a manifest exists but X's on-chain checks fail (`treasury: null`, `UNVERIFIED`).

**Compatibility rerun against the actual integrated sources.** `tests/e2e/cross-owner/` is committed and runs with `pnpm exec vitest run -c tests/e2e/cross-owner/vitest.config.ts`. Transcript: `2026-11-07-cross-owner-main-6aba6ac.txt`. Same signatures, same shared SQLite file, and the same labelled doubles (World portal, attester, ENS and X chain IO are fixtures; no network).

**v0, X's current runtime default:**
- Steps 1–8 pass. That covers sign-in, venture, invite, listing consent, World (staging, duplicate refused), exact docHash and version reset, ACTIVE on the fixture chain, deploy request (RESERVED; human approval required), and EIP-3009 funding.
- Executing with one of two approvals is refused, with no send.
- Founder B is still **BLOCKED** on reload. This is the known gap until X switches its default.

**v1, X's CR-X-002 candidate (`readback-payload.mjs`, installed exactly as shipped):**
- A **fresh founder-B adapter with no tab cache** reloads `safeTypedData` and `signerWallets`, approves, and reaches READY 2/2. Execute relays and the payment ends EXECUTED.
- The terminal payment's `safeTypedData` is null, so it can't be signed.
- A public read shows `payments: []`, balance **unknown**, `depositsStatus: UNKNOWN`, evidence `[]` (no mined GS020).

**Provenance (CR-C2-006, D-025):** C1 now returns `worldEnvironment: "staging"` on seats and public founders, and `source: "world-id-staging-4.0"` on events. C2 shows every one of them as `HUMAN_VERIFIED` + **TESTED IN SIMULATOR**. Both FOUNDER_VERIFIED events were qualified in the run.

## 4. Label accuracy (D-024, D-025)

- **Seat badges and public founders:** staging shows TESTED IN SIMULATOR; a missing environment shows WORLD ENV NOT REPORTED. Never a production claim.
- **Overview "Founders" stat:** turns green only for production proofs. With staging it reads "2 / 2 verified · TESTED IN SIMULATOR". Under D-024, the two-distinct-founders case on staging is **MOCK_ONLY**: the simulator returned the same nullifier for two identities. No UI claims two distinct real humans.
- **Landing summary chips:** API-reported values now render as neutral "· reported" chips, never green. `null` treasury and funding values render as "Unknown".
- **Treasury:** UNVERIFIED with no treasury is explained. Incomplete deposit history is labelled "not a zero balance". Relay SUBMITTED/RESERVED/UNKNOWN is never shown as executed.

## 5. Tests (this tree = integrated root)

| Suite | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm test` | **105 passed**, 1 skipped (opt-in live) |
| `pnpm build` | OK (C1 + X API routes + UI) |
| Cross-owner (v0 + v1) | **2 passed** |
| Playwright mock (dev, DEV MOCK) | **2 passed** |
| Playwright live (production build, no server env) | **4 passed**. Sign-in is honestly refused by C1 (`ORIGIN_FORBIDDEN`/config) and the wallet is never asked to sign. |
| Playwright integration (real C1 + X handlers on this tree) | **1 passed** (`2026-11-07-integration-e2e-main-6aba6ac.txt`). World shows "not configured on this server" because C2 does not use the RP key. The treasury page shows nothing active. The public page shows ENS "not registered". |

## 6. Remaining blockers (exact)

| # | Blocker | Owner |
|---|---|---|
| 1 | **Accept CR-X-002** (f083222, digest above; C2 ACK here) and switch X's runtime GET/POST to `treasuryReadV1`/`paymentCreatedV1`. Until then, founder B cannot approve after a reload. | H → X |
| 2 | Register X's read port (balance/deposits/evidence). Until then they are null/UNKNOWN in X's readback; C2 reads the chain independently. | X / H |
| 3 | **Root composition:** register X's `SeatAttester` with C1 before the C1 singleton is created, using one SQLite connection (`script/treasury/ROOT_COMPOSITION.md`). There is no `instrumentation.ts` in main yet, so on-chain seats read "not attested". Also wire the approved CR-ID-05 summary port; until then list values stay `null` → "Unknown". | H (+ C1 hook) |
| 4 | **ENS:** P1 and P2 are confirmed. The first venture name (V1–V3, built from a real server ventureId) is still pending, so every venture page reads "not registered". | H / C1 |
| 5 | **Whitechain:** reviewed infrastructure and Safe deployments, then real manifests published at `public/manifests/<ensName>.json` (CR-C2-008 convention) with `NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL=/manifests/{ensName}.json`. Without them the verdict is never ACTIVE. | H / X |
| 6 | **World:** the D-024 staging simulator produced the same nullifier for two identities, so the two-distinct-founders case stays **MOCK_ONLY** until a real distinct 4.0 proof exists. Production uniqueness needs real consenting people. | H / World |
| 7 | **Mined GS020** one-signer attempt from the isolated sender, recorded per CR-X-002 evidence rules. Separate H authority is needed. **Not broadcast by C2.** | H / X |
| 8 | Real MetaMask smoke test in two browser profiles, including a declined network switch. | H |
| 9 | Optional: root `package.json` `test:e2e` script (proposal only). | H |

## 7. Shortest honest recordable demo (unchanged in substance)

1. Two MetaMask profiles: sign in, create the venture, create the invite, join.
2. World staging: the modal shows "World staging — TESTED IN SIMULATOR". The duplicate refusal is real staging evidence. The second founder's verification is **MOCK_ONLY** under D-024 and must be narrated that way.
3. Terms: exact hash, a visible Sepolia switch, both sign, edit to reset, re-sign.
4. Treasury: "Deployment requested — waiting for operator approval". Stop.
5. Public page: ENS "not registered" (honest), plus the off-chain summary with simulator qualifiers.

Funding, payment, GS020 and ACTIVE need blockers 1–7 cleared.
