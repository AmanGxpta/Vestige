# X milestone — pending CR-X-002 readback implementation

What changed: isolated readback projection with canonical safeTypedData, private
current-founder payment reload/approval state, current nonce invalidation, balances,
confirmed incremental deposits and operator-only ingestion of existing mined GS020
receipt/trace evidence. No route/runtime response was switched to the draft.
CR-X-002 at f083222 remains PROPOSED; exact spec SHA-256:
4360cfa0f61691a28bc14f3852a8a1a826a5ed9897456081774475bf65f64b77.

Files: readback-payload.mjs/readback-port.mjs; additive 020_treasury_readback.sql;
TreasuryStore migration list; readback-port.test.mjs and reorg red/green outputs.
No shared/identity schema edited. Missing balances are null, not zero; scans use
<=10000-block windows and expose PENDING until complete. API JSON uses decimal
strings. Private payment reason/typed data/signers are not public. Signature bytes
are never emitted.

Tests: readback-reorg-red.txt records the failed missing-rejection test before the
final canonical-block check; green output records 5 passing read-port tests after
that check. Unit trace/receipt fixtures are MOCK_ONLY. Integration/local-fork output
in the next handoff proves actual forked-token deposits/balance and executed-payment
projection. No unit/simulator result is a mined live GS020 failure.

Decisions: keep the default v0 response until H accepts the precise CR. No raw
HTTP ingestion endpoint for rejected evidence. Unavailable mined trace means no
evidence, not a guessed revert reason. No real manifest or live receipt invented.

Remaining issues: H contract acceptance; C2 owner payload/type/UI adoption; actual
live receipt/trace and reviewed manifest; root integration acceptance. No sponsor
feedback received. Next independent task: actual current C1/C2 source harness,
read-only root composition and summary-port handoff.

H command: npm test --prefix src/modules/treasury. H approval/action details follow
in 2026-11-07-08-current-owner-integration.md; no signing authority in this milestone.
