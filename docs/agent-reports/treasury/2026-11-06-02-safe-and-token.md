# Treasury milestone 2 — bypass investigation and chain-1874 capability

## What changed
Local proposed VestigeGuard/SafeSetup implementation with real upstream Safe v1.4.1
integration tests. All self-calls except verified-seat swaps are refused. Exactly two
owners and threshold two are maintained. All delegatecalls, including MultiSend,
are refused; modules and fallback handlers must be absent. Pre/post execution checks
re-read configuration and the attached Guard. No Guard removal, replacement, admin,
upgrade or recovery path exists. A broken Guard or lost founder key can lock funds.
No claim that identity attestation prevents key sharing, collusion or key compromise.

SafeSetup is a trusted, setup-only delegatecall target. It checks the singleton,
constructs a Guard bound to the actual Safe address inside setup, and attaches it in
the same factory transaction. This avoids circular CREATE2 prediction (initializer
contains Guard address, Guard constructor needs Safe address) and an unguarded interval.
Factory initializer MUST use this helper, threshold two, zero fallback and zero payment.
Source-reviewed setup is a trust boundary: a malicious initializer/singleton can bypass
all later assurances. Only manifest-approved Safes qualify for the relayer.

## Commits/files
This commit: VestigeGuard, SafeSetup, Safe/Guard/fork tests, isolated SDK spike package,
version lock, and raw transcripts under this report directory.

## Tests + actual output
`forge test -vv`: see `2026-11-06-contract-suite.txt` (offline fork tests skipped).
`WHITECHAIN_FORK_RPC=https://rpc.testnet.whitechain.io forge test --match-contract WhitechainForkTest -vv`:
5 passed, 0 failed at pinned block 12353825. Fork mint uses local issuer impersonation;
no live transaction, issuer credential or faucet request occurred.
`node src/modules/treasury/spike/capabilities.mjs`: live code hashes/domain/version,
SDK prediction and factory eth_call captured in `2026-11-06-live-capabilities.json`.
Protocol Kit 8.0.11, viem 2.38.5 pinned in the isolated owned package.
This proves read-only simulation compatibility, not a mined deployment.
Guard/setup TDD transcripts include RED→GREEN for each policy added. One incidental
self-approveHash test already reverted in Safe (GS030); that was identified and replaced
as the self-call tracer with an empty self-call that actually failed before enforcement.

## Evidence URLs/tx hashes
- RPC: https://rpc.testnet.whitechain.io (chain ID 1874)
- Singleton: https://explorer.testnet.whitechain.io/address/0x29fcB43b46531BcA003ddC8FCB67FFE91900C762
- Factory: https://explorer.testnet.whitechain.io/address/0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67
- Token proxy: https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7
- Verified implementation API: https://explorer.testnet.whitechain.io/api/v2/smart-contracts/0x26425662D126412128967ECf0a02EC48573026F7
- Safe module behavior: https://github.com/safe-global/safe-smart-account/blob/v1.4.1/contracts/base/ModuleManager.sol
- ERC-3009: https://eips.ethereum.org/EIPS/eip-3009

No broadcast tx hashes exist. Nothing is VERIFIED_ON_CHAIN as a completed user flow.

## Decisions proposed/implemented
CR-X-001 still pending H acceptance. The local prototype is reviewable; no shared API,
schema, environment contract, identity module or product UI was changed.
Module exploit is reproduced: an enabled module lowers threshold despite a Guard that
rejects every normal transaction. Defense depends on clean bootstrap + forbidding modules.
Token domain: name `Tether USD`, version `1`, chainId 1874, verifyingContract proxy,
decimals 6; full domain separator in JSON evidence. Use transferWithAuthorization.
External receiveWithAuthorization to a Safe deterministically fails `to != msg.sender`.
Token is an upgradeable EIP1967 proxy with issuer/blocklist privileges; capability/domain
must be rechecked before use and policy pinned to approved deployment manifests.

## Remaining issues / architectural deployment blockers
1. H has not accepted shared interfaces, wallet authentication or persistence contracts.
2. No H approval for deployment/attestation/funding/failing transaction; none attempted.
3. Human-verified seats depend on C1's proof scope/binding and honest attester. Registry
   tests prove authorization/uniqueness of submitted hashes, not World verification.
4. Role-separated secure signer, WBT/USDT balances and authoritative manifest missing.
5. P1 revocation/rotation/recovery are omitted. Frozen two-owner policy deliberately
   disallows adding even verified third owners; H must accept that restriction.
6. Mined deployment/readback, genuine gasless receipt, successful payment and separate
   H-approved GS020 failed receipt remain outstanding acceptance gates.

## Sponsor-specific feedback
Measured: RPC answered, SDK explicit override and factory eth_call worked; direct receive
relay failed as specified. No claimed elapsed onboarding metric or sponsor conversation.

## Commands/actions for H
Run `forge test -vvv`; run the fork command above.
Run `npm ci --prefix src/modules/treasury/spike --ignore-scripts` then the capabilities script.
Approve/reject CR-X-001 and freeze v0 interfaces; no keys should be pasted in chat/logs.
Human-run deployment commands will be provided after the restricted relayer slice.

## Next unblocked task
Restricted relayer core with signatures, exact call construction, durable replay/budget
reservations, simulation as actual sender and receipt evidence; fail closed on missing seams.
