# Integration review of Luna 5.6's v0 draft

## What changed

Reviewed the interrupted, uncommitted draft against C1 `1b502e6`, X `3dc0004`, C2 `142cdd2`, MASTER §3, and the actual branch port/auth/canonicalizer/relayer code. Retained approvals for CR-X-001, CR-ID-01…04, World D-004 and CR-C2-001…005. Decisions authorize local implementation; separate owner ACKs and live transaction approval remain required.

## Review findings and resolutions

1. **High — incompatible World protocol fallback:** selecting a different protocol after enrolling founders can yield different nullifiers for the same person and evade uniqueness in a persistent registry. Pin RP/app, environment and protocol for existing ventures; permit fallback only before enrollment with fresh namespace and explicit approval. This is a protocol-design inference, not a demonstrated live exploit.
2. **High — premature team lock:** no report ACKed the final draft, despite MASTER §3's three-owner requirement. Added an honest PENDING ledger and separated H approval (which unblocks implementation) from full team freeze. No acceptance is fabricated.
3. **High — incomplete deployment manifest:** SafeSetup and token implementation fingerprints were omitted; infrastructure schema still required nonexistent Safe/Guard fields. Split infrastructure/treasury shapes, include initializer hash, setup, proxy implementation, domain separator and real provenance, and require a pure mapping to X's flat runtime config.
4. **High — hash agreement was only superficial:** C1 hashes a validated founding-terms document; C2 preview hashes a version/template/fields envelope. Pinned the exact C1 document, Unicode/key/integer rules and required matching vectors before live signing.
5. **Medium — status regression:** draft replaced shared `VERIFIED` with treasury `ACTIVE`. Restored the original read enum and separated treasury, relay and payment lifecycles, with JSON/time conventions.
6. **Medium — forced persistence rewrite:** draft required an unimplemented SQLite journal despite X's tested single-host FileJournal. Accepted the existing durable journal with nonce exclusivity, disk persistence, crash recovery and no blind retry; SQLite remains the application DB.
7. **Medium — auth contract gaps:** auth bootstrap was accidentally subject to blanket bearer auth; token storage, logout, account change and session/payer authorization were unspecified. Added exceptions and explicit handling, following the EOA subset of EIP-4361. These are requirements for owners, not assertions of existing code compliance.
8. **Medium — incomplete configuration/operations:** names were listed without `.env.example`, rate/minimum-balance/journal/kill-switch settings were missing, and fee values were still implicit. Added placeholders, disabled relay by default, mandatory explicit limits and alert/fee measurement gates. No unmeasured fee number is claimed safe.
9. **Medium — overstated ENS guarantees and network UX:** restored parent registrar residual control and deferred Sepolia governance revocation; accepted visible switching without promising exactly one switch.
10. **Medium — public data/API ambiguity:** defined default-private consent, unknown list values/provenance, a public funding summary path, treasury payloads and idempotency semantics.

## Commits/files

This integration commit contains `.env.example`, `docs/CONTRACTS.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/INSTRUCTION_FOR_HUMAN.md`, and this report. Agent source and sibling worktrees were read, not integrated. Existing baseline commit remains `50efcf2`.

## Tests + actual output

- Interrupted commit did not execute: initial `git status --short --branch` showed four unstaged docs, HEAD still `50efcf2`.
- Reviewed source types and policy directly through `git show` for the three branch heads above.
- `git diff --check`: passed with no output. Configuration/doc consistency check: `PASS: 44 unique documented env names; blank secrets; relay disabled; all requested CRs; VERIFIED preserved.` No application implementation changed, and no application/chain tests were rerun or claimed here.

## Evidence URLs/tx hashes

- EIP-4361: https://eips.ethereum.org/EIPS/eip-4361 (message/domain/nonce and session context).
- World integration: https://docs.world.org/world-id/idkit/integrate (RP-signed actions, secret signing key, backend verification).
- Safe 1.4.1 ModuleManager source: https://github.com/safe-fndn/safe-smart-account/blob/v1.4.1/contracts/base/ModuleManager.sol (separate module execution path).
- Local Whitechain skill network reference supplied chain/RPC/public-credential conventions; no chain writes or live network-success claims were made by this review.

No tx hashes: no signing, deployment, funding, payment or publication occurred.

## Decisions proposed/implemented

H-approved v0 decisions are recorded in CONTRACTS and append-only DECISIONS entries, including review corrections D-019…023. Historical draft entries remain traceable; later corrections govern.

## Remaining issues

Owner compatibility ACKs, source adaptation and independent integration tests are pending. Root scaffold integration, actual World/ENS credentials/ownership, reviewed deployed manifests, measured relayer limits/alerts, and separately approved live receipts remain gates. Single-host disk persistence is required; this is not an authorization for ephemeral/serverless multi-instance deployment. Testnet no-recovery policy requires clear user disclosure.

## Sponsor-specific feedback

None collected. No sponsor acceptance or eligibility is asserted.

## Commands/actions for H

Use H-011 owner handoff and H-012 relay configuration queue. Have each owner ACK the committed revision with tests, or return a precise CR. Preserve pre-existing sibling edits when syncing. Do not mark a live gate verified from local mock/fork evidence.

## Next unblocked task

C1/X/C2 can now implement the accepted interfaces in their owned paths and return compatibility ACKs; H integrates root scaffold separately, then runs cross-owner acceptance tests.
