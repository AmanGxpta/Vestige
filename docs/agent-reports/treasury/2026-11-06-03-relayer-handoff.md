# Treasury handoff — restricted relayer and human deployment runbook

## What changed
SeatRegistry, VestigeGuard and atomic SafeSetup are implemented as local, proposed
treasury interfaces. RestrictedRelayer constructs only two calls: the approved token's
transferWithAuthorization to a manifest-registered Safe, and that Safe's execTransaction
wrapping token.transfer. No raw execution endpoint or founder-key handling exists.

Authorization checks include chain/domain, raw bigint amounts, registered recipient,
expiry, EOA signature recovery, exactly two distinct current Safe owners, sorted
signatures, Safe nonce and verified seats/configuration. RpcIO pins reads to a fresh
block and checks runtime hashes, token proxy implementation/domain/decimals, singleton,
Guard/Safe/Registry/venture binding, modules and handler. The relayer sender cannot
be a founder or the registry attester. Registrar separation needs H's signer configuration.

FileJournal uses an exclusive filesystem lock, fsync and atomic rename. Replay keys,
gas reservations and per-wallet/per-venture rates persist before broadcasting. An
ambiguous send becomes UNKNOWN with no automatic retry; any RESERVED/UNKNOWN/SUBMITTED
entry blocks new intents for that gas wallet until confirmation or human reconciliation.
This avoids automatic sender-nonce reuse. Journal is single-host, one dedicated wallet;
other processes must not use that wallet. A crashed lock intentionally requires recovery.
Signature payloads are never persisted. Relayer submission is private within the class.

Every call estimates and simulates as the actual sender. Price/gas limits, a daily WBT
reservation budget and low balance guard apply before submission. Low balance emits
an injectable metric; a real alert transport remains operator configuration. Receipts
need two confirmations, expected token Transfer and Safe ExecutionSuccess (payments),
an independent block-pinned recipient balance read and reverified treasury state.
SUBMITTED does not mean EXECUTED; mined failures become FAILED.

Added human-only scripts for infrastructure and atomic Safe creation, plus
`script/treasury/RUNBOOK.md` with exact simulation, broadcast, verification, readback,
test and deliberate GS020 commands. No secret loading or broadcast was performed.

## Commits/files
Earlier milestones: `31f6667` registry; `aeb8ac1` Guard/setup/capability.
This commit: `src/modules/relayer/**`, guarded SDK builder, `tests/treasury/**`,
human scripts/runbook, constructor assertion fixes, formatting of owned Solidity,
and final evidence/report files. No root package, shared API/types, master docs,
identity or product code was changed by X. Pre-existing shared-file edits remain unstaged.

## Tests + actual output
- `forge test -vvv`: **33 passed, 0 failed, 1 skipped** (offline fork suite skip).
  `2026-11-06-final-contract-suite.txt` includes 256-run self-call selector fuzzing.
- `WHITECHAIN_FORK_RPC=https://rpc.testnet.whitechain.io forge test --match-contract WhitechainForkTest -vvv`:
  **5 passed, 0 failed**, actual deployed bytecode at local fork block 12353825;
  `2026-11-06-final-whitechain-fork.txt`.
- `npm test --prefix src/modules/relayer`: **25 passed, 0 failed**;
  `2026-11-06-relayer-suite.txt`. These are policy/crypto/journal tests with chain
  adapter doubles, distinct from the following real-bytecode integration test.
- `node tests/treasury/local-fork.integration.mjs`: **passed** on local silent Anvil.
  Protocol Kit 8.0.11 creates the guarded Safe using the atomic helper; real Safe and
  token bytecode exercise funding, replay refusal, one-signature refusal before send,
  two-owner payment, 2-confirmation receipts and 500000 raw USDT at the recipient.
  `2026-11-06-relayer-local-fork.txt` labels LOCAL_ANVIL_FORK_ONLY and zero live broadcasts.
- `node src/modules/treasury/spike/capabilities.mjs`: live read-only capability output
  in `2026-11-06-final-live-capabilities.json`; official package code hashes match.
- `forge build --sizes`: success; SeatRegistry runtime 915 B, VestigeGuard 4041 B,
  SafeSetup runtime 7729 B before constructor-only validation/metadata change.
  No size exceeds deployment limits. Vendored Safe lint warnings were not patched.
- Syntax checks for relayer/RPC modules and whitespace check on owned tracked files passed.
  No root lint/typecheck project exists in this checkout; not claimed.

Incremental RED→GREEN transcripts: registry, Guard, setup and relayer TDD text files.
Latest additional RED cases (sender separation, mined failure status, unresolved sender
nonce and missing singleton code) are followed by the final green suite files above.

Foundry 1.9.0 rewrites large test deployments into vm.deployCode. A constructor test
with two pending expectRevert calls falsely passed because the second cheatcode reverted.
Constructor assertions now use explicit external wrappers and exact revert reasons;
the missing-code case was rerun RED, then fixed with code-length/zero checks, then GREEN.
The contaminated-module and zero-attester constructor assertions were also hardened.

## Evidence URLs/tx hashes
Live RPC: https://rpc.testnet.whitechain.io
Official deployments: https://github.com/safe-global/safe-deployments
Safe module source: https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/base/ModuleManager.sol
Token verified implementation: https://explorer.testnet.whitechain.io/address/0x26425662D126412128967ECf0a02EC48573026F7
ERC-3009: https://eips.ethereum.org/EIPS/eip-3009
Exact addresses, code hashes, block numbers and SDK factory eth_call output are in JSON.
**No live deployment/funding/payment/failed-attempt tx hashes exist.** Local receipts
must never be linked to the public explorer or presented as live Whitechain success.

## Decisions proposed/implemented
CR-X-001 remains PROPOSED pending H response: VestigeGuard naming, frozen two-owner
count, verified-seat swaps, no MultiSend/delegatecalls/modules/handler, atomic helper,
no recovery/P1 revoke. Source/tests are reviewable; no shared interface is declared locked.
Use exact token domain Tether USD / 1 / 1874 / proxy, 6 decimals. External receive relay
fails; transferWithAuthorization is the supported funding path.
Current official safe-deployments 1.37.67 **already lists 1874** (contrary to the PRD's
uncertain SDK hypothesis); explicit contractNetworks overrides were still tested.
Both live canonical code hashes match the official package, not merely nonempty code.

## Remaining issues / deployment blockers
1. H must accept interfaces/restrictions, wallet/session authentication, persistence,
   secure signer/nonce ownership and the deployment manifest schema. No HTTP/API,
   C1 attestation bridge or UI wiring is exposed before those seams are accepted.
2. C1 must supply real proof-bound unique seats and canonical ventureId. The attester
   remains trusted and can lie; on-chain hash uniqueness is not proof verification.
3. OP L1 data fees are outside EVM gasLimit. The configurable fixed L1 fee reservation
   is conservative policy, **not a hard protocol cap on total WBT fees**. A measured
   data-fee policy, monitoring/circuit breaker and narrowly funded gas wallet need H
   acceptance before live use. Do not repeat an absolute “nobody can drain it” claim.
4. FileJournal is single-host. Distributed service needs H's transactional DB adapter.
   UNKNOWN entries/retained locks require safe transaction-nonce reconciliation.
5. EOA signatures only. No 1271/passkey/approved-hash mode, recovery, revocation or
   arbitrary asset/native payment relay. Guard allows owners to call external targets
   jointly, but the sponsored relayer deliberately only funds/pays the approved token.
6. Real deployed/verified contracts, genuine live funding/payment receipts and a
   separate H-approved mined GS020 failure remain mandatory integration gates.
7. Token issuer can mint/blocklist/upgrade; pinned checks detect configuration changes
   around relay, but cannot remove issuer trust or race between simulation and mining.

## Sponsor-specific feedback
See `2026-11-06-WHITECHAIN_FEEDBACK.md` for measured findings for H review. No sponsor
conversation, claimed adoption, fake benchmark or live user payment is asserted.

## Commands/actions for H
Run the exact commands in `script/treasury/RUNBOOK.md`.
H-X-001: approve/reject CR-X-001, API/session/persistence and fee policy (P0).
H-X-002: securely provision distinct signers/alerts, source-reviewed manifests and
testnet-only WBT/USDT; never share keys or signed payloads in chat (P0).
H-X-003: after C1 seats, approve exact network/address/constructor/call parameters,
run simulations, then human-run deployment/verification/readback (P0).
H-X-004: wire accepted server adapters, run live funding/payment, separate GS020
failed receipt and ENS-first cross-test; integrate only after independent acceptance.

## Next unblocked task
H review/decisions and C1 seam acceptance are required for live integration. The
contracts, restricted service core, local end-to-end evidence and human commands are
ready for review. No deployment, main merge or integration acceptance is self-authorized.
