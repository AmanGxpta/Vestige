# X handoff — current C1/C2 seams and approval gates

ROLE: X
BRANCH/WORKTREE: agent/treasury / vestige-treasury
STATE: IMPLEMENTED_AND_TESTED candidate; API contract/root integration acceptance pending.
No live signing/broadcast/faucet or deliberate GS020 transaction authorized or performed.

## What changed / commits and exact inputs

- f083222: CR-X-002 exact payload proposal. Specification SHA-256:
  4360cfa0f61691a28bc14f3852a8a1a826a5ed9897456081774475bf65f64b77.
- c675eab: creation-bound manifest provenance, conditional local publisher and
  disabled operator/infrastructure approval packet (report 06).
- 10af504: isolated draft readback/cache/evidence implementation (report 07).
- This handoff: same-connection C1/X composition and session authentication;
  current-source adapter tests; approved CR-ID-05 implementation/ACK, unregistered;
  local-fork deposit/payment projection and exact source/build review commands.

X retains its ACK of H v0 at 30d1ef68059c18b5d6adfee2a6b0db86b2ae413e.
Current harness inputs are C1 991f524ebab059337b953cc3c142c5c5aa330632 and C2
474256609570ba11085701f5db107127deaef780. C2 live-adapter.ts SHA-256 is
 d72bb6392e1f118d7a7afb78df1b974bbe9daf68857f971e6f5652bfd41b10d4.
Original source is git-archived, not copied from private sibling worktree config.
X has not edited C1/C2 source, root configs or shared docs. H-owned earlier edits
remain preserved/reconciled as reported at be2aabf; their backup is in Git metadata,
never staged. No new main sync or merge was performed. H's newer main approvals
were read through 4486de2; CR-X-002/CR-C2-009 still have no recorded acceptance.

## Exact payload decision remains pending, not silently shipped

The default service remains v0/flat with creation typedData. Candidate projection
is tested in isolation; no live endpoint response has been switched. This is an
explicit integration blocker, not a completed production payload migration.

Current C2 already fixed optional bearer GET and approval Idempotency-Key. Actual
current C2 against default v0 proves founder B cannot reload/sign (BLOCKED, signer
callback never called). The candidate owned patch now targets current C2's remaining
payload mapping: canonical safeTypedData only, no tab-only typedData cache, nullable
relay, and depositsStatus. Patch SHA-256:
8de147828cba291f0a3c1713219cd83a39a1a7f3f5c9e43f8ef9a4d4b48bc2c8.
It is NOT applied to C2's branch. Tests run the exact patched adapter source against
X handlers and actual C1 auth/SQLite; the fetch bridge only supplies browser Origin.

H must choose CR-X-002's precise contract versus C2's revised CR-C2-009. Explicit
choices in X's spec: nested schemaVersion:1 response; safeTypedData in POST and GET
(no typedData alias); founder-only reloadable payments; terminal/stale types null;
server block-pinned balance and bounded confirmed deposits retained because H asked
for them (C2 now also reads chains independently); VERIFIED evidence means verified
failed-transaction evidence, with GS020/MINED_TRACE fields, not a successful Safe call.
Operations retain the existing v0 result shape; C2's requested operation.kind is NOT
in this proposal. If H wants that addition or the C2 typedData/FAILED-evidence choices,
revise the exact spec and acceptance tests before shipping. No extra field was silently
adopted. C2 must ACK the chosen shape and align its types/UI, including partial-history
status, nullable relay/typed data and decimal-string evidence blocks. Patch transpilation
and adapter behavior pass; this is not a C2 typecheck/UI acceptance claim.

## Root and summary composition

script/treasury/ROOT_COMPOSITION.md gives exact H-owned module/wrapper instructions:
one persistent private SQLite connection; actual C1 010_* migrations then both X
020_* migrations; registerSeatAttester forwarding port BEFORE C1 singleton creation;
reuse actual C1 authenticate/logout; load reviewed manifests; initialize X dispatch
once. Default composition is READ_ONLY with no signer loader, no live fee review,
no authorizeSend grant. RELAYER_ENABLED alone cannot enable a transport.

CR-ID-05: H approval at b67de31 / D-025 is ACKed. summary-port.mjs implements its
exact signature and tests unknown/null, reorg/null, zero/false, positive/true and
explicit staging source. It remains unregistered: current C1 container has no summary
injection/registration hook. C1/H must wire the approved dependency on the same service
lifecycle. Report 05 explains cached observation-time semantics; outer list status is
intentionally ENS status and must not be overwritten with treasury ACTIVE without a
contract change. Actual C1 public list still has treasuryActive:null and funded:null.

## Tests and actual evidence

- npm test --prefix src/modules/treasury: 81 passed, 0 failed, 0 skipped.
  Includes the original 62 and six actual-source cross-owner tests. Exact typed-data
  hash, canonical POST key, two approvals, reload, nonce invalidation, public privacy,
  C1 revocation, incomplete-history mapping and relay state all covered.
- forge test -vvv: 33 passed, 0 failed, one explicitly opt-in fork test skipped.
- WHITECHAIN_FORK_RPC=https://rpc.testnet.whitechain.io forge test
  --match-contract WhitechainForkTest -vvv: 5 passed at pinned historical state.
- node tests/treasury/local-fork.integration.mjs: PASS, LOCAL_ANVIL_FORK_ONLY;
  Protocol Kit 8.0.11 guarded deployment, receipt-confirmed seat port, EIP-3009
  funding, two-owner payment, replay and one-owner refusal, durable SQLite/journal;
  new real-fork balance/deposit/executed-payment projection passes, evidence empty.
- Unsigned infrastructure forge script: PASS; exact predicted registry/setup returned;
  2564488 estimated gas, 0.025644880002564488 WBT estimated fee. No live receipt.
- Failing-first creation-provenance and mid-read reorg outputs saved beside green
  results. Mock traces prove validation behavior only, never a live mined GS020 claim.

Reproduce with npm ci --prefix src/modules/treasury --ignore-scripts, then the commands
above. Cross-owner Git objects must exist. Service output, Foundry/fork output and
local-fork JSON are separate tracked evidence files beside this report. Root Next
build and wallet/browser acceptance on H's integrated tree remain outstanding.
World fixtures in these tests are MOCK_ONLY; two staged SQL rows are not portal
acceptance, two independent simulator identities or production-human proof. D-024's
actual staging duplicate/cross-venture result does not establish two distinct humans.

## Exact approval parameters / commands for H

See script/treasury/INFRASTRUCTURE_APPROVAL.md and infrastructure-{review-plan,build-review}.json.
Chain 1874; deployer 0x10d8C1d6359F0694203924182d3da83843a4e052, nonce 0 then 1;
registry attester 0x84068C51A9236A869E5F05FBA96323E97597DDEd;
setup singleton 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
predictions 0xe91BF256Afa7c5453e715c39Ab2431EAd492bcBA and
0x153406cd0509E71d302eD49E787051Bb98231558. Refresh nonce/code/build before approval;
any change invalidates predictions. Proposed gas ceilings 400000/2500000, zero native
constructor value, solc 0.8.24 optimizer200/paris; exact init-code digests in build JSON.
Runtime templates with immutables are NOT deployed code hashes. Source verification,
readback and conditional local publication commands are in that packet; none grants
deployment authority. No actual manifest was published without reviewed live receipts.

Proposed relay only: maxGas700000, gas-price ceiling10gwei, 3/wallet+venture/minute,
daily reservation0.01WBT, minBalance0.002WBT, isolated allowance0.02WBT. L1 reserve,
margin/expiry, private disk/keystore metadata, alert destination/delivery and bounded
signer transport remain missing/unapproved. Fresh observed relay funding is 0.8WBT,
above that proposed allowance: H must review exposure. All roles remain separate.
Live OP L1 policy needs real receipt-backed measurements and recorded quotes; local
fee metrics are insufficient. Future signer independently enforces chain, sender,
zero value, exact target/selector, nonce/gas/fee bounds. Unknown nonce never retries.

Public funding refresh at block12409159: deployer0.8 WBT, attester0.2 WBT, relay0.8 WBT,
failedTx0.05 WBT; funder100 USDT, funder/payee0 WBT. This supersedes earlier zero
readiness data. X funded nothing and read no keys/passwords. Funding grants no authority.

## Next exact H action / remaining blockers

1. Accept or amend CR-X-002 at f083222 with exact spec digest above, explicitly settling
   the current CR-C2-009 differences. This is interface acceptance only, NOT broadcast.
2. Ask C2 to apply/ACK the matching payload patch/types/UI. Wire the shared root per the
   owned guide; C1 adds the approved summary dependency hook and observation semantics.
   Re-run integration/build/browser acceptance before declaring the seams done.
3. Separately review source/init-code hashes, fresh nonce/constructors, simulated gas,
   actual wallet exposure, and OP L1/signer/alert policies. Keep relay disabled. New
   measurements/deployments/attestations/GS020 each still require exact H authority.
4. Only after approved real receipts exist: validate/publish real manifests and deliver
   paths/digests/receipts/source URLs to C1/C2. Existing asset creation trace availability,
   genuine deployment hashes and CR-C2-008 manifest hosting semantics remain gates.

Sponsor-specific feedback: none received. No external endorsement invented.
Next independent task after acceptance: activate the agreed owned response and rerun
actual C2 handlers/root tests. Until then, preserve the tested candidate and disabled relay.
