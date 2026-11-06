# Human Action Queue — commands, account steps and verifications

> H owns state. Agents REQUEST actions through role reports. Use testnet-only keys. Never paste seed phrases, private keys, API tokens or signed authorizations into agent chat or screenshots. Exact commands below are examples **only where prerequisites exist**; confirm installed script names before running any deploy step.

| ID | Priority | Status | Requester | Human action | Expected proof |
|---|---|---|---|---|---|
| H-001 | BLOCKER | OPEN | all | Put starter pack in Git repository root, commit baseline, run worktree setup | `git worktree list`, base commit |
| H-002 | BLOCKER | OPEN | C1 | Confirm owned `dayzero.eth` Sepolia name / parent controls, ENSv2 registry and resolver at official booth | Address + non-secret links, notes |
| H-003 | BLOCKER | OPEN | C1 | Setup World developer app, action / RP signing and simulator in matching env; don't share keys in chat | App/action public ID; redacted test outcome |
| H-004 | BLOCKER | OPEN | X | Provide Whitechain faucet WBT to relayer/test deployer and test USDT to funder; four demo wallets A/B/funder/payee | Public addresses + balances, explorer links |
| H-005 | HIGH | OPEN | X | Confirm whitechain RPC + explorer and actual Safe contracts and test token bytecode | RPC `eth_getCode` outputs, no private secrets |
| H-006 | HIGH | OPEN | H | Verify sponsor track selections, eligibility, live submission cutoff | Official URLs/notes |
| H-007 | HIGH | OPEN | H | Clarify project IP ownership and disclose Hercules connection in writing | Confirmation, public disclosure text |
| H-008 | HIGH | OPEN | H | Recruit 2 distinct consenting founders for live proof; find an independent program manager | Consent and anonymized meeting notes |
| H-009 | HIGH | OPEN | X | Approve execution of deliberately failing one-signature transaction from **test-only funded account** | Mined failed tx hash, proper error |
| H-010 | HIGH | OPEN | H | Integrate/rehearse video, collect verified feedback and submit | Demo URL, repo ref and submission confirmation |

## H-001 — Initialize worktrees

Run from **your existing Git project root** (the repo must already have at least one commit, the starter pack files added, no uncommitted changes):

```bash
git status --short
git add MASTER_TEAM_INSTRUCTIONS.md AGENTS.md CLAUDE.md README-START-HERE.md agents docs scripts
git commit -m "chore: add DayZero multi-agent execution system"
bash scripts/setup-worktrees.sh
git worktree list
```

Start each dedicated agent in its worktree:

```bash
(cd ../dayzero-identity && claude --chrome)
(cd ../dayzero-product && claude --chrome)
# Codex's exact CLI invocation depends on your installation:
(cd ../dayzero-treasury && codex)
```

Paste `agents/CLAUDE_IDENTITY.md`, `agents/CLAUDE_PRODUCT.md`, or `agents/CODEX_TREASURY.md` respectively as their first instruction. If `claude --chrome` is unavailable, use `claude` and ask H to arrange research/browser access. Before enabling browser use, verify `/chrome` is connected; use a dedicated profile with only needed tabs.

## H-002/H-005 — Safe read-only checks

Example read-only Whitechain bytecode probe (requires `cast` installed):

```bash
cast chain-id --rpc-url https://rpc.testnet.whitechain.io
cast code 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762 --rpc-url https://rpc.testnet.whitechain.io
cast code 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67 --rpc-url https://rpc.testnet.whitechain.io
cast code 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 --rpc-url https://rpc.testnet.whitechain.io
```

Non-`0x` bytecode confirms a contract is present, **not** that its code/ABI/functions are correct. Share only contract addresses, relevant ABI/function results and explorer URLs. Have X give you exact deterministic deploy commands once `script/` implementation exists; do not execute fictitious `forge script` paths from a generic README.

## H-003 — World setup

In the World developer portal, create/confirm the relevant World ID app, its staging/production action and the supported proof-of-human credential. Configure IDKit/World simulator exactly as C1 documents. Keep API and RP signing keys in local secret env; only reveal public app/action IDs to agents. Confirm with C1 whether the platform supports truly per-venture scoped actions. Never enter a raw RP signing key into browser-visible pages other than the official portal's designated secure process.

## H-004 — Role separation and demo wallets

Four parties: Founder A, Founder B, Funder, Payee. Separately provision a Sepolia ENS registrar key, Whitechain SeatRegistry attester key, Whitechain gas relayer key, testnet deployer key. Keys can be managed securely as the environment allows; never share a secret file via chat. Distinct founder wallets must be backed by genuinely different World proofs for the real anti-duplicate acceptance test. Use faucet/testnet assets only. Keep a **separate deliberately funded test wallet** for the on-chain failed one-signer demo.

## H-009 — One signer failure

Only after X provides a test-reviewed calldata construction and precise chain 1874 transaction recipe: H explicitly approves a **deliberately reverting testnet Safe execution** from a separate funded wallet. Capture tx receipt with status `0` and decoded `GS020` (or documented Safe version's exact insufficient-signature revert). The normal relayer must refuse such submission in simulation. Never send this via production wallet or funds.

## Merges and verification

For each handoff:

```bash
git status --short
git log --oneline -5 agent/identity  # replace with the actual handing-off role
git diff main...agent/identity --stat
# After reviewing and validating tests, when you are on the integration base branch:
git merge --no-ff agent/identity -m "merge: identity proven slice"
# Then run the project's actual typecheck/build/unit/e2e commands.
```

Other branches use `agent/product` and `agent/treasury`. If your integration branch is not named `main`, substitute the base branch. After merge, update DECISIONS/PROGRESS/FEEDBACK/INSTRUCTION_FOR_HUMAN, commit, then tell the agent to `git merge <integration-branch>` in its own worktree. Avoid `git reset --hard`, automatic conflict resolution and forced branch rewrites.

## Approved-action record template

`H-### | requestor | purpose | exact command/URL | network | risk | H approval | ran at (UTC) | result | link | follow-up`.
