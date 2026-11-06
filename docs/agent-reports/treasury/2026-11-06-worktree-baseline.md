# Worktree repair and integration baseline

## What changed

Repaired the renamed identity and treasury worktrees from the integration checkout with `git worktree repair`. Confirmed both worktrees resolve to their expected branches and that `git status` runs successfully.

Reviewed the integration checkout's pending shared-doc changes. They are a coherent starter-pack baseline rename from DayZero to vestige, including canonical ENS/action names, sibling worktree paths, and associated Markdown table formatting. The baseline was committed on the integration branch. The product worktree's separate scaffold files and its AGENTS.md modification were not included.

## Commits/files

Integration commit: recorded after this report was added.

Baseline files: `MASTER_TEAM_INSTRUCTIONS.md`, `README-START-HERE.md`, `agents/CLAUDE_IDENTITY.md`, `agents/CLAUDE_PRODUCT.md`, `agents/CODEX_TREASURY.md`, `docs/CONTRACTS.md`, `docs/FEEDBACK.md`, `docs/INSTRUCTION_FOR_HUMAN.md`, `docs/PRD.md`, and `scripts/setup-worktrees.sh`.

## Tests + actual output

- `git worktree repair ../vestige-identity ../vestige-treasury` completed without error.
- `git -C ../vestige-identity status --short --branch` returned `## agent/identity` and the expected inherited shared-doc modifications.
- `git -C ../vestige-treasury status --short --branch` returned `## agent/treasury` and the expected inherited shared-doc modifications.
- `git diff --check` reported only one pre-existing Markdown trailing-space warning in `MASTER_TEAM_INSTRUCTIONS.md`; no patch-conflict or malformed-diff errors.

## Evidence URLs/tx hashes

None; this was local Git metadata and baseline documentation work.

## Decisions proposed/implemented

Implemented the integration baseline decision: commit the starter-pack rename and documentation normalization on `main`; do not absorb product-owned scaffold files or unrelated worktree changes.

## Remaining issues

The sibling branches still carry the uncommitted baseline files because they have not been merged or rebased onto the integration commit. Their Git metadata is repaired and status is functional.

## Sponsor-specific feedback

None.

## Commands/actions for H

Use the integration commit SHA from the handoff. When ready, have each agent sync the committed baseline into its branch according to the team worktree rules.

## Next unblocked task

Continue integration review of the identity, product, and treasury handoffs after the baseline commit.
