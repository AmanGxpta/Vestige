# C2 — northstar manifest drop-in and treasury verification

**Branch:** `agent/product` (main `f6a8858` + C2). No transactions sent by C2. Every claim below was re-read by C2 from the public RPCs.

## Manifest

- `public/manifests/northstar.vestige.eth.json` is copied byte-for-byte from `agent/treasury:contracts/manifests/published/northstar.vestige.eth-4504d9782084.json`.
- **SHA-256 `ebee268619a6bc5075f5ee41aed1d66aa5516d590c5b7b892e99274b50e602ef`** matches. It is pinned in `manifest-dropin.test.ts`. The server serves the same bytes (curl → same digest).
- **C2 validator change.** X's file adds `provenance: "EXPLORER_ATTESTED"` on the four anchors, which C2's strict validator rejected. C2 now mirrors X's **H decision A** exactly: the key is accepted only with that value, only on singleton, factory, token and token implementation, and only with the pinned address and code hash. Anywhere else it is refused, as the parity tests check.
- **Both validators accept the file.** C2's does, and so does X's `agent/treasury` validator, run from an extracted copy. The tree's `src/modules/treasury/manifest.mjs` is main's older copy; the parity cases that need X's provenance support are gated on its `EXPLORER_ATTESTED_ANCHORS` export and activate when H merges X.

## On-chain verification (Whitechain 1874)

| Item | Result |
|---|---|
| Safe creation `0x93ef2146…6293`, block 12418659 | status 1, through the factory `0x4e1D…ec67` |
| Safe `0xE707…23A2` | owners `0xfc2e…9f3E` + `0x1711…3454`, threshold 2, guard slot = `0x3255…fa6B`, no modules |
| Funding `0x80a0323b…ddef`, block 12418978 | `transferWithAuthorization` (bytes-signature variant) sent by relayer `0xc57f…3116`. Transfer `0xD613…d43A` → Safe for 10,000,000 (10 USDT). The funder holds 0 WBT |
| Payment `0x9be37d58…d4ad`, block 12419847 | `execTransaction` relayed. Transfer Safe → `0xabdc…a8d8` for 5,000,000. Safe nonce is now 1 |
| GS020 `0x7a0691c2…883a`, block 12419728 | status 0 from the isolated sender `0xd03c…C852`. C2 replayed it at parent block 12419727: `execution reverted: GS020` |
| **Safe USDT balance now** | **5,000,000 (5 USDT)**: 10 in, 5 out |

## ACTIVE? Not yet, and the reason is on Sepolia

**Chain-only verdict for `northstar.vestige.eth`: UNRESOLVED.**
- Re-read on Sepolia, the name has **no ENSIP-11 `addr(node, 2147485522)`**, no `vestige.treasury` and no `vestige.guard`. A reader starting from the name can't reach the Safe.
- The public page says "No treasury linked" and names the manifest's Safe as "not linked from ENS yet".
- The funder page says "Not active: no treasury linked from ENS yet", and funding stays closed.
- Screenshots: `screens/live-2026-11-07/05`–`07`.

**Diagnostic, labelled and not a page result** (`2026-11-07-northstar-active-diagnostic.txt`):
- It uses real ENS texts, real Whitechain and the published manifest; only the missing ENSIP-11 address is injected.
- Every check passes: ENS, link, ventureId, manifest, Safe, owners, threshold, Guard, binding, code hashes, modules, seats and status. The state is **ACTIVE**, with balance 5 USDT and 2 transfers.

**The only remaining step** is a Sepolia records transaction under an H-approved C1 plan:
- set `addr(northstar.vestige.eth, 2147485522) = 0xE707e3e99Da85B0D8F3814a640976b3B08A123A2`;
- set `vestige.guard = 0x3255A0C5d39167FC55b6dE917DCf6F014F6efa6B`.

Then run `VESTIGE_LIVE=1 VESTIGE_EXPECT_ACTIVE=1 pnpm exec vitest run src/modules/public-view/northstar.live.test.ts` and re-screenshot. No code change is needed.

## Build

`NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL=/manifests/{ensName}.json` must be set at build time.

## Tests

| Suite | Result |
|---|---|
| Typecheck | 0 errors |
| Unit | 120 passed, 5 skipped (opt-in live, X-provenance parity) |
| Build | OK |
| Cross-owner | 2 passed |
| Playwright mock + live | 6 passed |
| Drop-in + parity | 13 passed |
