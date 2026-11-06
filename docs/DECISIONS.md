# Decisions — Human-maintained, append-only

> H integrates decisions from agent reports at every handoff. `PROPOSED` is not an authorization. Record exact evidence and trade-offs. Do not store keys.

| ID | Status | Decision / issue | Alternatives & reason | Owner / approver | Evidence / rollback trigger |
|---|---|---|---|---|---|
| D-001 | PROPOSED | Worktree owners: C1 identity, C2 product, X treasury, H integration + docs | Minimize overlapping files and late merges | H | MASTER §1; finalize after mapping repo |
| D-002 | PROPOSED | Two chains: ENS Sepolia 11155111, treasury Whitechain 1874 | PRD requirement; fallback only if live integration broken | H + C1 + X | PRD §§1, 7, 10 |
| D-003 | PROPOSED | Freeze interfaces from `docs/CONTRACTS.md` v0 | Prevent divergent types and endpoints | H + all ACK | Test type imports and integration |
| D-004 | OPEN_SPIKE | World per-venture distinct-human nullifier scope and current SDK | Dynamic action may require registered action/signature | C1; H approval | Real server-verified tests across ventures |
| D-005 | OPEN_SPIKE | Prevent Safe Guard bypass via modules, threshold downgrade or guard changes | Standard Guard alone insufficient | X; H approval | Foundry negative test suite |
| D-006 | OPEN_SPIKE | Gasless EIP-3009 `transferWithAuthorization` on test USDT | Direct external relayer can't generally use receiveWithAuthorization to Safe | X; H approval | 1874 token call / receipt |
| D-007 | PROPOSED | Docs four master files single-writer H + agent report outboxes | Avoid concurrent docs merge conflict | H | Each handoff updates masters |
| D-008 | OPEN_HUMAN | Confirm hackathon IP ownership and Hercules neutrality in writing | Avoid sponsor/fund conflicts | H | Written agreement / disclosure |

### New decision template

`D-### | DATE UTC | PROPOSED/APPROVED/REJECTED/SUPERSEDED | Actor | Problem | Options | Choice | Why | Affected owners / contracts | Evidence links | Reversal trigger | H approval`.
