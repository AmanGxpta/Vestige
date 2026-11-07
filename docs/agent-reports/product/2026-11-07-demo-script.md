# vestige — demo script (≤ 3:00)

**Recording setup:**
- **Screen:** Chrome profile **A** (founder Aman) on the left, profile **B** (co-founder) on the right. Both run MetaMask, with the integrated server running real C1 and X handlers and World **staging**.
- **Public page:** a third tab, not signed in, on `/v/northstar.vestige.eth`.

**Legend:**
- **LIVE** — real today: real handlers, real Sepolia or World staging.
- **LIVE·SIM** — real staging exchange, labelled TESTED IN SIMULATOR on screen.
- **PENDING X** — needs X's Whitechain deployment, a reviewed manifest or H approval. Record it only once it exists; otherwise narrate the honest state shown.

Never-cut items are marked **[NC1]–[NC4]**:
- **NC1** — duplicate-human refusal.
- **NC2** — on-chain 1-of-2 revert.
- **NC3** — ENS-resolved public evidence.
- **NC4** — fresh venture created live.

| Time | Screen | Say (short) | Status |
|---|---|---|---|
| 0:00–0:12 | Landing | "Funders back teams before they incorporate, with no company, no verified signers and no record of who controls the money. vestige gives a team one name that proves two humans, signed terms and a treasury neither founder can drain." | LIVE |
| 0:12–0:40 | **A:** Connect wallet, then *Sign in wallet* (MetaMask `personal_sign`). Create a venture (e.g. `demo-<hhmm>`) and create an invite. **B:** open the link, sign in, then *Join*. | "Each founder signs in with their own wallet. vestige never holds their keys." **[NC4]** | LIVE |
| 0:40–1:05 | **A:** *Verify with World ID* (staging); the badge reads **HUMAN_VERIFIED · TESTED IN SIMULATOR**. **B:** verifies with the **same simulator identity**, and the server refuses with `DUPLICATE_HUMAN`. | "One human, one seat. The same person can't hold both seats, even with a second wallet. This is World's staging simulator, labelled as such." **[NC1]** | LIVE·SIM |
| 1:05–1:15 | (Cut.) The B seat now reads **SELF_REPORTED · DEMO OVERRIDE · NOT WORLD-VERIFIED**. Founders stat: "1 / 2 verified · TESTED IN SIMULATOR · 1 demo override". | "We had one simulator identity for two people, so an operator marked seat two ready for the demo. It's labelled, and it's never counted as a human." Requires H to run the CR-ID-06 operator command before recording; otherwise skip to 1:15 and show only A. | LIVE (operator step) |
| 1:15–1:45 | **Terms:** both see the same exact EIP-712 hash. A switches to Sepolia when MetaMask prompts and signs; B signs. A edits one field, the version bumps and both signatures reset. | "Both founders sign the exact same hash. Change a word and the old signatures stop counting." | LIVE |
| 1:45–2:15 | **Public tab:** `/v/northstar.vestige.eth`, then *Re-run checks*. Show resolver `0x17cb…9C08`, `vestige.ventureId 0xe68b…e3ff`, `vestige.status workspace`, `vestige.humans 1`. The off-chain founders show `aman` **HUMAN_VERIFIED · TESTED IN SIMULATOR**, and `ravi` either not verified or **DEMO OVERRIDE**. | "No account, no trust in us: this page reads ENS on Sepolia directly. northstar was registered on Sepolia through an H-approved plan, and all 18 post-deployment checks pass." **[NC3]** | LIVE (ENS part) |
| 2:15–2:40 | **Treasury:** *Request deployment* shows "Deployment requested — waiting for operator approval". **Once X is live:** the Safe 2-of-2 is ACTIVE on the public page, the funder deposits 100 USDT gaslessly, and a 50 USDT payment is approved by both. | "Money lives on Whitechain in a Safe that needs both humans. The Guard only accepts verified-human seats." | Request: LIVE. Safe, deposit, payment: **PENDING X** |
| 2:40–2:52 | Explorer: the rejected one-signature `execTransaction`, reverted **`GS020`**, mined on Whitechain. | "One founder alone tried to pay out. The chain refused it." **[NC2]** | **PENDING X / H approval** |
| 2:52–3:00 | Close: "vestige.eth: know who you're funding, from day zero." Show the traction numbers (§11). | | LIVE |

## Fallbacks (keep the claim honest)

- **NC2 not mined by recording time:** don't show a fork or anvil revert as on-chain. Say *"the one-signature refusal is tested on a Whitechain fork; the live revert is pending deployment"* and show the fork test transcript as **LOCAL FORK**.
- **No manifest yet:** the public page shows "No treasury linked" with "No treasury published yet" in step 1, and is never ACTIVE without a reviewed manifest. Narrate that as the fail-closed rule; it's a feature.
- **Fresh venture ENS:** a venture created live gets its ENS steps **PENDING** (the API never broadcasts). northstar shows the registered end state. Say so: *"new names are registered by an operator from an H-approved plan; here's one we registered earlier today"*.
- **World:** never say "two real humans verified". Say "World staging simulator".

## Pre-flight (5 min before recording)

1. `curl -s $ORIGIN/api/identity/public/northstar.vestige.eth | jq '.founders[] | {subname,label,worldEnvironment,demoOverride}'`. Expect `aman` with `worldEnvironment: "staging"`, plus `ravi`.
2. `VESTIGE_LIVE=1 pnpm exec vitest run src/modules/public-view/northstar.live.test.ts` passes (live ENS records unchanged).
3. If X has published the manifest: `pnpm test src/modules/public-view/manifest-dropin.test.ts` passes, and the build was made with `NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL=/manifests/{ensName}.json`.
4. Both MetaMask profiles pass the smoke checklist (`2026-11-07-metamask-smoke-checklist.md`).
