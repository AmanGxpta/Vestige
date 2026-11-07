# X — H-approved Whitechain infrastructure deploy, manifest, attester transport, v1 default

ROLE: X. BRANCH: agent/treasury, fast-forwarded to H's committed integration 62f9bec first.
AUTHORITY: H approval 2026-11-07 (testnet 1874 only): deploy SeatRegistry + SafeSetup exactly
per `2026-11-07-10-approval-packet-refresh.json`; wire attester signer limited to attestSeat;
make CR-X-002 v1 the default readback (C2 ACKed). Relay otherwise remains disabled.

## 1. Preflight (immediately before signing) — all matched the packet

deployer 0x10d8C1d6359F0694203924182d3da83843a4e052: 0.8 WBT, nonce 0 / pending 0.
attester 0x84068C51A9236A869E5F05FBA96323E97597DDEd: 0.2 WBT, nonce 0. No code at either
prediction. Build/init-code digests identical. Fresh `cast estimate`: 256933 / 1734322, under
the simulated gas limits 329781 / 2234707 and the approved ceilings 400000 / 2500000.
Script: exact init code re-hashed against the approved digest, explicit nonce, pending-nonce,
predicted-address and empty-code checks; any mismatch exits before signing.

## 2. LIVE receipts (chain 1874, ≥2 confirmations, canonical block hashes re-read)

| Contract | Address | Tx | Block | Gas used | Runtime code hash |
|---|---|---|---|---|---|
| SeatRegistry(attester 0x8406…DDEd) | 0xe91BF256Afa7c5453e715c39Ab2431EAd492bcBA | 0x4b3303aaec451196264af6ef4faf0df072d24456311c99fec98cc97b6e72d6ff | 12417009 | 253752 | 0x70b492b840c8d5f3c3ef6c17f38ab12926d1ce4bbe4500209394b5c566a4db4c |
| SafeSetup(singleton 0x29fc…C762) | 0x153406cd0509E71d302eD49E787051Bb98231558 | 0xb8f34f2b425cd80ac512ee44d7cc18f9301a25a71a2223e0a79e4334e79f4adb | 12417015 | 1719508 | 0xa28a95ebf012388ba5eaf564bc873f3d3b8da6eb69946ba29aa25d3a1721d35d |

Read-back: `attester()` = 0x84068C51…DDEd; `singleton()` = 0x29fcB43b…C762. Effective gas
price 5.000000001 gwei; receipts report no L1 fee field. Deployer after: 0.790133699997888051
WBT, nonce 2. Full receipts: `2026-11-07-11-infrastructure-deploy-receipts.json`.
Explorer: https://explorer.testnet.whitechain.io/tx/0x4b3303aaec451196264af6ef4faf0df072d24456311c99fec98cc97b6e72d6ff
and https://explorer.testnet.whitechain.io/tx/0xb8f34f2b425cd80ac512ee44d7cc18f9301a25a71a2223e0a79e4334e79f4adb
Source verification on Blockscout: NOT yet run (publishes source; command in INFRASTRUCTURE_APPROVAL.md).

## 3. Infrastructure manifest

`contracts/manifests/whitechain-1874/infrastructure.json` — `loadManifest(...,{infrastructure:true})`
passes (schema, anchors, token domain, ABI SHA-256). Canonical singleton/factory/token/impl
creation tx/blocks come from Blockscout's indexer (singleton/factory CREATE2 via 0x914d…43d7,
token proxy + implementation direct CREATE with receipt contractAddress). Code hashes are
current-state; they match the Safe anchors hard-coded in DeployInfrastructure.s.sol.

Strict `verifyManifestProvenance` against the public RPC: **MANIFEST_CREATION_UNPROVEN**.
`debug_traceTransaction` is not whitelisted and pre-~27h historical state is pruned
(state at head-100000 still readable). This does not affect seat attestation, but
`readConfirmedSeats` (treasury deploy) and `publish-manifest.mjs` fail closed on it.
Gate for the Safe deploy: H chooses a tracing/archive RPC, or explicitly approves an
explorer-attested provenance mode for the four pre-existing canonical anchors. X did not
weaken the check.

## 4. Attester transport (only broadcast grant in root composition)

`src/modules/treasury/attester-signer.mjs`: local signing from `VESTIGE_ATTESTER_PRIVATE_KEY`
(locked env name), raw-tx submit. Refuses before broadcast unless: target == manifest registry,
selector attestSeat and exact 100-byte calldata, value 0, account == key address, chain 1874,
estimate ≤ 120000 gas (limit = min(estimate×1.3, 120000)), base+tip < 10 gwei max fee,
tip ≤ 0.1 gwei. Measured live estimate 70503 gas; worst case ≤ 0.0012 WBT per attestation.
Optional `ATTESTER_ADDRESS` binds the key's address; SeatAttester also re-reads on-chain
`attester()`, registry code hash, EOA wallet and pending/latest nonce equality.
Pre-broadcast refusals release the reservation; any post-sign failure stays UNKNOWN (no retry).
Bad key ⇒ `attesterMode: ATTESTER_KEY_*`, attestation disabled, reads stay up. Key never in
errors/return values (tested). Relayer: still `authorizeSend:()=>false`, no relayer signer.

## 5. v1 default

`createRootComposition` default `readbackVersion=1` (H's committed wiring retained verbatim);
`readbackVersion:0` is the explicit legacy opt-out. The non-root fallback `runtime.mjs` is unchanged.

## Wrappers

`app/api/treasury/**` now pass `services` as dispatch's `prepare` hook (fix for the uncaught
ROOT_CONFIG_REQUIRED 500 reported in report 09). Wrapper test is now a source-shape test.

## Tests

`npm test --prefix src/modules/treasury`: 89 pass / 0 fail (red: 11-attester-red.txt).
`forge test`: 33 pass, 1 opt-in fork skip. No live attestation has been sent by X.

## Incident

During the first deploy attempt (nothing broadcast), Foundry mapped `ETH_PASSWORD` to
`--password-file` and echoed the deployer keystore password in its error into this agent
session transcript. The private key was not exposed (the keystore file stays local, mode 600).
Recommended: `cast wallet change-password` for vestige-deployer and update the Keychain item
after the demo. Final method used a mode-600 temp file in a private mktemp dir, removed on exit.
