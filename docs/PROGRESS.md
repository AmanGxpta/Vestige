# Progress — live gate ledger

> H updates after every merged slice. **Not yet implemented or tested by this starter pack.** A status is VERIFIED only when H sees the evidence. Do not invent completion percentages.

**Integrated revision:** TBD  
**Interface version:** `v0 PROPOSED`  
**Current bottleneck:** Unknown pending M0 handshake  
**Current quality gate:** not run  
**Submission:** exact event deadline requires H portal confirmation; PRD states Nov 7, 09:00 IST with 08:00 target.

| Milestone | Owner | Status | Evidence required | Remaining blocker |
|---|---|---|---|---|
| M0 Architecture, tools, configs and 3 ACKs | H / all | NOT_STARTED | contracts locked, branches/worktrees | Repo scaffold, account access |
| M1-A ENSv2 proof + Sepolia reads | C1 | NOT_STARTED | real subname + resolution tx | ENS deployments/parent |
| M1-B World unique-person spike | C1 | NOT_STARTED | one real/staging proof, 2 seats negative path | Portal/simulator/action semantics |
| M1-C Foundry security + Safe/USDT spike | X | NOT_STARTED | green tests + real Safe/token call | RPC/faucet/SDK |
| M1-D Interactive UX shell + errors | C2 | NOT_STARTED | browser video/screenshots (mocks labeled) | Typed contracts |
| M2-A Identities, terms and on-chain seats | C1 + X | NOT_STARTED | agreements hash in ENS; attestation receipts | C1/X seam |
| M2-B Gasless fund + guarded 2-of-2 pay | X | NOT_STARTED | test USDT chain receipts | Token and relayer |
| M3 Never-cut: live fresh venture | H + C1 + C2 | NOT_STARTED | new name and events | Integrated M2 |
| M3 Never-cut: duplicate-human refusal | H + C1 | NOT_STARTED | actual rejection + seat unchanged | World scope confirmed |
| M3 Never-cut: on-chain 1-of-2 revert | H + X | NOT_STARTED | mined failed transaction and GS020 | Separate funded test wallet |
| M3 Never-cut: ENS-first public evidence | H + C2 | NOT_STARTED | independent reads of ENS and Whitechain | Addresses and read clients |
| M4 Real venue teams onboarded | H | NOT_STARTED | consented records and completed verification | Working M3 |
| M4 Independent program quote | H | NOT_STARTED | consented actual quote | Sponsor outreach |
| M5 README, feedback, demo, submit | H / all | NOT_STARTED | live URLs, video, source and receipt | All gates |

### Immediate next actions

- H: commit scaffold; decide package manager and codebase structure; install worktrees; confirm live event rules; unblock browser, RPC, ENS and World.
- C1: investigate World action scoping and ENSv2 deployment with minimal reproducible tests.
- C2: build product shell from stable mock adapter, public evidence state machine, and browser test plan.
- X: Foundry Guard threat model/tests; Safe 1874 and test USDT signature spike.

### Status legend

`NOT_STARTED → IN_PROGRESS → READY_FOR_REVIEW → VERIFIED`; alternate `BLOCKED`, `CUT`. `VERIFIED` requires reproducible acceptance evidence + H approval.
