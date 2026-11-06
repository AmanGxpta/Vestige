# C1 identity — World staging run, ENS parent plan for approval, C2 compatibility (2026-11-07)

**Role:** C1 · **Branch:** `agent/identity` · **Base:** `a00016b`. I stayed in owned paths and did not touch the shared/master doc edits in this worktree (they're still uncommitted and preserved). **No transaction was signed or broadcast. No secret, connector URL or raw nullifier was logged or committed.**

## 1. World ID 4.0 staging, four simulator cases — TESTED_IN_SIMULATOR

**The run:**
- Runner: `tests/identity/live/world-staging.live.test.ts`.
- Evidence: `evidence/world-staging-e2e.json`. It contains every Developer Portal request and response, with nullifiers replaced by the CR-ID-04 digest and proofs omitted.
- Everything ran through the real path: RP-signed request (key from the mode-600 gitignored `.env.local`), IDKit staging bridge, `simulator.worldcoin.org`, `POST developer.world.org/api/v4/verify/rp_ec275669640f9143`, then C1's SQLite uniqueness gate.
- The attester and ENS ports were DEV MOCK, so no chain tx was sent.
- Simulator identities were selected through the simulator's own "Switch test identity" control.

| # | Case | Simulator identity | Portal (actual) | C1 result (actual) | Nullifier digest |
|---|---|---|---|---|---|
| 1 | venture 1, wallet A | test identity #4 (`0x18310f83…`) | 200 `success:true`, `proof_of_human`, issuer 1, protocol 4.0, staging | **VERIFIED** | `0xd14c…e415` |
| 2 | venture 1, wallet B | test identity #2 (`0x0df29422…`), **a different simulator identity** | 200 `success:true`; `created_at` identical to case 1's record | **DUPLICATE_HUMAN** ("This human already holds a seat in Vestige Sim One 89265.") | `0xd14c…e415` (**same as case 1**) |
| 3 | venture 2, wallet A | identity #4 again | 200 `success:true` | **VERIFIED** (same human in a different venture is allowed) | `0xeef6…af2b` |
| 4 | venture 2, wallet C (second wallet) | identity #4 | 200 `success:true` (reused nullifier accepted by the portal) | **DUPLICATE_HUMAN** ("…a seat in Vestige Sim Two 57280."); seat C stays `PENDING` | `0xeef6…af2b` |

**What this shows (TESTED_IN_SIMULATOR only):**
- **ID-03 shown (simulator):** the same simulated identity with a second wallet is refused in the same venture. C1 refuses it because of the nullifier; the portal itself returned `success:true` for the reused nullifier, and in case 2 it even returned the existing record's `created_at`.
- **ID-04 shown (simulator):** the same identity is allowed in a different venture, which got a different, action-scoped nullifier.
- **ID-02 NOT shown:** two *distinct* simulated identities could not be produced. With protocol 4.0 / `proofOfHuman`, switching simulator test identity gave **the identical nullifier for the same action**.
  - The simulator's browser state (`localStorage: Simulator_Identity_Store_2`) holds only legacy 3.0-style identities (`zkIdentity`, `inclusionProof`). There's no IndexedDB, no cookies and no per-identity 4.0 credential.
  - My inference (not confirmed by World): staging 4.0 PoH proofs from the simulator come from one shared credential, so **the simulator cannot represent two distinct 4.0 humans today**. The simulator's own banner says it "will change with the adoption of World ID 4.0".
  - C1 behaved correctly: it refused a proof whose nullifier matched an existing seat.
- **None of this is evidence of real or distinct humans.**

The runner exits non-zero because its ID-02 assertion failed; I left that assertion unweakened.

**Decision for H (D-021):**
- **(a)** Demo ID-03/ID-04 as TESTED_IN_SIMULATOR and show ID-02 only as unit-tested (MOCK_ONLY).
- **(b)** Approve a separate **3.0 legacy-simulator demo namespace**: fresh app/RP, `WORLD_PROTOCOL_VERSION=3.0`, `orbLegacy`, never mixed with 4.0 ventures. The code currently refuses 3.0 by design, so this needs your approval first.
- **(c)** Ask World DevRel how to get distinct 4.0 staging identities.

I recommend (a) now and (c) in parallel. A draft question for World feedback (`docs/FEEDBACK.md` is H-owned): *"In the staging simulator, switching test identity gives the same World ID 4.0 proof_of_human nullifier for the same action (verified via /api/v4/verify, `created_at` reused). How can two distinct 4.0 staging humans be simulated?"*

**How the connector URL was handled:** the URL was never written to disk, logs or my output.
- The simulator's CSP (`connect-src` limited to World hosts) blocks localhost fetches, and clipboard reads were denied.
- So a local hub page (127.0.0.1, one-time per-run token) opened the simulator tab and `postMessage`d each URL to it with the exact target origin.
- The simulator page held it in memory and filled the input; my tooling only saw the length and host (`staging.world.org`).

## 2. ENS parent setup — exact plan for H approval (NOT broadcast)

I re-verified X's reviewed plan (`vestige-treasury/docs/agent-reports/treasury/2026-11-07-ens-parent-review.json`) independently with C1's builder at Sepolia **block 12079559** (`evidence/ens-parent-reverify.json`):

| Check | Result |
|---|---|
| Rebuilt digest | **`1471c7880a7d7b89931c2320e6ce4cce252234c9164df8b01d4fec9b1e49576a`**, identical to X's reviewed digest |
| Calldata | byte-identical for P1 and P2 |
| `vestige.eth` | REGISTERED; current subregistry `0x0000…0000` (unset); owner roles on the name non-zero |
| Registrar balance | 0.3 Sepolia ETH (300000000000000000 wei) |
| Predicted parent `0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73` | no code yet |
| P1 `eth_call` from registrar | ok, returns `0x…61dc50fe2099012bd1d0a684192071ef51d7aa73` |
| P2 `eth_call` from owner `0x1ed73ee055b7B5379CcD398748281C5A82e9A41E` | ok |

**Plan `vestige.ens-plan/1` parent-setup, createdAt `2026-11-06T22:15:01.675Z`, chain 11155111:**

| Step | Signer | To | Calldata |
|---|---|---|---|
| P1 deploy parent UserRegistry (registrar root roles `REGISTRAR\|RENEW` = 65537) | **registrar `0xc63F0594309F21E35b41298C71d370c0d0A9313C`** (must be this address, because the CREATE2 prediction depends on the deployer) | VerifiableFactory `0xda70306c98e97ece36f997a21368e53298572991`, value 0 | `0x5d84121a0000000000000000000000009bd8a88719068d09ecee662f36c0e3856708366aad810106e04bb26ab27eabb6a364bad4b9ec74db6f9c421c184ae3eeff7596030000000000000000000000000000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000008437cb53a800000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000001000000000000000000000000c63f0594309f21e35b41298c71d370c0d0a9313c000000000000000000000000000000000000000000000000000000000001000100000000000000000000000000000000000000000000000000000000` |
| P2 `setSubregistry(labelhash("vestige"), 0x61Dc…Aa73)` | **owner `0x1ed73ee055b7B5379CcD398748281C5A82e9A41E`** (MetaMask), only after P1's receipt | ETHRegistry `0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4`, value 0 | `0x341ec55921952812fa04808958af603a28aa8649e7195d3c1132e4c434170bdc25da1fd800000000000000000000000061dc50fe2099012bd1d0a684192071ef51d7aa73` |

**After H approves the digest above:**
1. H, or C1 on H's instruction, sends P1 from the registrar keystore. With foundry, for example: `cast send 0xda70306c98e97ece36f997a21368e53298572991 <P1 calldata> --keystore <registrar keystore> --rpc-url <Sepolia RPC>`. Or call `broadcastApproved` with digest `1471c788…576a` and `VESTIGE_ENS_BROADCAST=I_HAVE_H_APPROVAL`.
2. Record the receipt. Check that `getCode(0x61Dc…Aa73) ≠ 0x` and that the `ProxyDeployed` event names it.
3. H sends P2 from the owner wallet with the exact calldata above, and records the receipt.
4. Read back: `ETHRegistry.getSubregistry("vestige") == 0x61Dc…Aa73`. Check the registrar holds `REGISTRAR|RENEW` on the parent and nothing more.
5. Only then set runtime `VESTIGE_PARENT_REGISTRY=0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73` and `VESTIGE_ENS_EXPIRY`. The expiry must be ≤ `vestige.eth`'s own expiry, which must be read from chain at that time. **I have not set either value.**
6. The first venture plan must then be built from a **real server ventureId** and approved separately. No placeholder plan may be broadcast.

## 3. C2 compatibility evidence and resolved CRs

`tests/identity/c2-compat.test.ts` is opt-in via `C2_ROOT`. It imports C2's **committed** `live-adapter.ts` and `agreement/terms.ts` from `vestige-product@50e4cf4` read-only, and drives them against C1's current handlers. Output is in `evidence/c2-compat-run.txt`.

- **Founder journey through C2's adapter: PASS.** It ran these steps in order:
  - sign-in A and B
  - create venture, invite, join
  - World request and verify for both founders (DEV MOCK portal)
  - venture detail, which carries `worldEnvironment: staging`
  - listing consent A, then B
  - public list
  - agreement v1, with C2's docHash equal to C1's
  - EIP-712 signing by both founders through C2's adapter, using C1's server-issued nonce payload
  - public evidence, which carries staging provenance
  - sign-out, which hits `DELETE /auth/session` and was checked as revoked server-side

  This supersedes C2's earlier "missing route / canonicalizer" observations, which were made against `1b502e6`.
- **Canonical vectors: 20/21 agree. One C2 defect:** C2's `canonicalize` accepts **17** levels of nesting, while the contract and C1 reject more than 16. This is C2's code, so I didn't change it. The fix for C2 is to check depth against the number of container levels, root = 1. The vector `invalid: "17 levels of nesting"` is in `tests/identity/vectors/canonical-v1.json`.
- **CR-C2-006 (World-environment provenance): implemented additively, C1-ACKed, H pending.**
  - `FounderSeat.worldEnvironment?` and `PublicIdentitySummary.founders[].worldEnvironment?` are set only after World verification, from the stored proof environment, and never guessed.
  - `events[].source` is exposed; for example, `founder_verified` gives `world-id-staging-4.0`.
  - Staging means the UI must show TESTED_IN_SIMULATOR. C2's adapter already reads these fields.
- **CR-C2-007 (listing shape): C1 proposes resolving it to the existing `listing: { listed, consents: [{ wallet, listed }] }`.** C2's committed adapter (`live-adapter.ts:302`) already consumes exactly this. The `optedIn` variant in C2's CR text is therefore unnecessary, and no caller needs to change. H, please record CR-C2-007 as "resolved to C1's existing shape". Consent detail is founders-only and absent from public output (tested).
- **Unknown treasury summaries stay `null`:** CR-ID-05 is still pending and nothing is registered.

## 4. Resync / reconciliation (finished)

`src/modules/identity/scripts/reconcile.ts` provides `reconcileIdentity(services, { retry? })`.

- **Default (read-only to chains):**
  - Re-confirms PENDING attestations through X's port.
  - Promotes ENS venture, founder and agreement steps only when the independent read-back already matches.
  - Reports `vestige.humans` mismatches.
  - Broadcasts nothing.
- **`retry: true` (operator decision):**
  - Re-runs ENS steps only if no transaction was ever recorded for them. A step with a recorded tx goes to `needsManualReview`, never blind re-broadcast.
  - Re-sends idempotent `humans`/agreement setText records; superseded agreement hashes are never published.
  - Re-submits attestations that failed before a tx existed.
- ENS events now record the founder wallet (`actor`) so retries are scoped per seat.
- New tests: 2 for reconcile, plus 1 for CR-C2-006/007.

## 5. Tests (actual)

```
tests/identity: npx tsc -p tsconfig.json --noEmit                      → PASS (no output)
npx vitest run --config vitest.config.ts                               → Tests 71 passed | 7 skipped (78)
VESTIGE_LIVE=1 REVIEW_PLAN=<X json> … live/ens-plans -t re-verification → 1 passed (read-only, block 12079559)
C2_ROOT=<product> … c2-compat                                          → 1 passed, 1 failed (C2 depth off-by-one, above)
VESTIGE_WORLD_STAGING=1 … live/world-staging                           → ran all 4 cases; exit 1 on the ID-02 assertion (simulator limitation, §1)
lint                                                                   → NOT RUN (no root lint config)
```

## 6. Remaining blockers (exact)

| ID | Blocker | Owner |
|---|---|---|
| B1 | Approve digest `1471c7880a7d7b89931c2320e6ce4cce252234c9164df8b01d4fec9b1e49576a` (exact calldata in §2). Then the registrar sends P1, H sends P2 from `0x1ed7…A41E`, and the receipts and read-backs are recorded. | H |
| B2 | After B1: set `VESTIGE_PARENT_REGISTRY` and `VESTIGE_ENS_EXPIRY` (≤ `vestige.eth` expiry). Then approve a first-venture plan built from a real server ventureId, followed by the live founder registration and the `TransferDisallowed` / `isEmancipated` negative test. | H approval, then C1 |
| B3 | ID-02 cannot be shown with the 4.0 staging simulator. Decide (a), (b) or (c) from §1. Production two-human uniqueness still needs real consenting people. | H (+ World) |
| B4 | Record H decisions: CR-C2-006 (implemented), CR-C2-007 → resolved to `consents`, CR-ID-05 (treasury summary seam; fields stay null until then). | H |
| B5 | C2 fixes the canonical depth off-by-one (17 → reject) and re-runs `c1-vectors`. | C2 |
| B6 | Root scaffold: one Next app, one shared SQLite with C1 `010_*` and X `020_*` migrations, `registerSeatAttester()` wired to X's real port, `viem@2.57.16`. Move the test harness deps to root. The 10 baseline-identical shared doc copies in this worktree need H's OK to discard before C1 merges `main`. | H |
| B7 | Suggest adding `private/` to the root `.gitignore` (`VESTIGE_DB_PATH=./private/vestige.db`). | H |
