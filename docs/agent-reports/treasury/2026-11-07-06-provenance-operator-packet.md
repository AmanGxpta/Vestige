# X milestone — creation provenance and operator packet

What changed: publication now requires exact local H review/digest and real chain
provenance. Existing code plus an arbitrary successful receipt is rejected. Direct
creation uses receipt.contractAddress; factory children require a successful mined
CREATE/CREATE2 trace. Reverted subtrees and unavailable traces fail closed. No live
candidate was supplied or published. No deployment/GS020 transaction was sent.

Tests: provenance-red.txt records the failing-first missing-rejection cases;
provenance-green.txt records 3 passing tests after the fix. publication.test.mjs
checks missing review and disabled incomplete operator config. Full-suite result
will be recorded in the integration handoff. Trace fixtures are MOCK_ONLY.

Files: provenance.mjs, publish-manifest.mjs, operator-review.mjs, owned operator
bounds JSON, read-only CLI scripts, INFRASTRUCTURE_APPROVAL.md, associated tests.
No shared docs/root configs/other-owner source changed. Shared-doc reconciliation
backup from the earlier v0 sync remains in Git metadata; it is never staged.

Evidence: funding-refresh.json pins public balances to block 12409159. These
supersede the older zero snapshot: deployer 0.8 WBT, attester 0.2 WBT, relayer 0.8
WBT, failedTx 0.05 WBT, funder 100 USDT; funder/payee WBT zero. X performed no
funding and read no key/password. infrastructure-review-plan.json records canonical
code hashes, nonce 0/0 and predicted addresses. infrastructure-simulation.txt is
an unsigned successful forge simulation ONLY: 2564488 estimated gas and
0.025644880002564488 WBT estimated fee, no live receipt or OP L1 measurement.

Decisions proposed: exact disabled operator bounds and infrastructure parameters
in INFRASTRUCTURE_APPROVAL.md; all remain unapproved. The 0.8 WBT observed relayer
balance exceeds the proposed 0.02 WBT isolated allowance. H must review actual
wallet exposure; funding does not grant authority. Factory trace availability and
true historical asset deployment hashes remain publication gates.

Sponsor-specific feedback: none received. No invented external acceptance.

Commands/actions for H: see script/treasury/INFRASTRUCTURE_APPROVAL.md for exact
read-only refresh, simulation, post-approval verification/readback and conditional
publication commands. Review source/build, actual nonce, constructors, ceilings,
wallet exposure, actual L1 measurements, signer and alert transport before any
separate signing approval. This packet does not authorize live operations.

Next unblocked task: root/C1/C2 seam integration tests and precise pending payload
CR handoff. Actual approved live receipts/manifests remain blocked on H.
