# Whitechain engineering feedback — draft for H review

Scope: local Foundry tests, live read-only RPC/explorer calls and local Anvil fork.
No live deployment, real founder onboarding or public USDT transfer was performed.

- RPC chain ID returned 1874. PRD singleton/factory code hashes match canonical Safe
  v1.4.1 from official safe-deployments 1.37.67. Current package already lists 1874;
  explicit Protocol Kit 8.0.11 overrides also work. A setup-helper guarded deployment,
  token funding and payment passed on the local fork. Real mining remains unverified.
- Explorer API provided verified TetherTokenV2 implementation and ABI behind the
  EIP1967 test token. Actual fork calls confirmed six decimals and domain
  Tether USD / 1 / 1874 / token proxy. A valid authorization funded a Safe; replay,
  recipient tampering and expiry reverted. External receiveWithAuthorization to a
  Safe reverted `TetherToken: to != msg.sender`; use transferWithAuthorization.
- Official older wallet documentation describes a different testnet (2625); the
  newer developer guide and live RPC establish the requested 1874 OP testnet. A
  single current chain/contract/token/domain matrix would reduce ambiguity.
- OP L1 data fees make an absolute total WBT cap more complicated than an EVM gas
  limit. A maintained fee oracle example, relayer fee policy and receipt fields
  would help implement defensible budgets. Current local code uses a conservative
  explicit L1 reserve and reports this as a live-deployment blocker pending H policy.
- Safe transaction Guards do not protect module execution. The baseline module
  exploit is reproduced locally. Clean atomic setup and forbidding modules,
  delegatecalls, handler and governance escapes are essential for our trust claim.

Reproduce with the commands in `script/treasury/RUNBOOK.md`. Source URLs and exact
outputs are in the treasury capability/fork/handoff reports. No sponsor quote,
feedback conversation or product-adoption claim has occurred.
