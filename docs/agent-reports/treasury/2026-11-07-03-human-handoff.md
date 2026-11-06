# X handoff to H — approved v0, relay disabled

## What changed
ACK is recorded in report 01 against exact revision
`30d1ef68059c18b5d6adfee2a6b0db86b2ae413e`, including DECISIONS D-019…023.
No CR is submitted. Shared-doc reconciliation preserved all original bytes/patch in
Git metadata and found all ten dirty files already committed identically in H's
50efcf2 baseline. No unique edit was discarded or committed by X; main was synced
through merge be2aabf. All current H-owned files match approved 30d1ef6.

Approved owned follow-through is implemented: exact SeatAttestationPort; receipt/
event/sender/canonical-block/readback checks; authenticated treasury routes; published
ABI hashes and manifest schemas/types/adapter; additive SQLite adapter; durable
idempotency/approvals/operation lineage; explicit limits and disabled-by-default relay;
fresh OP quotes, fee accounting, real alert/circuit hooks; nonce and crash-lock recovery.
Details and evidence are in report 02. C1's registerSeatAttester seam is preserved;
no arbitrary HTTP attestation bridge or shared interface change was introduced.

This final milestone adds a read-only unsigned plan generator, manifest readback,
public receipt fee inspection, artifact notes and a rewritten simulation-only runbook.
It removes the old runbook's live-send/GS020 examples from current instructions.
Treasury planning reads only C1 wallets/status/environment, never raw World nullifiers.
Staging plans explicitly disallow a real-human claim and all plans disallow broadcast.

## Commits/files
- `11d60d5`: v0 ACK, ABI/schema/port baseline.
- `cd600ab644f07117d51bfc0103f5548fbec8de1c`: authenticated service, relay safety/recovery.
- This commit: `script/treasury/RUNBOOK.md`, planning/readback/fee-inspection tools,
  artifact notes, unsigned plan and final test evidence.
Branch/worktree remains `agent/treasury` / `vestige-treasury`. X has not merged into main.

## Tests + actual output
- Foundry: **33 passed, 0 failed, 1 explicitly skipped fork suite**.
- Opt-in Whitechain pinned fork: **5 passed, 0 failed**.
- Final service suite including operator plan tests: **62 passed, 0 failed**.
- Local Anvil end-to-end: **PASS** — real Safe/token bytecode, receipt-confirmed port,
  authenticated routes, two stored approvals, SQLite/FileJournal, funding/payment,
  replay/single-signature rejection and two-confirmation/block-hash propagation.
- ABI regeneration: byte-identical. Operator-tool syntax/owned whitespace checks pass.
- Root Next build/typecheck: NOT RUN; H-owned root scaffold and C1 source are not merged
  into this checkout. Thin Next wrapper execution is included in the service suite.

Evidence files: `2026-11-07-foundry.txt`, `2026-11-07-foundry-fork.txt`,
`2026-11-07-final-service-tests.txt`, `2026-11-07-local-fork.txt` and failing-first transcript.
The local fork uses staging-labeled fixture records, public deterministic local test
identities and local issuer impersonation. It is not an actual World proof transcript.

## Evidence URLs/tx hashes
Read/fork source is https://rpc.testnet.whitechain.io, chain 1874, block 12353825.
**Zero live Vestige transactions were authorized or broadcast.** No live receipts,
deployment, funding, faucet action or deliberate GS020 attempt is claimed. No explorer
links are invented for local transactions. All seven keystores/Keychain credentials
remained untouched; no password/private key was read, logged, requested or loaded.
No account is confirmed funded. No Waypoint account is used.

## Decisions proposed/implemented
No new CR. Approved v0 local implementation only. The live factory's authorization
callback defaults false and no signing transport is installed. RELAYER_ENABLED=true
alone cannot enable signing. Local fee policies cannot satisfy a LIVE review.
The OP reserve is an operational circuit, not a mathematical cap on total fees.

## Remaining blockers
1. H integration acceptance, C1/C2 compatibility follow-through and root scaffold.
   C1 must hash nullifiers per v0, register the port and keep RP/protocol/environment
   pinned. Staging evidence must never become a two-real-human claim.
2. Genuine deployment/source/creation provenance and a reviewed complete manifest.
   Canonical deployment transaction hashes are not replaced with dummy values.
3. Confirmed bounded testnet funding, separately approved signer transport and a
   working alert destination. No such live wiring or funding was attempted.
4. Explicit fee/rate/balance values plus a measured, receipt-backed OP L1 review with
   recorded quotes, margin, expiry and matching limits digest. No live values approved.
5. Separate H approval of exact live network/constructor/call parameters. Genuine
   deployment/readback, funding/payment and mined GS020 receipts remain later gates.

## Sponsor-specific feedback
No new sponsor interaction or live-user success. Anvil L1 fee accounting is local-only
and explicitly cannot be used as a live measurement. Prior measured findings remain
in the treasury Whitechain feedback report.

## Next exact H action / commands
Review the unsigned infrastructure plan before any funding or signing decision:

```sh
node script/treasury/plan.mjs infrastructure
```

Expected parameters: Whitechain 1874; deployer
`0x10d8C1d6359F0694203924182d3da83843a4e052`; SeatRegistry constructor attester
`0x84068C51A9236A869E5F05FBA96323E97597DDEd`; SafeSetup constructor singleton
`0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`. The saved plan's source is cd600ab;
it says NOT_SUBMITTED, funding UNCONFIRMED and broadcastAuthorized=false.

`script/treasury/RUNBOOK.md` provides exact no-keystore, no-broadcast simulations,
code/balance/nonce read checks and subsequent manifest readback commands. H should
review/integrate this branch with RELAYER_ENABLED=false. No password/key action is
needed for review. Missing founder wallets/ventureId prevent an exact treasury plan;
do not substitute dummy live values or treat staging seats as real humans.

## Next independent task
Await H's integration/configuration review and C1 seam acceptance. No live action is
self-authorized. Source, tests, evidence and simulation-only commands are reviewable.
