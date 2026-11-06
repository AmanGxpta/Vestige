#!/usr/bin/env bash
set -euo pipefail

if ! ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  echo 'ERROR: Run inside an existing Git repository.' >&2
  exit 1
fi
cd "$ROOT"
if [[ -n "$(git status --porcelain)" ]]; then
  echo 'ERROR: Commit/stash changes first; worktrees need a stable shared baseline.' >&2
  git status --short
  exit 1
fi
if ! git rev-parse HEAD >/dev/null 2>&1; then
  echo 'ERROR: Repo must contain an initial commit.' >&2
  exit 1
fi
if [[ ! -f MASTER_TEAM_INSTRUCTIONS.md || ! -f docs/CONTRACTS.md || ! -f docs/PRD.md ]]; then
  echo 'ERROR: Copy the full vestige team starter pack into the repo root first.' >&2
  exit 1
fi

create_worktree() {
  local path="$1" branch="$2"
  if [[ -d "$path" ]]; then
    if git worktree list --porcelain | grep -Fxq "worktree $(cd "$path" && pwd)"; then
      echo "EXISTS: $path (registered Git worktree)"
      return 0
    fi
    echo "ERROR: $path exists but is not a registered Git worktree; refusing overwrite." >&2
    return 1
  fi
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    git worktree add "$path" "$branch"
  else
    git worktree add -b "$branch" "$path" HEAD
  fi
  echo "READY: $path ($branch)"
}

create_worktree "../vestige-identity" "agent/identity"
create_worktree "../vestige-product" "agent/product"
create_worktree "../vestige-treasury" "agent/treasury"

git worktree list
cat <<'MESSAGE'

NEXT:
  cd ../vestige-identity && claude --chrome
  cd ../vestige-product && claude --chrome
  cd ../vestige-treasury && codex
Paste the matching agents/*.md prompt. Inspect `docs/INSTRUCTION_FOR_HUMAN.md`.
Only Human merges into the original integration checkout.
MESSAGE
