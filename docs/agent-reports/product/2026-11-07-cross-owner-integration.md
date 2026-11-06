# C2 product — cross-owner compatibility against C1 a00016b / X 4d44fa8, integration readiness

**Branch:** `agent/product`. **Code commit:** `ef9e3be`; this report and its evidence are the next commit.
**Tested against:**
- `agent/identity@a00016b`;
- `agent/treasury@4d44fa8` (no code change since `1d2ff44`; docs only);
- integration base `main@30d1ef6`.

Earlier C2 reports targeted C1 `1b502e6`. Every blocker below was re-checked against the new heads, and **a blocker is removed only where a run proves it resolved**.

## 1. Blockers: resolved vs still open (with proof)

| Earlier blocker | Now | Proof |
|---|---|---|
| C1 sparse array emitted `[1,,2]` | **Resolved** (C1 rejects) | Vectors regenerated from a00016b code, plus C1's official `canonical-v1.json`: 49/49 pass (`terms.test.ts`). |
| C1 `DELETE` session missing | **Resolved** | Cross-owner step 9: 204 and the session is cleared. Integration E2E: sign out. |
| C1 `GET /ventures` list missing | **Resolved** | Cross-owner step 3; integration E2E (funder list row, treasury "Unknown"). |
| C1 listing route missing / `optedIn` vs `consents` | **Resolved; CR-C2-007 withdrawn** | C2 consumes `listing.consents` exactly (step 3; integration E2E "2 of 2 founders agreed"). |
| X treasury handlers missing | **Resolved (handlers exist)** | Step 6: GET returns UNKNOWN without a manifest and ACTIVE (fixture chain) with one; deploy → 202 RESERVED + HUMAN_APPROVAL_REQUIRED; fund, propose, sign and execute all pass through X's real `http.mjs`/`service.mjs`. |
| X ABI JSON / manifest schema | **Resolved** | Guard getters `safe/registry/ventureId` and `isSeat` confirmed in `contracts/abi/*.json`. C2's validator now matches X's `validateManifest`: both accept 1 valid manifest and both reject 3 mutated ones in step 6. |
| X readback reloadable payload / approvals / GS020 evidence | **OPEN: CR-C2-009 (revised)** | Step 8: founder B → BLOCKED (no `typedData` in the readback). Step 8b: with the proposed fields injected into X's `read()`, B signs, the payment is READY 2/2 and execute relays. |
| World environment provenance | **OPEN: CR-C2-006** | Step 4: `seat.worldEnvironment` is absent. X already derives `TESTED_IN_SIMULATOR` from C1's table (step 6), so the data exists. |
| Manifest per venture | **OPEN: CR-C2-008** | Unchanged. |

**New defect found and fixed (live Sepolia, 2026-11-07).** Now that `vestige.eth` is registered, the Universal Resolver returns the parent's resolver `0xc9A7…db27` for **any** unregistered subname (ENSIP-10 wildcard). C2 used to report "Name resolves ✓" for a venture name that does not exist. It now says "not registered" when the resolver is the parent's and the name has no records of its own. Covered by a unit test and by the mock, live and integration E2E runs on real Sepolia.

## 2. Cross-owner run (real handlers, shared SQLite)

`2026-11-07-cross-owner-c1-a00016b-x-4d44fa8.txt`; harness source in `2026-11-07-cross-owner-harness.ts.txt`.

C2's live adapter drives C1's and X's actual handler code on **one SQLite file**: C1 migrations, then X `020`. X authenticates C1's bearer sessions from the shared `identity_sessions` table. All signatures are real throwaway-key signatures: personal_sign, FoundingTerms, EIP-3009 and SafeTx.

Labelled doubles:
- World portal = C1 `FakeWorldPortal` (MOCK_ONLY);
- seat attester = C1 `MemoryAttester`;
- ENS = C1 `MemoryEns`;
- X chain IO = in-memory fixture (`LOCAL_FIXTURE_CHAIN`; no network, no broadcast).

| Step | Result |
|---|---|
| 1. Wallet sign-in | Sign-in for A, B and funder F works through C1's challenge and session. |
| 2. Venture and invite | Create venture, invite, join: OK. Reusing the invite is refused. |
| 3. Listing | A alone → nothing listed. A + B → listed. `treasuryActive: null`. |
| 4. World | Duplicate human gets exactly *"This human already holds a seat in Northstar Labs."* Both seats are VERIFIED with the seat attested. |
| 5. Terms | C2 preview hash = C1 docHash (`0xfae34739…0339031`). C1's server-issued nonces are honoured; both founders sign; v2 resets the signatures; a stale v1 signature → `VERSION_SUPERSEDED`. |
| 6. Treasury | UNKNOWN without a manifest, then ACTIVE with one, with `worldSource = TESTED_IN_SIMULATOR`. Deploy returns "Deployment request recorded. No transaction is sent until the operator approves…". |
| 7. Funding | X recovers **C2-built EIP-3009** typed data and relays it (fixture IO). |
| 8. Payment | A's approval works. B → BLOCKED (CR-C2-009). Executing with one of two approvals → `RELAYER_REFUSED` "…does not have both founders' approvals. Nothing was submitted…", with no send. |
| 8b. Payment with the CR fields | Completes 2-of-2 and executes. |
| 9. Public summary and logout | Public summary maps correctly; logout returns 204. |

## 3. Integration build and real-handler browser E2E

`proposed-scaffold/INTEGRATION.md`; output in `2026-11-07-integration-e2e-real-handlers.txt`.

A scratch tree combining `main@30d1ef6`, the three branch heads and the proposed root scaffold gives:
- **typecheck clean**, once the root tsconfig excludes the owners' own test harnesses;
- **`next build` OK**, with all 19 C1/X API routes;
- **`integration` E2E: 1 passed**.

The integration E2E uses **no route fixtures**. Real C1 handles sign-in with real signatures, venture creation (server ventureId), the fragment invite, join, and listing consent by both founders. The funder list shows treasury "Unknown". X's treasury readback leaves the setup card showing and nothing Active. The public page reads real Sepolia ("not registered") plus C1's real off-chain summary ("0 of 2 founders").

World was deliberately unconfigured in that run (C1 owns the staging key), so it showed **"Not connected yet — World ID is not configured on this server. (CONFIG_MISSING)"**. This closes C2's side of integration *in a scratch tree*. H's integrated root must re-run the same command (§5 of INTEGRATION.md), with World staging configured, before integration is accepted.

Fixture-only suites (unit, mock, live) passed as well, but they are not counted as integration.

| Suite | Result |
|---|---|
| `pnpm tsc --noEmit` | clean |
| `pnpm vitest run` | **100 passed, 1 skipped** (opt-in live test) |
| `VESTIGE_LIVE=1` chain read | passed (real Whitechain) |
| `next build` (product) | OK |
| Playwright mock + live | **6 passed** (`2026-11-07-e2e-mock-live.txt`) |
| Playwright integration (real handlers) | **1 passed** |
| Cross-owner harness | **1 passed** |

## 4. Facts still UNKNOWN / UNVERIFIED (shown that way in the UI)

- **World staging:** configured for C1's attempt but not run by C2, and portal acceptance is unproven. Seats show HUMAN_VERIFIED with "WORLD ENV NOT REPORTED" until CR-C2-006. The IDKit modal shows the staging banner.
- **ENS:** `vestige.eth` is registered (owner `0x1ed7…A41E`, per X's readiness read). Parent subregistry P1/P2 and venture names are **pending**, so every venture page reads "not registered". There is no `vestige.agreement` record write.
- **Whitechain:** no Safe, Guard or Registry is deployed and there is no reviewed manifest, so the treasury verdict can never be ACTIVE. Operator wallets hold 0 WBT, so there are no attestations, funding, payments or GS020 receipt.
- **Production two-human uniqueness:** unavailable. The simulator never substitutes for it.

## 5. Shortest honest recordable demo (today, with the integrated root + C1's World staging config)

1. Two Chrome profiles with MetaMask (Founder A, Founder B).
   - Connect → **Sign in** (free signature).
   - A creates the venture → creates the invite. B opens the link → joins.
   - *Claim: SELF_REPORTED records, verified signatures.*
2. **World staging.** Each founder opens Verify. The IDKit modal shows **"World staging — TESTED IN SIMULATOR"**; paste the link into the World ID Simulator.
   - B first uses **A's simulator identity**, and gets the refusal *"This human already holds a seat in …"*. B then uses their own identity.
   - Seats show `HUMAN_VERIFIED` + qualifier.
   - On-chain seat shows **Attestation failed / not attested** until the X attester is registered and funded.
   - *Claim: TESTED_IN_SIMULATOR.*
3. **Terms.**
   - Draft; the preview hash equals the stored hash.
   - Sign: the prompt shows **Switch to Ethereum Sepolia** if needed.
   - Both sign. Edit one word: signatures reset. Re-sign.
   - *Claim: SIGNED (off-chain, EIP-712 verified by C1).*
4. **Treasury.** Press Deploy and get **"Deployment requested — waiting for operator approval"** (X 202 RESERVED). Stop there. *Claim: BLOCKED (no deployment).*
5. **Public page** `/v/<slug>.vestige.eth`:
   - "not registered" on Sepolia;
   - the off-chain card shows 2 of 2 humans (env not reported) and terms v2 signed;
   - the manifest row says "not configured".
   - *Claim: VERIFIED_ON_CHAIN for the negative ENS read; the treasury is UNRESOLVED.*

**Not recordable as real yet:** funding, 2-of-2 payment, the mined GS020 rejection, and an ACTIVE verdict. These need parent and venture ENS, a reviewed Safe deployment and manifest, funded operator wallets, CR-C2-009, and the separate GS020 transaction. The cross-owner transcript is engineering evidence only. It must not be presented as a live demo.

## 6. Human actions (exact)

| ID | Action |
|---|---|
| H-C2-02 | Integrate per `proposed-scaffold/INTEGRATION.md`: merges (dry-run conflict-free), scaffold files, `.gitignore`, composition (seat attester), env. Then run its §5 acceptance commands. |
| H-C2-03 | Decide CR-C2-009 (X), CR-C2-006 (C1) and CR-C2-008. CR-C2-007 is withdrawn. C2 supports CR-ID-05. |
| H-C2-05 | ENS P1/P2 + first venture from a real server ventureId (C1 plans); X's reviewed deployment and manifest; funding of operator wallets; the separate GS020 tx recorded as a receipt-backed evidence record. |
| H-C2-04 | Real MetaMask smoke test in two profiles, including one declined network switch. |
| C1 | Run World staging (key in place). Expose `worldEnvironment` (CR-C2-006). |
| X | CR-C2-009 readback fields; register `SeatAttester` composition with H. |
