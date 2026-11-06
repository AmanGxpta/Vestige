# Infrastructure / signer / publication approval packet — NO LIVE AUTHORITY

Read cross-worktree-review.md and readiness JSON first. The old 22:12 UTC zero-wallet
snapshot is historical; a fresh read now records balances in funding-refresh.json.
Funding observed from outside this agent does NOT authorize any transaction.
No keys/passwords/keystores were read and no transaction was sent by X.

## Exact unsigned infrastructure parameters

Review `2026-11-07-infrastructure-review-plan.json`. At the recorded block:
- chain 1874; deployer 0x10d8C1d6359F0694203924182d3da83843a4e052;
- confirmed/pending sender nonce 0, first CREATE registry nonce 0, helper nonce 1;
- SeatRegistry constructor: 0x84068C51A9236A869E5F05FBA96323E97597DDEd;
- SafeSetup constructor: 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762;
- predicted registry: 0xe91BF256Afa7c5453e715c39Ab2431EAd492bcBA;
- predicted helper: 0x153406cd0509E71d302eD49E787051Bb98231558.
These are predictions, not deployed addresses or manifests. The plan rechecks canonical
singleton/factory hashes and absence of code at predictions. Any changed nonce/build/
source invalidates the packet. Proposed ceilings are 400000 / 2500000 gas and require
simulation review; observed gas price was 5.001 gwei, not an approved gas-price policy.

Regenerate read-only immediately before approval:

```sh
node script/treasury/infrastructure-review.mjs
node script/treasury/public-funding-read.mjs
ATTESTER_ADDRESS=0x84068C51A9236A869E5F05FBA96323E97597DDEd forge script script/treasury/DeployInfrastructure.s.sol:DeployInfrastructure --rpc-url "$WHITECHAIN_RPC_URL" --sender 0x10d8C1d6359F0694203924182d3da83843a4e052 --non-interactive
```

No keystore and no broadcast flag are present. If simulation fails, record failure;
do not skip checks or report deployment. H must separately approve exact signing
parameters and bounded wallet exposure before any actual deployment command is used.
No live deployment command is granted by this packet.

X ran this unsigned simulation successfully: 2564488 estimated total gas;
estimated fee 0.025644880002564488 WBT at max fee 10.000000001 gwei. These are
simulation estimates, not receipt-backed OP L1 measurements or approved fee limits.
The 10 gwei draft legacy relay ceiling is a distinct policy, not this EIP-1559 quote.

## Source verification after real deployments — H authorization required later

Compiler: v0.8.24+commit.e11b9ed9; optimizer enabled, 200 runs, EVM paris.
Use the actual receipt contract addresses as REGISTRY_ADDRESS/SETUP_ADDRESS; do NOT
substitute predictions merely because an unsigned plan printed them. Verification
publishes source externally and is not executed now.

```sh
forge verify-contract "$REGISTRY_ADDRESS" contracts/SeatRegistry.sol:SeatRegistry --chain-id 1874 --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/ --constructor-args "$(cast abi-encode 'constructor(address)' 0x84068C51A9236A869E5F05FBA96323E97597DDEd)" --watch
forge verify-contract "$SETUP_ADDRESS" contracts/SafeSetup.sol:SafeSetup --chain-id 1874 --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/ --constructor-args "$(cast abi-encode 'constructor(address)' 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762)" --watch
cast call "$REGISTRY_ADDRESS" 'attester()(address)' --rpc-url "$WHITECHAIN_RPC_URL"
cast call "$SETUP_ADDRESS" 'singleton()(address)' --rpc-url "$WHITECHAIN_RPC_URL"
cast codehash "$REGISTRY_ADDRESS" --rpc-url "$WHITECHAIN_RPC_URL"
cast codehash "$SETUP_ADDRESS" --rpc-url "$WHITECHAIN_RPC_URL"
```

Save actual successful receipts, >=2 confirmation/canonical blocks and source URLs.
Never treat a dry-run address/result as a receipt or verified source.

## Bounded relay configuration for H review

`contracts/interfaces/proposed-operator-bounds.json` is an explicit disabled proposal:
max gas 700000; max legacy gas-price ceiling 10 gwei; wallet/venture rate 3/minute;
daily reservation ceiling 0.01 WBT; minimum balance 0.002 WBT; proposed narrowly funded
relay allowance 0.02 WBT. None is approved. Fresh wallet balances may exceed that draft
allowance; H must choose and review exposure rather than infer permission from funding.

L1 reserve is intentionally blank until real receipt-backed fee samples and recorded
quotes support an H-chosen margin/expiry. Private persistent journal/keystore metadata
and HTTPS alert destination are also operator inputs; do not paste credentials. Blank
fields reject enabling. Alerts must be tested for delivery and failure; kill switch,
actual sender/nonce, simulation, rate/budget and fee drift gates remain mandatory.
The fee record must bind limitsDigest and actual measurements, and cannot use Anvil's
local fee values. A finite L1 reserve is not a mathematical total-fee cap.

## Genuine manifest publication and C1/C2 handoff — conditional future step

No approved deployment receipts exist in this branch. Therefore no live manifest is
published now. Once H supplies genuine records for registry/setup AND the pre-existing
canonical singleton/factory/token/implementation, prepare the approved nested candidate
with exact ABI hashes. Do not invent any missing deployment hash or block.

A local operator review JSON binds approved:true, chainId:1874, reference, manifestSha256,
sourceCommit and approvedAt to the exact candidate. After H review, the read-only chain
validator and local publisher can be run:

```sh
node script/treasury/publish-manifest.mjs "$CANDIDATE_MANIFEST_PATH" "$MANIFEST_REVIEW_PATH"
```

It validates real receipts/creation provenance/code/ABI hashes/approval binding before writing the exact
bytes under contracts/manifests/published, and refuses a conflicting overwrite. It
never signs or broadcasts. Factory-created assets require a successful mined CREATE/CREATE2
trace if their deployment receipt has no matching contractAddress; an unavailable trace
blocks publication, even when code already exists. A full treasury candidate additionally requires actual
Safe/Guard creation receipts, initializer/venture linkage and current chain readback.

H/C1/C2 then receive the published path + SHA-256 + real receipt/source URLs. C1 uses
that ventureId/Safe/Guard binding for approved ENS writes (separate approval); C2 owner
serves the reviewed file/ABIs from its own public hosting path and independently resolves
ENS/Whitechain. CR-C2-008 URL templating remains pending; do not silently adopt it.

Rejected evidence is empty until a separately approved actual failed Safe transaction
has a canonical failed receipt and mined trace proving GS020. The operator-only reader
can ingest that existing hash later; it cannot create/send one. A local test, eth_call
or relayer refusal never satisfies the mined GS020 requirement.
