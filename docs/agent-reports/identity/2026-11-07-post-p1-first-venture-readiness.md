# C1 identity — post-P1 readiness: labels, first-venture workflow, ENS negative tests (2026-11-07)

**Role:** C1 · **Branch:** `agent/identity` · **Synced:** `main@0e06e8a` (H had already merged main into this branch as `971032a`/`991f524`; I merged `0e06e8a`), then `main@1f266ef` (P1 record). Merges `8dd61b2` and `9d88b21`. The work commit is `e4651fe`. **No protocol switch and no ENS broadcast by C1.** Main's shared doc edits were integrated by H; nothing of theirs was overwritten, and there is no stash or loss.

## 1. 4.0 staging evidence labels (D-024)

| Case | Label |
|---|---|
| ID-03: same simulated identity, second wallet, same venture → `DUPLICATE_HUMAN` | **TESTED_IN_SIMULATOR** |
| ID-04: same simulated identity, different venture → allowed | **TESTED_IN_SIMULATOR** |
| ID-02: two distinct founders | **MOCK_ONLY**. The simulator returned the same 4.0 nullifier for two selected test identities. |
| Real humans | **None.** No production World ID uniqueness is claimed. |

- `evidence/world-staging-e2e.json` now carries `caseLabels` and `relabelledAt`. The recorded exchanges and outcomes are unchanged.
- The runner applies the same rule to future runs:
  - ID-02 becomes TESTED_IN_SIMULATOR only if the simulator yields two distinct verified nullifiers.
  - It stays MOCK_ONLY if the nullifier is identical.
  - Any other outcome fails.
- In the API, staging seats carry `worldEnvironment: "staging"` and event `source: "world-id-staging-4.0"` (CR-C2-006), so C2 shows TESTED_IN_SIMULATOR. The label set itself is unchanged.

## 2. Parent setup: P1 done, P2 pending (independent read-back)

H's approval and P1 are recorded on main (`docs/agent-reports/human/2026-11-07-p1-product-integration.md`):
- Approved digest: `1471c7880a7d7b89931c2320e6ce4cce252234c9164df8b01d4fec9b1e49576a`.
- P1 tx: **`0x3a32aca8086f8c8bcc3d4026e98e5caea28cf921259d39e5d87d753c1b30e151`**, block **12079704**, status 1, from the registrar to the VerifiableFactory.

**My independent checks** (read-only; `evidence/ens-parent-readback.json` at block 12079721, re-checked at 12079746):
- I found the factory `ProxyDeployed(sender=registrar, proxy=0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73)` log in that tx myself.
- The parent has code. The registrar holds `REGISTRAR|RENEW` and none of UNREGISTER, SET_SUBREGISTRY, SET_RESOLVER, SET_PARENT, UPGRADE or CAN_TRANSFER_ADMIN.
- The `vestige.eth` owner holds **no** root roles on the parent.
- **P2 is not sent:** `ETHRegistry.getSubregistry("vestige") = 0x000…000` at block 12079746.
- `vestige.eth` expiry is `1825560312`. The registrar balance is 0.299999097 ETH.

I fixed one bug of my own here: an earlier draft of the owner-roles check queried the registrar instead of the owner. The values above come from the corrected check, confirmed with `cast`.

## 3. First-venture workflow (ready; refuses until P2)

1. **Gate:** with no `ENS_REGISTRAR_PRIVATE_KEY` in the server env (the current state), `ApprovalGatedEnsPort` is used. The API never broadcasts. ENS steps for a new venture stay **PENDING** ("awaiting H-approved ENS plan"), not FAILED.
2. **Create the venture through the API.** This produces the real server `ventureId`. Founders take their seats and verify through World staging.
3. **Prepare:** `VESTIGE_LIVE=1 VESTIGE_DB_PATH=<server db> VENTURE_ID=<id> VESTIGE_ENS_EXPIRY=<≤1825560312> npx vitest run --config tests/identity/vitest.config.ts first-venture-plan`. This:
   - reads the venture from SQLite (an unknown id → NOT_FOUND);
   - **refuses unless the live parent read-back passes** (P2 landed, roles clean), the expiry is within the parent's, the venture's ENS isn't already verified, and the label is AVAILABLE;
   - builds the plan from server state: the real ventureId, World-verified founders only (each with `worldEnvironment`), `vestige.humans` = verified count, and `vestige.agreement` only if fully signed. A staging disclosure (TESTED_IN_SIMULATOR) is recorded in `plan.inputs.source`;
   - dry-runs it and writes `evidence/first-venture-plan-<slug>.json` with the **digest for H approval**.
4. **H approves that digest.** The operator executes it via `broadcastApproved` (digest + `VESTIGE_ENS_BROADCAST=I_HAVE_H_APPROVAL`, REGISTRAR steps only). A changed plan or a wrong digest is refused, and this was tested.
5. **`reconcileIdentity(services)`** promotes the PENDING steps to VERIFIED **only on Universal Resolver read-back**.
6. **`postDeploymentChecks`** runs the read-only negative tests (§4).

## 4. ENS negative tests and reconciliation, rehearsed on a local fork

`tests/identity/live/ens-fork-rehearsal.live.test.ts` produced `evidence/ens-fork-rehearsal.json`. It's labelled **LOCAL_FORK_REHEARSAL**: an anvil fork of Sepolia at block 12079722 with impersonated registrar and owner. **It is not Sepolia evidence.** World proofs were DEV MOCK.

The workflow it rehearsed:
- P1 inherited from Sepolia.
- P2 from the impersonated owner.
- Parent read-back: all checks pass.
- A venture created through the gated services stayed PENDING.
- A plan was built from that database. Its digest in the last run was `6e2e7b3c…4492`; it is fork-only and must not be approved.
- Seven steps executed: V1–V3 plus a resolver and registration for each of two founders. A wrong digest was refused.
- Reconciliation, read-only, promoted 3 steps to VERIFIED: the venture and both founders.

**All 25 post-deployment checks passed:**
- `vestige.ventureId` equals the server id, `status=workspace`, `humans=2`.
- The venture registry is emancipated, and the registrar holds none of the 6 dangerous roles on it.
- For each founder:
  - `addr` and `ownerOf` equal the founder wallet.
  - `safeTransferFrom` → **TransferDisallowed**.
  - `unsafeTransfer` → **TransferDisallowed**.
  - The registrar writing the founder's resolver → **EACUnauthorizedAccountRoles**.
  - The founder writing the venture resolver → **EACUnauthorizedAccountRoles**.
  - The founder writing their own resolver succeeds (`eth_call` only).

On Sepolia, the same checks run read-only after the approved first venture lands. The negatives are `eth_call` simulations from the named sender, so no keys are needed and nothing is sent.

## 5. Tests (actual)

```
tests/identity harness: tsc PASS; vitest → Tests 76 passed | 11 skipped (87)
root (integrated): tsc --noEmit PASS; vitest → Tests 100 passed | 1 skipped (101); next build PASS (19 API routes + pages)
VESTIGE_LIVE=1 … live/ens-plans -t "parent read-back" → 1 passed (read-only, block 12079721)
VESTIGE_FORK=1 … live/ens-fork-rehearsal → 1 passed (LOCAL_FORK_REHEARSAL, 25/25 checks)
lint → NOT RUN (no lint config)
```

Root `node_modules` was installed in this worktree from the committed lockfile (`pnpm install --frozen-lockfile`) to run the integrated checks. No package or config file changed.

## 6. Receipts

| Item | Tx | Block | Status | Who |
|---|---|---|---|---|
| P1 deploy parent registry | `0x3a32aca8086f8c8bcc3d4026e98e5caea28cf921259d39e5d87d753c1b30e151` | 12079704 | success; read back independently by C1 | registrar (operator, H-approved) |
| P2 set subregistry | — | — | **not sent** (verified unset at 12079746) | H owner wallet |
| First venture | — | — | not planned yet (needs P2) | — |

## 7. Remaining blockers (exact)

| # | Blocker | Owner |
|---|---|---|
| 1 | Send **P2** from `0x1ed73ee055b7B5379CcD398748281C5A82e9A41E`: to `0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4`, data `0x341ec55921952812fa04808958af603a28aa8649e7195d3c1132e4c434170bdc25da1fd800000000000000000000000061dc50fe2099012bd1d0a684192071ef51d7aa73`, value 0. Share the tx hash. | H |
| 2 | After P2: C1 re-runs the parent read-back. Then set runtime `VESTIGE_PARENT_REGISTRY=0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73` and `VESTIGE_ENS_EXPIRY` (≤ 1825560312). **Leave `ENS_REGISTRAR_PRIVATE_KEY` out of the server env** so the API stays approval-gated. | C1, then H |
| 3 | Create the first venture through the deployed API (real ventureId, founders verified on World staging, i.e. TESTED_IN_SIMULATOR). C1 runs §3 step 3 and returns a **separate first-venture digest**. H approves it, and the operator executes it. | H + C1 + operator |
| 4 | Post-landing: C1 runs `reconcileIdentity` and `postDeploymentChecks` on Sepolia and records the receipts and read-backs. | C1 |
| 5 | ID-02 remains MOCK_ONLY until a real distinct 4.0 proof is available (D-024). Production two-human uniqueness needs real consenting people. | H / World |
| 6 | X ACKs and registers `TreasurySummaryPort` (CR-ID-05) and the real `SeatAttestationPort`. Until then, the treasury fields stay `null` and attestation fails closed. | X |
| 7 | C2: canonical depth off-by-one (17 levels accepted), from the previous report. | C2 |
