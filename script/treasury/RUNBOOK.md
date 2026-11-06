# Treasury v0 — simulation and readback only, 2026-11-07

Approved interface revision: `30d1ef68059c18b5d6adfee2a6b0db86b2ae413e`.
This session authorizes local implementation/tests only. **No live Vestige transaction
is authorized, including infrastructure, attestations, funding, treasury creation or
GS020.** Do not add broadcast flags, use a keystore, or send a deliberate failure.
The earlier runbook's live-send examples are superseded by this document.

## Current public parameters

All are fresh Vestige accounts documented at ee46097, not Waypoint accounts:

| Purpose | Public address |
|---|---|
| Infrastructure deployer | `0x10d8C1d6359F0694203924182d3da83843a4e052` |
| Seat attester | `0x84068C51A9236A869E5F05FBA96323E97597DDEd` |
| Restricted relayer | `0xc57f2f78997e35fc2C1E0BA06249B499cD293116` |
| Test USDT funder | `0xD613312b630C9359EcE15dBF3969c47261d8d43A` |
| Payee | `0xabDC5035CEa855Ec7Cf8A7259eA26E131f0BA8D8` |
| Isolated failed-tx sender (unused) | `0xd03ce7DAE6c4B75fE26213Cb08CEB9286D1FC852` |
| Sepolia registrar | `0xc63F0594309F21E35b41298C71d370c0d0A9313C` |

No balance/funding confirmation is claimed. No founder account has been provisioned
by X. Passwords/private keys are neither needed nor requested for these commands.
Do not use Keychain/password commands or paste credentials into chat.

## Reproduce all tests without live writes

From the treasury worktree:

```sh
git branch --show-current
npm ci --prefix src/modules/treasury --ignore-scripts
npm ci --prefix src/modules/relayer --ignore-scripts
npm ci --prefix src/modules/treasury/spike --ignore-scripts
forge test -vvv
npm test --prefix src/modules/treasury
WHITECHAIN_FORK_RPC=https://rpc.testnet.whitechain.io forge test --match-contract WhitechainForkTest -vvv
node tests/treasury/local-fork.integration.mjs
node script/treasury/export-abis.mjs
git diff --exit-code -- contracts/abi
```

The fork commands perform chain reads plus **local** writes only. Local integration
starts silent Anvil on unused 127.0.0.1:18574, uses public deterministic test identities,
local issuer impersonation and a local-only fee review. It does not access any Vestige
keystore. Its SQLite/journal/chain state are isolated and deleted after the test.
Anvil results and its artificial zero L1 receipt fee do not constitute live fee measurements.

## Next exact H action: review this unsigned infrastructure plan

```sh
node script/treasury/plan.mjs infrastructure
```

Parameters: Whitechain 1874; deployer address above; SeatRegistry constructor is the
attester address above; SafeSetup constructor is canonical L2 singleton
`0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`. Factory is
`0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`. No owners, ventureId, nullifiers,
Guard or treasury address are fabricated. Plan output is NOT a deployment manifest.

H can independently run these **read-only** prechecks and simulations later:

```sh
export WHITECHAIN_RPC_URL=https://rpc.testnet.whitechain.io
export DEPLOYER_ADDRESS=0x10d8C1d6359F0694203924182d3da83843a4e052
export ATTESTER_ADDRESS=0x84068C51A9236A869E5F05FBA96323E97597DDEd
cast chain-id --rpc-url "$WHITECHAIN_RPC_URL"
cast balance "$DEPLOYER_ADDRESS" --rpc-url "$WHITECHAIN_RPC_URL"
cast nonce "$DEPLOYER_ADDRESS" --block pending --rpc-url "$WHITECHAIN_RPC_URL"
cast codehash 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762 --rpc-url "$WHITECHAIN_RPC_URL"
cast codehash 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67 --rpc-url "$WHITECHAIN_RPC_URL"
forge script script/treasury/DeployInfrastructure.s.sol:DeployInfrastructure --rpc-url "$WHITECHAIN_RPC_URL" --sender "$DEPLOYER_ADDRESS" --non-interactive
```

Expected chain ID: 1874. Expected code hashes:
- Singleton: `0xb1f926978a0f44a2c0ec8fe822418ae969bd8c3f18d61e5103100339894f81ff`
- Factory: `0x50c3cdc4074750a7a974204a716c999edd37482f907608d960b2b025ee0b3317`

There is no keystore/account option and no broadcast option in the simulation command.
An unfunded sender or RPC failure may prevent simulation; record that failure rather
than skipping checks or calling the dry run a deployment. H must separately approve
funding and exact live transactions later. The agent has not run that live simulation.

## Treasury preparation after real infrastructure records and C1 seats exist

Set only H-confirmed public inputs from receipt-reviewed infrastructure and C1's
canonical venture record: VESTIGE_DB_PATH, VENTURE_ID, TREASURY_SALT,
SEAT_REGISTRY_ADDRESS, SAFE_SETUP_ADDRESS, EXPECTED_REGISTRY_CODEHASH and
EXPECTED_SETUP_CODEHASH. The read-only plan reads wallets/environment, never raw
World nullifiers or keys:

```sh
node script/treasury/plan.mjs treasury
```

Exactly two confirmed C1 seats are required. WORLD_PRODUCTION and TESTED_IN_SIMULATOR
remain distinct. Staging can prepare a simulation but must never produce a claim of
two real humans or authorize a live treasury. The plan always says broadcastAuthorized=false.
No founder wallets or ventureId are currently supplied, so no exact treasury plan can
be prepared yet. Do not replace them with dummy live addresses.

After H reviews the output, set FOUNDER_A_ADDRESS and FOUNDER_B_ADDRESS to its wallets
and simulate (still no signing/broadcast):

```sh
forge script script/treasury/CreateTreasury.s.sol:CreateTreasury --rpc-url "$WHITECHAIN_RPC_URL" --sender "$DEPLOYER_ADDRESS" --non-interactive
```

Fixed initializer: exactly those owners, threshold 2, approved SafeSetup.install of
approved registry + ventureId, zero fallback handler, zero payment/refund, approved
singleton/factory. Any later real treasury needs separate H approval and honest source labels.

## ABI/manifest/readback integration

Publish `contracts/abi/*.json` + index hashes; schemas are
`contracts/manifests/InfrastructureManifestV1.schema.json` and
`DeploymentManifestV1.schema.json`. Typed declarations and the pure adapter live in
`src/modules/treasury/manifest.*`. Infrastructure artifacts have no placeholder Safe/Guard.
Every canonical artifact needs its genuine deployment transaction/block provenance;
missing provenance is a gate. C2 must serve/copy public artifacts through its owned UI
paths or H hosting configuration; X does not invent a new unapproved artifact endpoint.

Once there is an approved complete treasury manifest:

```sh
node script/treasury/readback.mjs "$VESTIGE_DEPLOYMENT_MANIFEST_PATH"
```

This validates ABI bytes, runtime fingerprints, receipt confirmation/canonical blocks,
factory initializer, Safe owners/threshold and Guard binding. It submits nothing.
Public reader starts with ENS ventureId/address, cross-checks the manifest, and scans
Transfer logs from deploymentBlock in windows <=10000. Unknown/mismatch is UNVERIFIED.

## Auth, port and storage composition for H integration

Merge C1's approved schema/auth follow-through before using routes. H owns root
scaffolding; this checkout has no root Next.js package/build. Treasury routes are thin
Next wrappers over tested Request/Response handlers. Node's sqlite WAL/busy timeout and
020 additive migration are used; C1 identity tables are only read by X.

C1 calls registerSeatAttester with X's SeatAttester instance. Construct it with the
shared TreasuryStore, public client, manifest registry artifact, public attester and an
opaque **separately approved** signing transport. Its authorizeSend defaults false.
No private-key/keystore loader is supplied. The default treasury runtime exposes only
an unconfigured/read-only port. Raw nullifiers never enter this seam: C1 supplies the
approved keccak256(abi.encode(uint256(rawNullifier))) digest and pins proof environment.

Default runtime has no signing transport and authorizeSend=false. RELAYER_ENABLED=true
alone cannot enable it. For later review, H composes createReviewedRelayer with the
approved env limits, approved manifest adapter, isolated RpcIO signer callback, persistent
FileJournal, roles, working AlertHooks, explicit fee review and authorization callback.
No founder signing credential ever enters this backend.

All .env.example fee/rate/balance fields must be nonblank positive integer values;
maximum-per-minute is an integer. No numeric live values are approved here. A LIVE
review binds limitsDigest, chainId 1874, reference, expiry, H-chosen marginBps >=10000,
and receipt-backed measurements (txHash, blockHash, evmFeeWei, l1FeeWei and the recorded
pre-send quotedL1FeeWei). The L1 reserve must cover the reviewed peak + chosen margin.
The max-fee env maps to the current legacy gas-price ceiling, not a total fee guarantee.

Collect already-existing public receipt fee evidence without new transactions:

```sh
node script/treasury/inspect-fees.mjs "$OBSERVED_TX_HASH"
```

That is evidence for review only, not an enable switch. No receipt hash is currently
provided and no fee review is fabricated. New fee-measurement transactions need H approval.

## Alerts/circuit breaker and recovery

Required hook transport uses HTTPS, no redirects, a timeout and sanitized numeric
metrics. It reports balance, budgets/fees, drift, simulation failures, replay, unknown
submission, nonce lock, receipt failures and confirmation latency. Probe failure blocks
sending. Actual fees above reserve, missing fee accounting, drift and low balance persist
a circuit. A live kill switch and authorization callback are checked on each attempt.

Before every send, record sender nonce, target/calldata hash and fee quote/reservation.
RESERVED/UNKNOWN/SUBMITTED block the wallet. `reconcileNonce({id,txHash,review})` is an
operator-only in-process seam: it checks actual sender/nonce/calldata and may attach
matching evidence or mark a canonically consumed different intent FAILED. It never resends. A reviewed abandonUnsent option applies only to RESERVED entries
without a durable broadcast-attempt marker and with unchanged latest/pending sender
nonce; it marks FAILED and retains replay protection.
`clearCircuit` requires explicit review, fresh policy/alerts/manifest checks and no in-flight jobs.

A crashed FileJournal lock records PID. `recoverDeadJournalLock` requires a dead owner,
explicit review and exact journal SHA-256, retains the lock as audit evidence and leaves
nonce/replay reservations intact. Legacy locks lacking nonce/PID need a manual audit.
Never delete a lock or blindly retry. Coordinate SQLite and journal backups; use one
host and one process per dedicated relay wallet. No recovery action was run on live data.

No GS020 send command is provided or authorized in this revision. Foundry's simulated
GS020 test is retained; a mined failure remains a separately approved future gate.
