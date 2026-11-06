# C1 identity — v0 ACK and follow-through (2026-11-07)

**Role:** C1 (Claude Identity) · **Branch:** `agent/identity` · **Base:** `1b502e6` · **Approved revision read:** `docs/CONTRACTS.md` and `docs/DECISIONS.md` at integration commit `30d1ef6` (read with `git show 30d1ef6:<path>` from the integration checkout; not merged).

## 1. Compatibility ACK

**C1 ACKs `docs/CONTRACTS.md` v0 at `30d1ef6` with no blocking deviation.** The approved items are implemented in C1-owned paths: CR-ID-01…04, D-016/D-021 (World pinning), CR-C2-001, CR-C2-002, CR-C2-005, D-009/D-010/D-014/D-023.

C1 behaviour the contract doesn't spell out (all additive or stricter, no widened route, schema or environment name):

| Area | C1 behaviour |
|---|---|
| Error codes | Adds `RATE_LIMITED` (429), `ORIGIN_FORBIDDEN` (403), `IDEMPOTENCY_CONFLICT` (409) and `NONCE_INVALID` (400) to the stable `{ error: { code, message } }` set. |
| Signing nonce | `POST …/sign` accepts only a nonce the server issued to that signer for that exact version, docHash and expiry through `GET …/sign`. This is stricter than "server validates freshness and rejects replay". C2 must GET the payload before signing, which the contract already implies. |
| Signing payload JSON | `message` uint256 fields are decimal strings. Top-level `version`, `docHash`, `nonce`, `expiry` (Unix s) and `expiresAt` (ISO) are added. Hint bounds: expiry from now+60 s to now+7 d; default now+1 h; default nonce is a random uint256. |
| `GET /ventures/:id` | Adds `venture.listing { listed, consents[] }`. |
| `GET /ventures` | `VentureSummary` plus the contract's `observedAt`, `source` and `verificationStatus`, where `verificationStatus` is the ENS confirmation of the venture name. `treasuryActive`/`funded` are always `null` (see the CR below). Capped at 200 items, newest first. |
| Origin | Mutations and auth bootstrap reject a mismatched `Origin` or `Sec-Fetch-Site: cross-site`. A missing Origin (non-browser client) is allowed; bearer auth still applies. |
| Idempotency-Key | Honoured when present, 8–128 URL-safe characters. Not required, because a missing key is executed normally. 5xx responses are not cached. |
| Rate limits | In-memory and single-host, per D-009: challenges 10/min per wallet, 5 open per wallet, 300/min global; sessions 300/min global. |
| Auth config | Missing or invalid `VESTIGE_AUTH_DOMAIN`/`VESTIGE_AUTH_URI` fails sign-in closed with `CONFIG_MISSING` (no localhost default). The domain must equal the URI host, and https is required outside localhost. |
| World config | Loads only with an explicit `WORLD_ENVIRONMENT` of `staging` or `production` and `WORLD_PROTOCOL_VERSION=4.0`. Any 3.0 value leaves World unconfigured, per D-021. |

**One precise, non-blocking CR:**

`CR-ID-05: (none) → TreasurySummaryPort.summary(ventureId) → { treasuryActive: boolean|null, funded: boolean|null, observedAt: string, source: string, verificationStatus: "UNKNOWN"|"PENDING"|"ACTIVE"|"UNVERIFIED"|"FAILED" } | PURPOSE: CR-C2-001 requires the list's treasury booleans to be "joined from X's read service", but v0 defines no in-process seam for that | AFFECTED: X (implements, read-only), C1 (calls; already coded in src/modules/identity/ports.ts, unregistered) | MIGRATION: none — fields stay null until registered | EVIDENCE: v0-followthrough.test.ts list test asserts null | H: PENDING`

The ACK does not depend on this CR. Without it, the public list reports treasury state as unknown (`null`), and never as `false`.

## 2. What changed (owned paths only)

| Item | Implementation | Tests |
|---|---|---|
| CR-ID-04 hashed nullifier | `world.ts nullifierHash()` = `keccak256(abi.encode(uint256 n))`. It is the only nullifier-derived value passed to `SeatAttestationPort`. The raw nullifier stays in `identity_world_nullifiers`. | Fixed vector (`255`, hex/decimal agree); the attester receives exactly the digest; raw decimal/hex absent from the attester input, verify response and view. |
| CR-ID-03 C1 side | `ports.ts` port types are verbatim from the contract (`chainId: 1874` literals). `checkAttestSubmit`/`checkSeatConfirmation` treat off-contract results as FAILED: malformed tx hash, wrong chain, missing block or `confirmedAt`, unknown state. A throwing `confirm` stays PENDING. `retryAttestation` re-submits only when no tx hash exists. `reconcile()` promotes PENDING/FAILED ENS steps only on independent read-back and never re-broadcasts. | 4 tests |
| CR-C2-002 `vestige.ventureId` | Written in the venture resolver initializer, alongside `status=workspace` and `humans=0`, through `recordCalls`. Venture-name confirmation now requires `status == workspace` **and** `ventureId ==` the server value byte-for-byte. `EnsReader.venture()` returns it. | Plan bytes contain the key and value; an uppercase ventureId is rejected; a mismatched read-back leaves the name FAILED. |
| CR-C2-001 consent/list | `POST /api/identity/ventures/:id/listing { listed }` (each founder sets their own consent). `GET /api/identity/ventures` lists only ventures where every current seat holder consented. A new founder joining delists the venture until they opt in. Table `identity_listing_consent`. | Full route test, including the exact key set and no wallet/PII. |
| Session hardening (D-010) | `DELETE /api/identity/auth/session` returns 204 and revokes server-side. Strict 43-character bearer format; nonce/signature format checks; expired sessions deleted on use; trusted https config; rate limits; same-origin checks; `no-store`; no CORS headers. Idempotency ledger `identity_idempotency` is scoped to wallet + route + key with a body digest. | 6 tests, including a world/verify retry replaying the result with a single portal call. |
| Agreement payload + canonical hash | Server-issued nonces are recorded in `agreement_sign_nonces`, burned in the signature transaction, and bound to version, docHash and expiry. EOA-only 65-byte signatures. The canonicalizer now matches the contract exactly: sparse or undefined array entries are rejected (previously a sparse array produced `[1,,2]`), the depth limit is 16 containers, and symbol keys are rejected. | 2 new agreement tests and 4 vector tests |
| Shared C1↔C2 vectors | `tests/identity/vectors/canonical-v1.json`: 9 valid, 3 special and 9 invalid cases, plus the exact founding-terms document C2's preview must byte-match (canonical string and docHash). A test keeps the JSON in sync with the code. | `canonical-vectors.test.ts` |
| SQLite | `busy_timeout=5000` added (WAL and foreign keys were already on). New additive migration `db/migrations/010_identity_v0_followthrough.sql`, with no ALTERs. | — |
| Harness | `viem` pinned to **2.57.16**, the contract's root pin; it was 2.57.7. | All suites re-run on 2.57.16 |

## 3. World ID 4.0 staging simulator test — READY, NOT RUN (blocked on the RP key)

`tests/identity/live/world-staging.live.test.ts` runs the real path: RP signing (`signRequest`) → `IDKit.request(...).preset(proofOfHuman({signal: wallet}))` on the staging bridge → proof from the World ID Simulator → `POST developer.world.org/api/v4/verify/rp_ec275669640f9143` → C1's uniqueness gate in SQLite. The attester and ENS ports are DEV MOCK in this run, so no chain transaction is sent.

The sequence, as requested:
1. Venture 1, wallet A, simulator identity #1 → expect VERIFIED.
2. Venture 1, wallet B, simulator identity #2 → expect VERIFIED, with a different nullifier digest.
3. Venture 2, wallet A, identity #1 → expect VERIFIED (same human, different venture is allowed).
4. Venture 2, wallet C, identity #1 → expect `DUPLICATE_HUMAN` with the PRD message. The portal's own response to the reused nullifier is recorded.

Evidence goes to `docs/agent-reports/identity/evidence/world-staging-e2e.json`, labelled **`TESTED_IN_SIMULATOR`**. It includes every portal request and response, with raw nullifiers replaced by their CR-ID-04 digest and proofs omitted. These results are **simulator identities, not two real verified humans**, and must not be described otherwise.

**Status: NOT RUN.** No `WORLD_RP_SIGNING_KEY` exists in secure local configuration. The runner refuses to start unless the key is in a **gitignored, mode-600** file (default `<worktree>/.env.local`). It checks the format without printing the value. App and RP IDs default to `app_464659fa58b71bf5f1a1b65c69d0b744` / `rp_ec275669640f9143`.

Browser check (read-only, 2026-11-07): `simulator.worldcoin.org` loads and generates a simulator identity with a "Paste code" input. World's own docs (`docs.world.org/world-id/SKILL.md`, Phase 5) say staging actions verify only against this simulator. **Risk:** the simulator shows a banner saying it "will change with the adoption of World ID 4.0". If it can't answer a 4.0 `proofOfHuman` request today, step 1 will fail visibly, and the fix is a decision for H (D-021: no protocol switch without approval and a fresh namespace). Nothing is claimed until the run completes.

## 4. ENS scripts for H review — dry run only, nothing broadcast

`src/modules/identity/scripts/ens-plans.ts` contains the following. The two plans are each bound to a sha256 digest.

- **`buildParentSetupPlan`**, two steps:
  - P1 (registrar): `VerifiableFactory.deployProxy(UserRegistryImpl, salt(vestige.eth), initialize([{registrar, REGISTRAR|RENEW}]))`.
  - P2 (the `vestige.eth` owner's wallet; the calldata is printed for you to send): `ETHRegistry.setSubregistry(labelhash("vestige"), predictedParentRegistry)`.
- **`buildFirstVenturePlan`**, three steps plus founder steps:
  - V1: the venture UserRegistry.
  - V2: the venture resolver, with status, ventureId and humans=0.
  - V3: `register(slug)` in the parent.
  - Optional founder steps: a resolver per founder, and `register` with roleBitmap 0.
- **`dryRun`**: `eth_call` and `getCode` only.
- **`broadcastApproved`**: refuses unless `VESTIGE_ENS_BROADCAST=I_HAVE_H_APPROVAL` is set **and** the plan digest equals the digest H approved. It sends REGISTRAR steps only, and C1 never calls it.

Live read-only dry run on Sepolia at **block 12079226**; output in `evidence/ens-plans-dryrun.json`:

| Step | Result |
|---|---|
| `vestige.eth` | `AVAILABLE` |
| Registrar `0xc63F0594309F21E35b41298C71d370c0d0A9313C` (X's keystore record) | balance **0 wei** |
| P1 | `eth_call` ok; returned `0x61dc50fe2099012bd1d0a684192071ef51d7aa73`, equal to the off-chain CREATE2 prediction. This confirms the prediction. |
| P2 | Not simulated, because the signer is unknown until `vestige.eth` is registered. |
| V1 / V2 | `eth_call` ok; each returned its predicted proxy. |
| V3 | No contract yet at the parent registry, which is expected until P1 and P2 run. |
| Parent plan digest | `068278cbaf98f1ec2647100461deb83e9a89c6752634db5bbc056a981fbbe439`. It contains a `createdAt`, so regenerate it right before approval. |

The first-venture plan in the evidence uses a placeholder ventureId. It must be regenerated from the real server `ventureId`, so do not approve that digest.

## 5. Tests and actual output

```
tests/identity (vitest 4.1.12, viem 2.57.16, node:sqlite)
npx tsc -p tsconfig.json --noEmit                       → no output (PASS)
npx vitest run --config vitest.config.ts                → Tests 68 passed | 6 skipped (74)
VESTIGE_LIVE=1 … live/ens-sepolia                       → Tests 4 passed (4)   (read-only)
VESTIGE_LIVE=1 … live/ens-plans                         → Tests 1 passed (1)   (read-only, block 12079226)
VESTIGE_WORLD_STAGING=1 … live/world-staging            → NOT RUN (no RP key in secure local config)
lint                                                    → NOT RUN (no lint config at root)
```

World behaviour in unit tests is still MOCK_ONLY (`FakeWorldPortal` copies the portal's accept-on-reuse behaviour).

## 6. Shared docs and merge state

- The 10 uncommitted shared and master doc edits in this worktree are **byte-identical to the `50efcf2` baseline already on `main`** (sha1 comparison per file). `docs/CONTRACTS.md` and `docs/INSTRUCTION_FOR_HUMAN.md` differ from `30d1ef6` only because H later changed them on main. I have not committed, overwritten or discarded them, and **I have not merged `main`**.
- Proposed reconciliation for H to confirm: discard those 10 working-tree copies (`git checkout -- <the 10 paths>`, which is lossless because they equal `50efcf2`), then C1 merges `main` and re-runs the suite.
- `.env.example` (H-owned) sets `VESTIGE_DB_PATH=./private/vestige.db`. `*.db*` is gitignored but `private/` isn't. I suggest H adds `private/` to the root `.gitignore`.

## 7. Human-only actions (exact)

| ID | Action | Gate |
|---|---|---|
| H-C1-02a | Put the World RP signing key in `<vestige-identity>/.env.local` as `WORLD_RP_SIGNING_KEY=<hex>` with `chmod 600`, by your own hand, not in chat. One way: copy the key, then `! printf 'WORLD_RP_SIGNING_KEY=%s\n' "$(pbpaste)" > .env.local && chmod 600 .env.local`. Confirm in the Developer Portal that `app_464659…` / `rp_ec2756…` is a **staging** app with World ID 4.0 enabled. | Unblocks §3. Then tell C1 "run staging". C1 drives `simulator.worldcoin.org` (two simulator identities) and returns the TESTED_IN_SIMULATOR evidence. |
| H-C1-01b | Approve discarding the 10 baseline-identical doc copies in this worktree, so C1 can merge `main`. | §6 |
| H-C1-03 | Fund the Sepolia registrar `0xc63F…313C` (currently 0 wei). | Before any ENS tx |
| H-C1-04 | Register `vestige.eth` on Sepolia (ETHRegistrar commit/reveal, paid in MockUSDC; about 8 MockUSDC per year) **to your owner wallet**, and send C1 the owner address and tx hash. | Needed for P2 |
| H-C1-05 | Review the regenerated parent plan and approve its exact digest. Send P2 from the owner wallet. Set `VESTIGE_PARENT_REGISTRY` and `VESTIGE_ENS_EXPIRY` after the read-back. Then approve the first-venture plan digest built from a real server ventureId. | No broadcast until approved |
| H-C1-06 | Decide CR-ID-05 (treasury summary seam), and have X ACK it. | Public list treasury fields |
| H-C1-07 | Production uniqueness still needs real, distinct, consenting Orb-verified people. **The simulator results do not satisfy this.** | Not available per H |
| H-C1-08 | Decide on the World Agent Pass prize (carried over). | — |

## 8. Next unblocked C1 tasks

1. Run §3 as soon as the RP key is placed.
2. A live negative ENS test (`unsafeTransfer` → `TransferDisallowed`, `isEmancipated`) after the first founder is registered.
3. A resync/reconcile CLI wrapper around `VentureService.reconcile()`.
4. Merge `main` after §6 is confirmed.
