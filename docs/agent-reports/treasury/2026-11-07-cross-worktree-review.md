# H support: cross-worktree readiness review

Reviewed identity a00016b, product 50e4cf4, treasury 1d2ff44, integration 30d1ef6. All three owners have ACKed approved v0. This is a review, not integration acceptance or a new contract approval.

## Completed checks and preparation

- Restricted identity `.env.local` from 644 to 600 as required by its staging runner. It is gitignored; the signing key has valid 32-byte hex format and derives the signer address supplied by H. No secret was displayed or committed. With H approval, added missing public app/RP IDs, staging environment, protocol 4.0, Sepolia RPC and localhost:3200 auth domain/URI, preserving all existing settings. Portal acceptance and simulator proof remain untested.
- Sepolia ETHRegistry reports vestige.eth REGISTERED, owner `0x1ed73ee055b7B5379CcD398748281C5A82e9A41E`, and zero parent subregistry. Registrar balance is 0.3 Sepolia ETH.
- Generated the parent setup using C1's actual plan builder and observed owner; simulated P1 and P2 successfully at block 12079449. Public plan: `2026-11-07-ens-parent-review.json`; digest `1471c7880a7d7b89931c2320e6ce4cce252234c9164df8b01d4fec9b1e49576a`. Predicted parent `0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73`. No transaction sent; the plan requires H approval and appropriate signer for each step.
- Read all six fresh Whitechain wallets: zero WBT. Funder test-USDT balance zero. Public results in `2026-11-07-cross-worktree-readiness.json`.
- Independently ran treasury service suite: 62 passed, 0 failed. Reviewed the unsigned infrastructure plan (no broadcast).

## Remaining integration work

- Main has docs/config approvals only; root scaffold and C1/C2/X implementation branches are not integrated there.
- C2's missing C1 routes/canonicalizer observations target old identity 1b502e6; a00016b already fixes them. Re-run C2 against current C1 rather than duplicate fixes.
- CR-C2-006 (proof-environment provenance) remains relevant: C1 public founder records omit World environment; C2 cannot independently label staging. Need H decision and owner implementation.
- CR-C2-007 proposes listing.optedIn while current C1 supplies listing.consents; choose one accepted shape and adapt caller.
- CR-C2-008 manifest URL template and CR-ID-05 treasury-summary port await H acceptance; summary booleans should remain null until a real read service exists.
- CR-C2-009 is material: X readback is flat, lacks balance/deposit/rejected-evidence fields, and its payment readback lacks typed data/approval state needed by C2 after reload. Creation returns typedData (not safeTypedData). Freeze one exact payload and run cross-owner tests.
- Shared scaffold and runtime composition must register the real port/shared SQLite/migrations and preserve disabled signing defaults until separately reviewed.
- World staging runner has not run; it requires simulator interaction and its portal/protocol test may fail. Production two-human uniqueness remains unavailable.
- ENS P1/P2, expiry/parent runtime configuration, a genuine server ventureId and its venture/founder writes remain. No placeholder plan may be broadcast.
- Whitechain funding, source-reviewed deployments/manifests, signer and alert transport, measured L1 fee policy, successful funding/payment and separate mined GS020 receipt remain.

## Human actions

H must approve exact live plans before signing, operate the name-owner MetaMask for P2, fund testnet-only wallets, supply a working alert destination, and perform real wallet signature smoke tests. No new shared CR was approved by this review. Existing shared/untracked files in sibling worktrees were preserved; no branch was merged or reset.
