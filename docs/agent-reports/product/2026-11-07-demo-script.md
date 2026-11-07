# vestige — demo script (≤ 3:00), two variants

**Recording setup:**
- **Screen:** Chrome profile **A** (founder `aman`) and profile **B** (co-founder), both with MetaMask, on the integrated server with real C1 and X handlers and World **staging**.
- **Third tab:** not signed in, on `/v/northstar.vestige.eth`.
- **Explorer tabs:** pre-open each "Evidence" link below so cuts are instant.

**Legend:**
- **LIVE** — on-chain or real staging exchange, re-read by C2.
- **LIVE·SIM** — real World staging exchange, labelled TESTED IN SIMULATOR.
- **MOCK_ONLY** — labelled demo override.
- **PENDING X** — not yet on-chain; never shown as done.

**Variant choice:**
- **(a) Full** — X finishes the treasury leg: Safe + Guard linked from ENS, reviewed manifest, deposit, payment, GS020. That is PRD demo step 5 completing so step 6 (verify) can show ACTIVE.
- **(b) Fallback** — stops at **"seats attested"** (live now) or **"Safe deployed"**, if the Safe lands without the rest.

## Never-cut items → evidence

| # | Item | Evidence to show | Status |
|---|---|---|---|
| NC1 | Duplicate-human refusal | No chain tx by design: World proofs are verified off-chain. Show the live refusal in profile B, then the public timeline row "Duplicate human refused a second seat" (3 recorded for northstar). Staging transcript: `docs/agent-reports/identity/evidence/world-staging-e2e.json` (case ID-03). | LIVE·SIM |
| NC2 | On-chain 1-of-2 revert | Rejected `execTransaction` from the isolated sender, revert `GS020`: tx **PENDING X / H approval**. Fallback: the Foundry/fork transcript, shown and narrated as **LOCAL FORK**, never as on-chain. | PENDING X |
| NC3 | ENS-resolved public evidence | Registration of `northstar.vestige.eth` [`0x941bb725…3ab0`](https://sepolia.etherscan.io/tx/0x941bb725a2d7e7efddcc739cd7c62640d9e5e87d392fb91e9e4f490989173ab0). The page reads resolver `0x17cb…9C08` and `vestige.ventureId/status/humans` live. Seat attestations on Whitechain: [`0x4c123b4f…cec2`](https://explorer.testnet.whitechain.io/tx/0x4c123b4f9e3e4d93fb25b9abeaadb69a94a1ad1aa6c37f508bcc5bb00e29cec2) (aman) and [`0x2d185976…28de`](https://explorer.testnet.whitechain.io/tx/0x2d1859763c7b5b621fc251e37b3d60c81b1242bdc7cb5411118be2045a7728de) (ravi, MOCK_ONLY override hash). | LIVE |
| NC4 | Fresh venture created live | Create, invite and join live on camera (off-chain, real handlers). The ENS end state for a venture created today through the same API: northstar V1 [`0xa11e884a…623b`](https://sepolia.etherscan.io/tx/0xa11e884ab4131b8fcb129d5f7a12a1977bc113edff9aa34c9ff582d381f9623b), V2 [`0x9af16690…af9b`](https://sepolia.etherscan.io/tx/0x9af16690cf3ab772c54a155e99db4a9e23e4d442ba1140b8288e19ede2f6af9b), V3 [`0x941bb725…3ab0`](https://sepolia.etherscan.io/tx/0x941bb725a2d7e7efddcc739cd7c62640d9e5e87d392fb91e9e4f490989173ab0), founder name [`0x282286c7…028f`](https://sepolia.etherscan.io/tx/0x282286c7c1478b1ddeec7c43fe3a71d395f8329026888f6813e5b5b28114028f). The on-camera venture's own ENS stays PENDING until an H-approved plan is broadcast; say so. | LIVE (ENS via approved plan) |

## Variant (a): full, once X reports every step 5 receipt

| Time | Screen | Say (short) | Evidence |
|---|---|---|---|
| 0:00–0:12 | Landing | "Funders back teams before they incorporate, with no company, no verified signers and no record of who controls the money. vestige binds two humans, signed terms and a treasury neither founder can drain to one name." | — |
| 0:12–0:35 | **A:** sign in, create a venture, invite. **B:** join. | "Each founder signs in with their own wallet; vestige never holds keys." **[NC4]** | live UI; northstar V1–V3 |
| 0:35–0:55 | **A:** World staging, badge **HUMAN_VERIFIED · TESTED IN SIMULATOR**. **B:** same simulator identity, refused `DUPLICATE_HUMAN`. | "One human, one seat, even with a second wallet. This is World's staging simulator." **[NC1]** | timeline row |
| 0:55–1:05 | Cut to northstar's seat list. aman's seat attested; ravi **DEMO OVERRIDE · NOT WORLD-VERIFIED**, seat tag **DEMO-OVERRIDE HASH · MOCK_ONLY**. | "We had one simulator identity for two people, so an operator marked seat two ready. It's labelled everywhere and never counted as a human." | `0x4c12…cec2`, `0x2d18…28de` |
| 1:05–1:30 | **Terms:** same hash on both screens; A approves the Sepolia switch and signs; B signs; edit one word and both signatures reset. | "Change a word and the old signatures stop counting." | `agreement_signed` events |
| 1:30–1:45 | **Treasury:** Safe deployed, 2-of-2, Guard attached; ENS now points to it. | "Money lives on Whitechain in a Safe that needs both seats." | Safe deploy tx (X), ENSIP-11 tx |
| 1:45–2:00 | **Funder page:** "2-of-2 treasury active — verified from chain reads only: N of N checks". Sign one EIP-3009 message to deposit 100 USDT. | "The funder signs one message and never holds gas." | deposit tx (X) |
| 2:00–2:20 | A proposes a 50 USDT payment and executes alone. Explorer shows the revert **`GS020`**. | "One founder alone tried to pay out. The chain refused it." **[NC2]** | GS020 tx (X) |
| 2:20–2:35 | B approves; the payment executes. | "Both humans, then it moves." | payment tx (X) |
| 2:35–2:52 | **Public page**, *Re-run checks*: **Treasury active**, every Whitechain check `CHAIN_VERIFIED`, plus the override notice for ravi. | "You don't have to trust us: ENS on Sepolia, then the Safe, Guard and seats on Whitechain." **[NC3]** | page itself |
| 2:52–3:00 | Close and traction numbers. | "vestige.eth: know who you're funding, from day zero." | — |

## Variant (b): fallback, stops at "seats attested" or "Safe deployed"

| Time | Screen | Say (short) | Evidence |
|---|---|---|---|
| 0:00–0:12 | Landing | (same as variant a) | — |
| 0:12–0:40 | Create, invite, join | **[NC4]** (same as variant a) | live UI; northstar V1–V3 |
| 0:40–1:05 | World staging + duplicate refusal | **[NC1]** (same as variant a) | timeline row |
| 1:05–1:35 | Terms: hash, sign, reset | (same as variant a) | — |
| 1:35–2:05 | **Seats on Whitechain:** open `0x4c12…cec2` on the explorer (`attestSeat` to SeatRegistry `0xe91B…bcBA`), then ravi's `0x2d18…28de`. | "Each seat is written on Whitechain by vestige's attester. The Guard will only accept these seats as Safe owners. Seat two is the labelled override." | `0x4c12…cec2`, `0x2d18…28de`, SeatRegistry deploy `0x4b33…d6ff` |
| *(if the Safe landed)* 2:05–2:20 | Explorer: Safe deploy via SafeSetup `0x1534…1558`; owners and threshold 2 on the explorer. | "The 2-of-2 Safe is deployed with the Guard. Linking it from ENS is the next step." Do not say "active". | Safe deploy tx (X) |
| 2:05/2:20–2:45 | **Public page** `/v/northstar.vestige.eth`: name resolved; "No treasury published yet" (or "Treasury unverified" if the Safe exists but isn't linked); founders with TESTED IN SIMULATOR and DEMO OVERRIDE; seat attestations in the timeline. | "The page refuses to call a treasury active until ENS, the Safe, Guard and seats all check out against the reviewed manifest." **[NC3]** | page itself |
| 2:45–2:52 | NC2 disclosure | "The one-signature refusal is proven on a Whitechain fork; the live revert is waiting for deployment." Show the fork transcript labelled **LOCAL FORK**. | fork transcript |
| 2:52–3:00 | Close | (same as variant a) | — |

## Never say

- "Two real humans verified." Say "World staging simulator".
- "Treasury active", unless the page's own chain verdict says ACTIVE.
- Anything implying ravi is World-verified.
- That a fork revert is on-chain.

## Pre-flight (5 min before recording)

1. `VESTIGE_LIVE=1 pnpm exec vitest run src/modules/public-view/northstar.live.test.ts`: ENS records unchanged.
2. Variant (a) only: `pnpm test src/modules/public-view/manifest-dropin.test.ts` (X's digest pinned) and `VESTIGE_LIVE=1 VESTIGE_EXPECT_ACTIVE=1 pnpm exec vitest run src/modules/public-view/northstar.live.test.ts` both pass, and the build was made with `NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL=/manifests/{ensName}.json`.
3. Both MetaMask profiles pass `2026-11-07-metamask-smoke-checklist.md`.
