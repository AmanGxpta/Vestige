# DayZero multi-agent team starter pack

This is an **overlay** for an existing DayZero Git repo, not an implemented application. It contains operational docs, four role runbooks, the user's PRD copy, and a safe worktree bootstrap script. It has NOT deployed any contract or verified any live human proof.

## Setup

1. Extract the pack into your DayZero Git repository root. Preserve paths; if existing files have the same names, review differences before overwriting them.
2. Read `MASTER_TEAM_INSTRUCTIONS.md` and `docs/INSTRUCTION_FOR_HUMAN.md`.
3. Make architecture decisions in `docs/DECISIONS.md`; freeze `docs/CONTRACTS.md` after all agent ACKs.
4. Commit the pack as a baseline (see `docs/INSTRUCTION_FOR_HUMAN.md`).
5. Run `bash scripts/setup-worktrees.sh`. Run each agent in its **own** worktree using the `agents/*.md` role prompts.
6. Human merges and updates master docs. Agents only write uniquely named files in their own report outboxes.

Important: `docs/CONTRACTS.md` endpoints and roles are proposed templates and must be reconciled with your existing codebase. The README and starter docs intentionally mark all work as NOT_STARTED; don't interpret them as implemented.
