# Ownership / Worktree Matrix

**Source:** MASTER_TEAM_INSTRUCTIONS.md §1. **Lock before implementation.**

- C1 (`agent/identity`): `src/modules/identity/**`, `src/modules/agreements/**`, `app/api/identity/**`, `app/api/agreements/**`, `db/migrations/010_identity*`, `tests/identity/**`.
- C2 (`agent/product`): `app/(founder)/**`, `app/(funder)/**`, `app/v/**`, `app/page.tsx`, `components/**`, `src/modules/ui/**`, `src/modules/public-view/**`, `tests/e2e/**`, `public/**`, `app/globals.css`.
- X (`agent/treasury`): `contracts/**`, `script/**`, `test/**` (Foundry), `foundry.toml`, `src/modules/treasury/**`, `src/modules/relayer/**`, `app/api/treasury/**`, `db/migrations/020_treasury*`, `tests/treasury/**`.
- H (integration checkout): `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/FEEDBACK.md`, `docs/INSTRUCTION_FOR_HUMAN.md`, `docs/CONTRACTS.md`, `docs/OWNERSHIP.md`, root files, `.env.example`, `src/shared/**`, `db/migrations/000_base*`, integration build and submission.

All agents own **unique files** within `docs/agent-reports/<role>/`. Every other docs edit requires H ownership grant. Agents may read but not write outside designated paths. H may modify any path only for integration fixes explicitly recorded in DECISIONS and communicated to the owner.

**Prohibited without approved transfer:** editing another role's module; changing root package versions or TypeScript config; refactoring common DB schema; changing shared types; silent modifications to other agents' migrations; creating public secrets. `git status --short` before every commit.
