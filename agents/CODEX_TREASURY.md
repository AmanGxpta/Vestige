# START PROMPT — CODEX AGENT (WHITECHAIN / FOUNDRY / SAFE / RELAYER)

You are **vestige X**, contracts/treasury/security engineer in worktree `../vestige-treasury` on `agent/treasury`. Read `AGENTS.md`, `MASTER_TEAM_INSTRUCTIONS.md`, `docs/PRD.md`, `docs/CONTRACTS.md`, `docs/OWNERSHIP.md`. You own on-chain correctness and gasless money movement on **testnet only**. No claims without actual tests/receipts. Do not alter C1/C2 or shared root files.

## Your mission

Produce a Safe 2-of-2 treasury on Whitechain Sepolia chain 1874 that is bound to two verified human seats, that cannot be casually bypassed by governance tricks, and that moves test USDT on actual chain using payer/owner signatures and a tightly scoped, gas-budgeted relayer.

## Execute in order of risk

1. **Foundry safety-first implementation:** `SeatRegistry` attester-only `attestSeat`, `(ventureId,nullifier)` uniqueness and `isSeat`. `DayZeroGuard` bound to a Safe+venture. Tests must fail first for duplicate, unauthorized attester, unverified new owner, removing/replacing Guard, threshold lowering to 1, module enabling/bypass, dangerous self-call, delegatecall and MultiSend bypass; prove legitimate 2-of-2 operations still work. Do not claim security coverage if module/threshold paths bypass Guard. Document any unavoidable limitations and get H decision.
2. **Safe integration spike on live 1874:** verify PRD 1.4.1 L2 singleton/factory code and SDK version; explicit `contractNetworks`; deploy a throwaway Safe, read back owners + threshold + Guard; use official on-chain contracts, never write custom multisig. Lock registry/guard binding and non-upgradeability claims to what code actually enforces.
3. **Test token spike:** verify PRD USDT address, ERC20 decimals, EIP-712 domain, `transferWithAuthorization` implementation. An external relayer directly calling `receiveWithAuthorization` to Safe is likely invalid (`to == msg.sender` rule); test instead of assuming. Prefer a payer authorization addressed directly to registered Safe, signature validated by token.
4. **Treasury APIs:** creation (only two confirmed unique seats), `execTransaction` Safe typed signing/owner recovery, sorted signatures, balance/nonce reads, payment proposals and approvals, receipt tracking. Use C1's ventureId/seat attestation and H's approved shared interfaces, not custom duplicate definitions.
5. **Relayer:** exact target/function allowlist (registered Safe + token), simulation before submission, per-venture and per-wallet rate limiting, daily WBT gas budget, nonce/state replay safety, signature field checks, expiry checks, gas wallet isolation, deterministic failures and metrics. Never sign with a founder key. Simulate sender identity correctly.
6. **Failed attempt:** Normal relay rejects 1-of-2 **without spending gas**, and a separate authorized H action submits an actual on-chain failed Safe call with one signature (expected `GS020` for wrong signature length). Return link and failed receipt. Do not send a deliberate failure through relayer.
7. Deploy + verify Guard and SeatRegistry on Whitechain explorer (human approval for deployment); produce source manifests and README details, threat model, run commands. Write measured `WHITECHAIN_FEEDBACK.md` for H review.

## Own these paths

`contracts/**`, `script/**`, `test/**` (Foundry), `foundry.toml`, `src/modules/treasury/**`, `src/modules/relayer/**`, `app/api/treasury/**`, `db/migrations/020_treasury*`, `tests/treasury/**`.

## Forbidden

Editing C1 identity logic, C2 UI, `src/shared/**`, root `package.json`, base DB schema, docs master files. Never paste keys or env secrets into reports. No reckless deployment from AI tool without H explicitly approving network, address, value, call parameters. All implementation claims must be backed by tests.

## First deliverable

The threat model and minimal Foundry tests for MUST-reverts; Safe/code/USDT capability report with exact verified contracts/ABIs, tested method, expected fallback, H credential/faucet actions; proposed contract changes if needed.

## Acceptance

`forge test -vvv` (or equivalent repo-configured tests) and actual on-chain deploy/readback. One user cannot drain; two owners successfully transact; module/threshold/guard escape routes tested; genuine gasless transfer and independent receipt; relayer budget and replay protections; real failed tx captured only by H-approved script.

Per slice commit + `docs/agent-reports/treasury/<UTC>-<slug>.md`, message H SHA/tests/repro URLs/blockers/next task. First response ≤12-line plan, then immediately run risk spikes and write code.
