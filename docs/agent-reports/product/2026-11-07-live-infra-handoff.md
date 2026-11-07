# C2 product — live infrastructure follow-through (main f6a8858)

**Branch:** `agent/product`, synced with main `f6a8858` (conflict-free). No transactions signed or broadcast. No root, C1 or X source edited. Every on-chain claim below was re-read by C2 from the public RPC.

## 1. README (`docs/agent-reports/product/README.draft.md`)

**LIVE on Whitechain 1874:**
- SeatRegistry `0xe91BF256…bcBA` (tx `0x4b3303aa…d6ff`, block 12417009).
- SafeSetup `0x153406cd…1558` (tx `0xb8f34f2b…4adb`, block 12417015).
- Runtime code hashes match the infrastructure manifest; `attester()` and `singleton()` read back correctly.

**LIVE seat attestations for northstar** (status 1, `to` = SeatRegistry, `from` = attester, `attestSeat` calldata decoded):
- **aman:** `0x4c123b4f…cec2`, block 12418426, World staging digest.
- **ravi:** `0x2d185976…28de`, block 12418471. Its seat hash `0xa512…05dc` equals `keccak256("vestige.demo-override/1|ventureId|wallet")`, so it is a **MOCK_ONLY** override hash.
- `isSeat` is true for both.

**PENDING rows** (filled only from reported and re-read receipts): Safe + Guard, ENSIP-11/`vestige.guard`, the manifest SHA-256, deposit, payment and GS020.

**Explorer-attested provenance** for the singleton, factory, USDT proxy and implementation is explained in the README. C2 found that creation is independently checkable *without* tracing (`2026-11-07-infra-provenance-check.txt`):
- the CREATE2 address derived from each tx's own input via `0x914d…43d7` matches for the singleton and factory;
- receipt `contractAddress` matches for the token pair;
- code hashes match for all six.

Only the historical trace stays explorer-attested. **For H/X:** this may satisfy the `MANIFEST_CREATION_UNPROVEN` gate without an archive RPC. Accepting it is H's call.

**The MOCK_ONLY override seat:** the README states what is real (the chain seat, Safe owner and 2-of-2 rule) and what is not (no World proof behind it, not counted in `vestige.humans`).

All 30 README links were checked against the evidence files.

## 2. Manifest drop-in (ready; no file created, nothing received from X yet)

1. Copy X's file byte-for-byte to `public/manifests/northstar.vestige.eth.json`. Put X's published SHA-256 in `PINNED_SHA256` in `src/modules/public-view/manifest-dropin.test.ts`, in the same commit. A file without a pinned digest fails `pnpm test`.
2. Run the drop-in test. It checks the validator, the filename against `ensName`, the northstar ventureId, and the SHA-256 over the exact bytes. `manifest-parity.test.ts` proves C2's validator accepts and refuses exactly what X's `validateManifest` does: a northstar-shaped manifest on the live infrastructure, plus 6 mutations.
3. Build with `NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL=/manifests/{ensName}.json`.
4. Run `VESTIGE_LIVE=1 VESTIGE_EXPECT_ACTIVE=1 pnpm exec vitest run src/modules/public-view/northstar.live.test.ts`. It asserts **ACTIVE from Sepolia ENS + Whitechain reads only**.
5. Screenshot `/v/northstar.vestige.eth` and `/funder/northstar.vestige.eth`.

**The funder page now decides ACTIVE from the same chain-only verdict as the public page** (`readChainVerdict`), not from X's API readback. The deposit form opens only when that verdict is ACTIVE.

## 3. Label changes from real data

- **Seat check renamed.** It was "Every owner is a verified-human seat"; it is now **"Every owner holds a SeatRegistry seat"**, because the chain can't tell a human from an override. When an owner is an override seat, the check gets a MOCK_ONLY qualifier.
- **Override notices.** The public page shows a "One founder seat is a demo override (MOCK_ONLY)" notice. The funder page adds a qualifier, even when the treasury is ACTIVE.
- **Timeline and seat list.**
  - Seat events built on the override hash show **DEMO OVERRIDE · NOT WORLD-VERIFIED**.
  - `founder_demo_override` now appears in the timeline instead of being dropped.
  - The seat list tags the on-chain seat **DEMO-OVERRIDE HASH · MOCK_ONLY**.
- **Trust card.** It asserted "each founder proved with World ID"; it is now "What vestige checks", stated as rules, with the override disclosed.
- **Funder page, no treasury yet.** A workspace with no treasury linked shows a pending state, not a red failure.

## 4. Real-env run and screenshots (`screens/live-2026-11-07/`)

**Setup:**
- H's `.env.local`: World staging 4.0 and RPCs. It has no attester, registrar or relayer keys, so it can't broadcast.
- `VESTIGE_AUTH_URI` was overridden to `localhost:3400`.
- The DB is a **read-only `.backup` snapshot** of C1's live `vestige-identity/private/vestige.db`, kept in the C2 scratchpad. C1's DB was not opened for writing and is not committed.

**Screenshots:**
- `01` public top: override notice; "name resolved · no treasury published yet".
- `02` ENS records and humans: aman HUMAN_VERIFIED · TESTED IN SIMULATOR; ravi SELF_REPORTED · DEMO OVERRIDE.
- `03` timeline: both seat attestations, the override event, 3 duplicate-human refusals.
- `04` funder page: chain verdict "Not active: no treasury linked from ENS yet".

**Not captured:** the founder workspace. It needs the founders' own wallets, so H must run it with the MetaMask checklist. The Safe, deposit, payment and GS020 steps aren't live yet.

**Note for C1:** duplicate-refusal events have `source: "world-id"` with no environment, so the UI shows WORLD ENV NOT REPORTED. They were staging, but C2 won't infer that. Adding `-staging-4.0` to the source would fix it.

## 5. Tests (`2026-11-07-e2e-main-f6a8858.txt`)

| Suite | Result |
|---|---|
| Typecheck | 0 errors |
| Unit | 115 passed, 3 skipped (opt-in live) |
| Build | OK |
| Cross-owner | 2 passed |
| Playwright mock + live | 6 passed |
| Playwright integration | 1 passed |
| Live ENS northstar | passed |
