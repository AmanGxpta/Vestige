# Sponsor & Technology Feedback — evidence-backed

> H maintains; agents send findings through `docs/agent-reports/<role>/`. **Nothing below asserts a sponsor has reviewed vestige.** Separate firsthand usage from speculation.

## ENSv2 (C1)

- Target: ENSv2 as core identity, fresh name, namespace roles, ENSIP-11 treasury address.
- To collect: docs URL/version; Sepolia deployment exact address; registry/resolver creation; DNS-name setter gotcha; EAC / non-transferability experience; `addr` on 2147485522 resolve behavior; explorer links; booth guidance.
- Current status: UNTESTED by this pack. Risk: Permissioned Registry/Resolver tooling and addresses may differ from older APIs.
- Sponsor improvement request: TBD after actual implementation.

## World / IDKit (C1)

- Target: Proof of Human, actual same-human second seat denial, backend proof validation, per-venture uniqueness.
- To collect: time-to-first-success (measured, not guessed); exact SDK version; action configuration, simulator/staging behavior; `same person/same venture` negative and `same person/different venture` positive; retries/cancel; documentation gap; biggest improvement.
- Current status: UNTESTED. High risk: dynamic venture-scoped action assumption.
- Required deliverable: `docs/WORLD_FEEDBACK.md` after actual tests, with verified measurements.

## Whitechain Scale (X)

- Target: verified Guard/SeatRegistry, actual Safe test USDT movements, no founder/funder WBT, relayer drain resistance, multiple party demo.
- To collect: Safe `contractNetworks` config/version; RPC reliability; USDT function/domain availability; faucet and explorer; simulation false negatives; gas used; contracts verified; operator-specific docs gap; core improvement proposal.
- Current status: UNTESTED. High risk: EIP-3009 method choice / Guard bypass / relayer preflight.
- Required deliverable: `docs/WHITECHAIN_FEEDBACK.md` after actual tests.

## Issues (append per real incident)

| ID    | Track      | Severity | Environment / version | Actual symptom / reproduction                                       | Workaround tried | Outcome  | Evidence | Owner |
| ----- | ---------- | -------- | --------------------- | ------------------------------------------------------------------- | ---------------- | -------- | -------- | ----- |
| F-001 | ENS        | OPEN     | TBD                   | ENSv2 contracts & ENSIP-11 need booth/live verification             | Not yet          | UNTESTED | PRD §6   | C1    |
| F-002 | World      | HIGH     | TBD                   | Venture-scoped action/nullifier assumption unresolved               | Not yet          | UNTESTED | PRD §6   | C1    |
| F-003 | Whitechain | HIGH     | TBD                   | Safe guard/module bypass and token EIP-3009 method must be verified | Not yet          | UNTESTED | PRD §6   | X     |

**Rules:** No invented sponsor approval, invented timelines, fake quotes or synthetic success presented as live. Quote source/date/consent if quoting external people. Link every resolved issue to code diff and actual evidence.
