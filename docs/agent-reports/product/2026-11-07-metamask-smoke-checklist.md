# Two-profile MetaMask smoke test (H to run; ~15 min)

**Purpose:** prove the real injected-wallet path that automated tests can't: real MetaMask prompts, real network switching, two independent sessions. **Nothing here broadcasts a transaction or spends gas.** Every wallet action is a signature or a network switch. If MetaMask ever shows a *transaction* (gas fee, "Confirm" with a network fee), **Reject** and note the step.

## 0. Setup

- [ ] Server running the integrated main build with real handlers. `VESTIGE_AUTH_URI` must equal the exact origin you open (e.g. `http://localhost:3200`). World staging RP config must be set and `RELAYER_ENABLED=false`.
- [ ] Two **separate Chrome profiles** (not two windows of one profile): **A** = founder 1, **B** = founder 2. Each has MetaMask with **its own account**. Use test-only accounts with no mainnet funds.
- [ ] In both MetaMasks: Settings → Advanced → **Show test networks** on. Start each on **Ethereum Mainnet** so the switch prompt is exercised.
- [ ] Record in the table at the end: origin, build SHA (`git rev-parse --short HEAD` on main), MetaMask version, and A/B addresses (first 6 and last 4 only).

## 1. Connect and sign in (A, then B)

- [ ] **A:** top right, *Connect wallet* → MetaMask *Connect*. The header shows A's short address. The app must **not** ask to sign yet.
- [ ] **A:** *Sign in wallet*. MetaMask shows a **message signature** (not a transaction). It names the origin and domain, includes a nonce, and its chain ID is 11155111. Sign it; the header shows signed in.
- [ ] **A:** reject the sign-in once first. The app shows "You declined the … in your wallet. Nothing changed.", stays signed out, and lets you retry.
- [ ] **B:** repeat both steps in profile B. Confirm B's address differs from A's.
- [ ] **A:** reload the page. The session is memory-only, so A must **sign in again** (expected, not a bug). It must never be signed in silently as someone else.

## 2. Create, invite, join (NC4)

- [ ] **A:** *Create a venture*, with a unique slug such as `smoke-<hhmm>`. The workspace opens and the banner reads "not legally incorporated". The seat list shows A as seat 1, "Not verified".
- [ ] **A:** create an invite and copy the link.
- [ ] **B:** open the invite link. B must be signed in as B; if prompted, sign in. *Join*. Both A and B see two seats after refreshing the workspace.
- [ ] **A:** try opening the same invite link again while signed in as A. It is refused (already a founder, or invite used). No second seat for A.

## 3. World staging (NC1)

- [ ] **A:** *Verify with World ID*. Complete it with the World staging simulator. The page then shows **"Verified in World staging — TESTED IN SIMULATOR"**, and A's seat shows **HUMAN_VERIFIED + TESTED IN SIMULATOR** (amber tag, never plain green). The Founders stat reads "1 / 2 verified · TESTED IN SIMULATOR".
- [ ] **B:** *Verify with World ID* using the **same simulator identity**. It is refused as **duplicate human**. B's seat stays not verified and `humansVerified` stays 1.
- [ ] (Optional, only if H ran the CR-ID-06 operator override for B.) After refresh B's seat shows **SELF_REPORTED + DEMO OVERRIDE · NOT WORLD-VERIFIED**, and the Founders stat appends "· 1 demo override". It must **never** show HUMAN_VERIFIED for B.

## 4. Terms and network switching

- [ ] **A:** open Terms and draft them. Both A and B see the **same docHash**: compare the first and last 6 characters on each screen.
- [ ] **A** (wallet still on Mainnet): click *Sign terms*. MetaMask asks to **switch network to Sepolia**. **Reject** the switch first. The app shows an actionable "switch to Sepolia" message, no signature is requested, and the button still works.
- [ ] **A:** *Sign terms* again and **approve** the switch. MetaMask shows **typed data** (EIP-712) with domain `vestige`, version `1`, chainId `11155111` and the same docHash. Sign. A's signature appears for the current version.
- [ ] **B:** if B is World-verified or override: sign the same way. Terms show "signed by both". If B is not verified, the sign button is disabled with "Verify you're a unique human first."
- [ ] **A:** edit one term and save. The version increments and **both signatures reset** to 0 for the new version.

## 5. Treasury (no broadcast)

- [ ] **A:** Treasury tab. Without a reviewed manifest it shows no active treasury. *Request deployment* (if enabled) results in "Deployment requested — waiting for operator approval". MetaMask must **not** open.
- [ ] If any screen asks to switch to **Whitechain (1874)**, MetaMask should show *Add network* with chain ID 1874 and RPC `rpc.testnet.whitechain.io`. Approve the add and switch; **reject** any transaction.
- [ ] *Funding link* is shown. Opening `/funder/<ensName>` in profile B as a funder must not request a signature until you click fund. **Do not fund** (PENDING X).

## 6. Public page (NC3), no wallet needed

- [ ] Open a profile without a connected wallet (or a guest window) at `/v/northstar.vestige.eth`.
- [ ] Step 1 shows resolver `0x17cb…9C08` Verified, `vestige.ventureId 0xe68b1b43…cc93e3ff`, `vestige.status workspace`, `vestige.humans 1`. The treasury link reads "No treasury published yet" (not ACTIVE).
- [ ] Section 3 shows founder `aman` as **HUMAN_VERIFIED · TESTED IN SIMULATOR**, and `ravi` as not verified or **DEMO OVERRIDE**. Nothing is green-verified for ravi.
- [ ] Open `/v/<your smoke slug>.vestige.eth`. ENS reads **not registered** (new names need an H-approved plan), and the page never claims ACTIVE.

## 7. Sign out

- [ ] **A** and **B:** *Sign out & forget wallet*. Reloading shows signed out. MetaMask *Connected sites* still lists the origin (expected); revoke it there if desired.

## Record

| Field | Value |
|---|---|
| Origin / build SHA | |
| MetaMask version | |
| A address (0x1234…abcd) | |
| B address | |
| Smoke venture ventureId | |
| Steps failed (number + screenshot path) | |
| Any unexpected transaction prompt? (must be "no") | |
