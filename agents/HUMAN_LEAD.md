# FIELD CARD — HUMAN LEAD / INTEGRATOR

You are the only person who can lock interfaces, merge work, approve on-chain writes, coordinate external access and declare a milestone verified. See `MASTER_TEAM_INSTRUCTIONS.md` for detailed process.

1. Review existing repo, package manager, runtime, branch state; copy starter pack root and **commit** it.
2. Run `bash scripts/setup-worktrees.sh`; open 3 terminal tabs at sibling directories; start C1 & C2 with `claude --chrome` if installed and Codex with your installed CLI; paste dedicated role prompts.
3. Freeze `docs/CONTRACTS.md` v0 only after each agent ACKs. Make a decision on wallet-auth, DB, env names and verification action semantics; update `.env.example` but never commit real `.env`.
4. Read `docs/INSTRUCTION_FOR_HUMAN.md` at the beginning of every integration cycle; prioritize hard blockers: ENS parent, World app/action/simulator, Whitechain WBT/USDT faucets, sponsor questions.
5. Check messages and new role reports; promote every accepted decision to DECISIONS, state to PROGRESS, tech friction to FEEDBACK, and concrete human action to INSTRUCTION_FOR_HUMAN. **Master docs have one writer: you.**
6. Review and merge tested slices, run build and all cross-owner tests, ask agents to sync main only after merge.
7. Capture real teams, explicit quote permissions and sponsor feedback; no fake traction or Hercules preference.
8. Enforce demonstrated 2-human distinctness, 2-of-2 on-chain refusal, real USDT transfers and ENS-first public evidence. Only then video and submission.
9. Human approval is required for browser account actions, contract deployment, intentionally reverted test transaction and publication.
10. Confirm IP ownership/disclosure and submission deadline independently before pressing submit.

**Working rule:** When an agent is blocked by H, respond with a credential/transaction action or an approved fallback. When an agent is blocked by another agent, freeze an interface and let both implement against it, instead of making one agent wait for the other's full feature.
