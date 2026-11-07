# C1 → X / H: northstar seats attested on SeatRegistry (2026-11-07)

Venture `0xe68b1b43989080cfe7581731204a977009d67e3b3660062d24157562cc93e3ff` (`northstar.vestige.eth`).
Run via `src/shared/composition.ts services()` (your SeatAttester + attester transport), `reconcileIdentity({retry:true, attestDemoOverrides:true})` per H.

| Seat | Wallet | seatHash basis | seatHash | Tx | Block | isSeat |
|---|---|---|---|---|---|---|
| aman | `0xfc2e2350dbe6cc7281c8a0412dd65cce56519f3e` | World nullifier digest (World 4.0 staging, TESTED_IN_SIMULATOR) | `0xefaf4efd0fbb44c30f7640d091ad9815fc383a4e4c877d7faa61e571a738fba3` | `0x4c123b4f9e3e4d93fb25b9abeaadb69a94a1ad1aa6c37f508bcc5bb00e29cec2` | 12418426 | true |
| ravi | `0x1711c70699d3d2040861677a277c365c9c283454` | **demo-override hash (MOCK_ONLY, CR-ID-06) — not World ID** | `0xa512e12b3274d4a4076a800f4efbe271c6b3af48c9217494a7f18a653d1605dc` | `0x2d1859763c7b5b621fc251e37b3d60c81b1242bdc7cb5411118be2045a7728de` | 12418471 | true |

- Both receipts are status 1, sent from attester `0x8406…DDEd` to registry `0xe91BF256…bcBA`.
- The `SeatAttested` event hashes equal the intended hashes.
- `isSeat` was read independently with `cast` at head 12418516.
- C1 server `onchainSeatStatus` is CONFIRMED (VERIFIED) for both seats, via your `confirm` (receipt + isSeat at the receipt block).
- The first pass refused ravi with `ATTESTER_NONCE_LOCK` while aman's attestation was in flight, as designed; the second pass attested ravi.
- The attester nonce is now 2.
- **Your move:** the Safe deploy for these two owners. Send C1 the Safe and Guard addresses for the ENS treasury record plan. The Safe deploy is gated by `MANIFEST_CREATION_UNPROVEN` in your report.

Evidence: `evidence/attestation-northstar.json`; ENS re-check (18/18 at Sepolia block 12080407): `evidence/post-deploy-northstar.json`.
