# X approved v0 follow-through — service and safety milestone

## What changed
Implements the ACKed revision 30d1ef68059c18b5d6adfee2a6b0db86b2ae413e; no CR.
Six thin Next route wrappers delegate to tested Request/Response handlers. Mutations
resolve C1-compatible SHA-256 bearer sessions from SQLite, enforce trusted origin/
HTTPS outside localhost, bounded JSON, exact fields, canonical decimal uints,
membership/current verified-seat ownership, payer/session binding and stored proposal
signatures. No client wallet/treasury/nonce is accepted as authority. Responses are
no-store; no browser token persistence, credentialed wildcard CORS or private logs.

SQLite 020 tables persist proposals, signatures, operation lineage, scoped idempotency,
deployment preparations and attestation receipt provenance. Different idempotency
bodies conflict; identical retries return the same operation. Execution retries cannot
detach a payment from an in-flight operation. Stale Safe nonces clear approvals;
terminal executed history is preserved. Journal IDs are stored before attempting
submission, allowing UNKNOWN operations and a journal/SQLite crash gap to reconcile
without resending or double-charging observed fees. Read requests poll receipt state
without submitting transactions. Private payment reasons are current-founder-only.

Deployment requests only prepare an operation after two independent confirmed seats.
They never call a deployer. Source is WORLD_PRODUCTION, TESTED_IN_SIMULATOR or UNKNOWN;
no staging source is transformed into real-human evidence. Runtime supports approved
infrastructure/treasury manifest variants, validates ABI hashes, checks receipt blocks,
canonical hashes, original factory initializer and current runtime fingerprints.
Seat confirmations lose their durable current-confirmed status after a reorg.

Default relay and attestation authorization remain disabled. There is no key or
keystore decryption loader. Even RELAYER_ENABLED=true cannot supply a missing signer,
explicit authorization, measured fee review or healthy alerts. The seven keystores
were not accessed. No live balance/funding status was inferred.

Relay controls: explicit positive fee/gas/rate/balance configuration, exact reviewed
limits digest/expiry, fresh OP oracle L1 quote, conservative reserve, actual sender
simulation and nonce, fsync reservations before a broadcast-attempt marker, and a
second kill-switch/freshness check before the send. Verified failed simulations also
consume the per-wallet/per-venture attempt quota. Actual receipt EVM/L1 fees are
recorded; budget/replay reservations are never blindly refunded. Local-only policies
are rejected on non-Anvil/non-loopback RPCs and cannot satisfy the LIVE fee gate.

HTTPS alert hooks sanitize numeric metrics and probe transport health. Drift,
insufficient balance, stale/unknown receipts, unavailable/over-limit L1 quotes,
observed fee overruns and alert failure persist circuit state. Monitoring includes
budgets, fees, replay, simulations, nonce locks, failed receipts and latency.
Operator-only nonce reconciliation checks sender, nonce and calldata against chain
evidence; it does not resend. An explicitly reviewed unattempted reservation can be
abandoned only with an unchanged nonce, retaining replay protection. Crash-lock
recovery requires a dead PID, exact reviewed journal digest and preserves nonce rows.
Legacy PID/nonce-less records require a manual audit rather than automatic recovery.

## Commits/files
ACK/ABI/port baseline: `11d60d5`; approved main sync: `be2aabf`.
This milestone owns `app/api/treasury/**`, treasury/relayer modules, additive 020
migration, manifest schema tightening, tests and raw evidence. No H/C1/C2-owned source
or authoritative document was edited. Shared-doc reconciliation is detailed in report 01.

## Tests + actual output
- `forge test -vvv`: **33 passed, 0 failed, 1 skipped**; the skip is the opt-in fork suite.
  `2026-11-07-foundry.txt`.
- `WHITECHAIN_FORK_RPC=https://rpc.testnet.whitechain.io forge test --match-contract WhitechainForkTest -vvv`:
  **5 passed, 0 failed** at pinned block 12353825. `2026-11-07-foundry-fork.txt`.
- `npm test --prefix src/modules/treasury`: **60 passed, 0 failed**;
  `2026-11-07-service-tests.txt`. Includes actual Node SQLite, EOA crypto, route wrapper,
  durable journal/restart tests and chain-port doubles for policy fault injection.
- `node tests/treasury/local-fork.integration.mjs`: **PASS**, local Anvil only.
  Real Safe/token bytecode, Protocol Kit 8.0.11 atomic guarded deployment, actual local
  SeatAttestationPort receipts/readback, authenticated HTTP funding and payment,
  owner approvals, replay/single-signer refusal, SQLite + FileJournal and two-confirmation
  receipt propagation. Recipient received **500000 raw units locally**.
  `2026-11-07-local-fork.txt` explicitly reports TESTED_IN_SIMULATOR and zero live broadcasts.
- `node script/treasury/export-abis.mjs` followed by
  `git diff --exit-code -- contracts/abi`: PASS, byte-identical ABI regeneration.
- Syntax and owned-path whitespace checks: PASS. Root Next build/typecheck: NOT RUN;
  this integration checkout has no H-owned root package/Next scaffold or merged C1 source.

Failing-first evidence in `2026-11-07-followthrough-tdd.txt` covers missing manifests,
unconfigured attestation, session authorization, disabled relay, invalid fee-review
expiry, malformed send response, failed-simulation rate accounting, kill switch during
simulation, journal/SQLite receipt replay, reorg invalidation and terminal payment history.
One test initially depended on root CWD; ABI tests now resolve paths from import.meta.url
and pass through the documented npm-prefix command as well as the root runner.

## Evidence URLs/tx hashes
Fork source reads: https://rpc.testnet.whitechain.io, chain 1874, pinned block 12353825.
**No live Vestige deployment, attestation, funding, payment or GS020 transaction exists.**
No live explorer link is fabricated for a local receipt. Local test identities and issuer
impersonation are confined to silent Anvil; no Vestige signer or real World proof was used.

## Decisions proposed/implemented
Approved v0 implemented without new routes/signatures/schema changes beyond owned
internal persistence. Existing FileJournal remains the single-host nonce owner.
OP L1 reserve remains an operational policy/circuit breaker, not a mathematical total
fee cap. LIVE review needs genuine receipt-backed observations, recorded pre-send L1
quotes, H-chosen margin and matching configured limits. None is approved or supplied.

## Remaining issues
H must integrate C1's approved auth/nullifier-hashing/proof-environment follow-through,
root scaffold and C2 artifact consumption. C1 registers SeatAttester through its approved
registerSeatAttester seam; no generic HTTP attestation bridge was introduced.
No live deployment manifest exists, including canonical artifact creation provenance.
No live signer/alert transport is wired, no account is confirmed funded, and no live fee
policy is reviewed. Registry attester trust, token issuer powers, no recovery and EOA-only
scope remain as approved. Terminal relay replay entries are retained; reconciliation
never promises automatic re-execution of a reverted/dropped signed intent.

## Sponsor-specific feedback
No new sponsor interaction. Local OP oracle/receipt observations are local-only;
Anvil's absent L1 receipt field is treated as local zero and cannot become a LIVE sample.

## Commands/actions for H
Review this milestone and the final simulation-only runbook. Keep RELAYER_ENABLED=false.
Do not access passwords/keys for these tests, fund accounts or broadcast from this report.

## Next unblocked task
Commit the unsigned infrastructure plan, readback/fee inspection tools and exact H
simulation commands as the final operational handoff, then await H integration review.
