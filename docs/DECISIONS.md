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

| ID | Status | Decision / issue | Alternatives & reason | Owner / approver | Evidence / rollback trigger |
|---|---|---|---|---|---|
| D-009 | APPROVED | Use SQLite (`node:sqlite`) with WAL, migrations, foreign keys and unique constraints for the single-host v0 deployment | No native dependency and matches C1's implemented port; a multi-instance deployment requires a reviewed transactional adapter | H | C1 identity implementation; integration gate is single-host only |
| D-010 | APPROVED | Use EIP-4361-style single-use EOA challenge plus 12-hour bearer session, hashed at rest, via `Authorization: Bearer` | Simple browser integration, no CSRF exposure from automatic cookies; no smart-account/passkey support in v0 | H | C1 `auth.ts`; 5-minute challenge TTL and atomic consume |
| D-011 | APPROVED | Use injected EIP-1193 EOA wallets through `viem` only; accept one visible Sepolia↔Whitechain network switch | Avoid adding wagmi/embedded-wallet scope before the live demo; UI must not claim zero switching or switch silently | H + C2 | C2 caveat; real-wallet smoke test remains required |
| D-012 | APPROVED_WITH_GATE | Relayer is free to users, funded by an isolated operator wallet, with per-wallet/venture limits, daily WBT reservations, actual-sender simulation, nonce reconciliation, and monitoring/circuit breakers | OP L1 fees are not mathematically capped by EVM gasLimit; live thresholds and alert transport must be configured before broadcast | H + X | X relayer handoff and Whitechain feedback |
| D-013 | APPROVED | Use `DeploymentManifestV1` in `docs/CONTRACTS.md` with addresses, tx hashes, blocks, runtime code hashes, ABI paths/hashes, owners, threshold, ventureId, and token EIP-712 domain | Missing/stale/mismatched manifest fails closed; infrastructure-only artifacts may omit venture owners | H + X + C2 | C2/X handoffs; live receipt and verification still required |
| D-014 | APPROVED | Use C1's NFC-normalized, recursively sorted compact JSON and `keccak256(UTF-8(canonicalJson))` for agreement hashes | Reject unsafe/non-integer numbers and duplicate normalized keys; preserve array order | H + C1 + C2 | C1 canonicalizer and C2 preview implementation |
| D-015 | APPROVED | Supersede D-003: lock `docs/CONTRACTS.md` v0 and approve CR-X-001, CR-ID-01…04, D-004, and CR-C2-001…005 as recorded in its change register | Give C1, C2, and X stable seams while preserving explicit live-evidence gates | H | `docs/CONTRACTS.md` v0; rollback only through a new CR |
| D-016 | APPROVED_WITH_GATE | Supersede D-004: one World protocol version per deployment, dynamic per-venture actions, backend uniqueness, and `TESTED_IN_SIMULATOR` labels | v0 defaults to 4.0; switch the whole deployment to 3.0 if live World support requires it; never mix | H + C1 | C1 spike report; production proof still required |
| D-017 | APPROVED | Supersede D-005: VestigeGuard keeps exactly two verified-seat owners and blocks modules, delegatecalls/MultiSend, handler/Guard changes, threshold changes, and recovery | A lost founder key can lock funds; no recovery path in v0 | H + X | X Foundry suite and local fork; live deployment/read-back still required |
| D-018 | APPROVED_WITH_GATE | Supersede D-006: use EIP-3009 `transferWithAuthorization`; exclude external `receiveWithAuthorization` and require manifest/code/domain checks | Relay only approved token/Safe calls; live receipt remains a gate | H + X | X capability/fork reports |
| D-019 | APPROVED | Review correction to D-015: H's v0 decisions are approved for implementation; team freeze/compatibility still requires C1, C2, X ACKs to this revision | Prior proposals are not ACKs; no owner acceptance is fabricated | H integration review | CONTRACTS owner ACK ledger; MASTER §3 |
| D-020 | APPROVED | Clarify D-009: SQLite owns app state; accept existing FileJournal on persistent private disk for the one dedicated relayer on one host | Avoid unimplemented journal rewrite; crash/nonce reconciliation remains mandatory, SQLite replacement needs tests | H integration review | X `3dc0004` relayer handoff |
| D-021 | APPROVED | Supersede protocol-switch language in D-016: pin World protocol/RP/environment for existing ventures; fallback only before enrollment with fresh namespace and H approval | Protocol-specific nullifiers can defeat uniqueness if switched on a populated registry | H integration review | C1 spike inference; not a live exploit claim |
| D-022 | APPROVED | Correct manifest D-013: separate infrastructure/treasury schemas, include SafeSetup, token implementation/domain separator, initializer hash and approval provenance | Existing nested draft omitted setup and proxy fingerprints needed by X; schema-to-service adapter required | H integration review | CONTRACTS manifest section |
| D-023 | APPROVED | Clarify D-011/D-014: switching may occur multiple times; pin viem 2.57.16 for root integration; hash C1's exact validated founding-terms document | C2 preview currently hashes a different envelope even with sorted keys; vector tests required | H integration review | C1 `terms.ts`, C2 `canonical.ts`; report below |

Decision rows D-009 onward were drafted during this integration review; D-019…023 explicitly correct the earlier draft interpretations. Approval is scoped to local implementation and does not authorize live signing or deployment.

### New decision template

`D-### | DATE UTC | PROPOSED/APPROVED/REJECTED/SUPERSEDED | Actor | Problem | Options | Choice | Why | Affected owners / contracts | Evidence links | Reversal trigger | H approval`.
