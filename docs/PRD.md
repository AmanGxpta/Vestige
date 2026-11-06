# DayZero: PRD (ETHGlobal Mumbai, Nov 5–7 2026)

**Status:** v1.2 hackathon cut, Fri Nov 6 2026.
- v1.1 added go-to-market (§16).
- v1.2 moves the treasury to **Whitechain**, adds a gasless relayer and DayZero's own contracts, and targets Whitechain Scale.

This replaces Corridor as the weekend build, unless the Corridor contracts already pass their failing-path tests on-chain.

**Submission deadline:** Sat Nov 7, 09:00 IST. **Submit by 08:00.**

**Chains (two, each doing one job):**
- **Identity: Ethereum Sepolia (11155111).** ENSv2 requires Sepolia or mainnet.
- **Money: Whitechain Sepolia (1874).** The Safe treasury, test USDT, gasless for every user.
- **The link between them:** ENS records point to the Whitechain treasury through ENSIP-11 multichain addresses (coin type `0x80000000 | 1874` = `2147485522`).

**Verified on 2026-11-06 via `eth_getCode` on `https://rpc.testnet.whitechain.io`.** These contracts are deployed on Whitechain Sepolia at their standard addresses:

| Contract | Address |
|---|---|
| Safe v1.4.1 L2 singleton | `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` |
| Safe v1.4.1 ProxyFactory | `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` |
| Safe v1.3.0 L2 singleton | `0x3E5c63644E683549055b9Be8653de26E0B4CD36E` |
| Safe v1.3.0 ProxyFactory | `0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2` |
| Safe v1.3.0 MultiSend | `0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761` |
| Safe v1.3.0 FallbackHandler | `0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4` |
| Safe singleton factory | `0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Test USDT | `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` (EIP-2612 and EIP-3009 support, per the Corridor PRD) |

**Parent document:** "Product Requirements Document — DayZero" v1.0, the long-term vision. This document is the slice we build this weekend. Where the two disagree, this one wins until Saturday.

---

## 1. One-liner
**Know who you're funding, from day zero.** Funders put money into teams before those teams have a company. DayZero gives every early team a verifiable identity: named founders who are distinct, real humans, signed founding terms, and a stablecoin treasury that no single founder can drain. The funder can check all of it without asking anyone.

**Pitch line:** *A 2-of-2 treasury means nothing if one person holds both keys. DayZero proves the founders are two real people, binds them to signed terms, and lets every funder verify it. Nobody touches gas or a seed phrase.*

**Closing line:** *"Your company starts when you start building."*

## 2. Why this shape wins this weekend
| What the room rewards (bear market) | How DayZero answers it |
|---|---|
| "Who are your users and how do you reach them?" | **The customer is in the room.** Every sponsor runs a builder, grant or ecosystem program that funds teams before they incorporate, including the Whitechain Builders Program. One program signs up a whole cohort. We also have a distribution partner, Hercules Ventures (§16). |
| Real usage, not simulated value | The value *is* what's on-chain: unique-human founders, signed terms, an enforced USDT treasury. Nothing that matters is simulated. |
| Traction | We onboard **real hackathon teams at the venue** during the event. "N teams formed on DayZero this weekend" goes on the submission page. |
| Low regulatory drag | It's non-custodial software and records, with no custody, FX or money transmission by us. The only legal work is honest labelling ("not legally incorporated"). |
| No crypto steps for users | Founders and funders sign messages only. Our relayer pays all Whitechain gas. |

## 3. The core insight (the WOW)
Multisig governance assumes the signers are different people. Nobody checks that. One founder with two wallets can form a "2-of-2" team, take a grant and walk away.

**DayZero closes that gap, both off-chain and on-chain:**
- Every founder seat requires a World ID proof-of-human, with the nullifier scoped to the venture. **The same human can't take two seats in one venture.**
- A DayZero **Safe Guard** on Whitechain refuses any owner change to a wallet that isn't a verified seat. The "two humans" rule can't be bypassed later by quietly swapping a key.

**WOW moments, in order:**
1. The same human tries to be both founders, and is **refused**.
2. One founder tries to move grant money alone, and the **Safe rejects it on-chain**.
3. The funder opens `northstar.dayzero.eth` and sees verified humans, the signed agreement hash, and a treasury on Whitechain with its USDT activity, **without needing an account, and without anyone in the demo holding gas.**

## 4. Users and roles (weekend)
| Role | Persona | In the demo |
|---|---|---|
| **Funder (buyer)** | Program manager at a grant, ecosystem or accelerator program, or an early-stage fund | Browses ventures, sees verification status, funds a venture treasury with USDT (gasless), reads its evidence page |
| **Founder A** | Creates the venture | Creates the venture, verifies as human, drafts and signs terms, proposes a payment |
| **Founder B** | Co-founder | Joins by invite, verifies as human, signs terms, approves the payment |
| **Vendor / payee** | A contractor the team pays | Receives USDT; the explorer link is shown |
| **Public verifier** | Anyone (investor, judge) | Opens the venture's ENS name or share link and checks the evidence |
| **Relayer** | DayZero backend | Pays all Whitechain gas; can't move funds on its own |

## 5. Demo flow (2–4 minutes; Whitechain requires each party to be shown)
1. **Problem (0:00–0:15).** "Programs fund teams before they're companies. Those teams can't open a joint bank account, and funders can't tell who's actually behind a team, or who controls the money."
2. **Create the venture (0:15–0:40).** Founder A creates **Northstar Labs**. DayZero issues `northstar.dayzero.eth` (ENSv2 subname on Sepolia) and invites Founder B. The screen shows **"Workspace — not legally incorporated"**.
3. **Prove the humans (0:40–1:10).** Each founder verifies with World ID (IDKit, Proof of Human), and each gets a founder subname. **Denied path:** the same World ID tries to take the second seat and is refused, with "This human already holds a seat in Northstar Labs."
4. **Sign terms (1:10–1:35).** Both founders sign the same agreement version (EIP-712). We change one word: the hash changes and the old signatures no longer apply. The agreement hash is written to the venture's ENS text record.
5. **Fund and govern on Whitechain (1:35–2:40).**
   - DayZero deploys a 2-of-2 Safe on Whitechain with the DayZero Guard attached. Owners and threshold are read back from the chain, and the ENS record now points to the treasury (ENSIP-11).
   - **The funder deposits 1,000 USDT by signing one message** (EIP-3009 `transferWithAuthorization`). The relayer submits it, and the funder never holds WBT.
   - Founder A proposes paying a contractor 500 USDT and signs the Safe transaction (an off-chain EIP-712 signature).
   - **Founder A tries to execute alone:** the relayer refuses, and a direct on-chain attempt **reverts in the Safe (GS020)**. The explorer link is shown.
   - Founder B signs. The relayer executes, the contractor receives 500 USDT (explorer link), and the timeline updates from chain data.
6. **Verify (2:40–3:20).** The funder or a judge opens the public evidence page by ENS name. It shows two verified-unique founders, signatures on agreement v2, and the Whitechain treasury address, threshold, Guard and USDT transactions with explorer links. Each item has a label: `CHAIN_VERIFIED`, `SIGNED`, `HUMAN_VERIFIED` or `SELF_REPORTED`. No private agreement text is shown.
7. **Traction and close (3:20–3:40).** "N real teams formed on DayZero this weekend. X programs want it." Then the closing line.

## 6. Functional requirements

### FR-1: Venture and ENSv2 identity, on Sepolia (target prize: ENS "Best Use of ENSv2")
- On creation, register `<venture>.dayzero.eth` under our parent name on Sepolia ENSv2, using our own **subname registry** built on the Permissioned Registry.
- Founder subnames `<founder>.<venture>.dayzero.eth` are **non-transferable** and **revocable only by venture governance**, not by DayZero.
- **Enhanced Access Control** roles: each founder can edit only their own founder subname's text records. Venture records are writable by the DayZero registrar until handover. The stretch goal hands control to the venture's governance.
- **Records:**
  - `addr(node, 2147485522)` = the Whitechain Safe address (ENSIP-11)
  - `dayzero.agreement` = current signed version hash
  - `dayzero.status` = `workspace` (never `incorporated`)
  - `dayzero.humans` = number of verified founders
  - `dayzero.guard` = the Guard address on Whitechain
- The evidence page **resolves everything from ENS, then reads Whitechain directly**, not from our database. This is what makes ENSv2 central, not cosmetic: the name is the venture's cross-chain identity.
- **Must be true:** nothing is hard-coded; the demo creates a fresh venture live.
- ⚠️ **Verify at the ENS booth first thing:**
  - the ENSv2 Sepolia contract addresses
  - the Permissioned Registry and Resolver deployment flow
  - that the resolver supports multichain `addr` (ENSIP-11)
  - that Enhanced Access Control role grants work as planned

  If the subname registry won't deploy within 2 hours, fall back to a Permissioned Resolver on a name we own and set records directly. Don't drop ENS.

### FR-2: Unique-human founders (target prize: World "Best Use of IDKit")
- IDKit with the **Proof of Human** credential. **Why this is the minimum sufficient assurance:** a 2-of-2 needs *distinct humans*, not legal identity. A passport would collect more personal data than we need.
- Action ID: `dayzero-founder-seat:<ventureId>`. The signal is the founder's wallet address, so the proof is bound to that wallet.
- **Verify the proof on our backend**, and never trust the client's response. Store the nullifier hash for each venture. A duplicate nullifier in the same venture is refused.
- After verification, the backend's **attester key** writes the seat to the `SeatRegistry` on Whitechain (FR-7). This is a trust assumption, stated in the README: World's on-chain verifier isn't available on Whitechain, so we attest.
- The same human *can* found different ventures; uniqueness applies per venture.
- **The alternative path we must demo:** a duplicate human is refused and the seat stays empty. Also handle a cancelled verification gracefully.
- Deliverable: `WORLD_FEEDBACK.md` covering time to first success, friction, missing documentation and the single biggest improvement.

### FR-3: Founding agreement
- **Minimal template:** contributions, roles, proposed ownership split, vesting intent, decision rule, effective date. It renders as one page with a visible legal disclaimer.
- Canonical JSON leads to `keccak256`, which gives the version hash. Any edit creates a new version and invalidates pending signatures.
- EIP-712 domain `{name: "DayZero", version: "1", chainId: 11155111}`. Type `FoundingTerms{ventureId, agreementId, version, docHash, nonce, expiry}`.
- Server checks: the signer is a verified founder of that venture, the domain and chain match, the nonce hasn't been used, and the signature hasn't expired.
- When all founders have signed, the hash is written to `dayzero.agreement` on ENS.
- The full agreement text stays off-chain. Only the hash is public.

### FR-4: Treasury on Whitechain (Safe 2-of-2, test USDT)
- Deploy a Safe **v1.4.1 L2** proxy on Whitechain Sepolia, using the canonical addresses verified above, with the two founder wallets as owners and a threshold of 2. **We don't write our own multisig.**
- Safe Protocol Kit probably doesn't list chain 1874. Pass `contractNetworks` explicitly with the addresses in the header, and pin the SDK version.
- Attach the **DayZero Guard** (FR-7) at setup.
- Show "Active" only after reading owners, threshold and guard **back from the chain**.
- The treasury token is **Whitechain test USDT** (`0xcedf…55a7`). A permanent banner reads `TESTNET — NOT REAL MONEY`.
- Payment proposal: recipient, amount, reason. Each founder signs the Safe transaction hash off-chain (EIP-712). States: `AWAITING_APPROVALS → READY → EXECUTED`, or `FAILED`.
- **The demo must show** a 1-of-2 execution attempt sent straight to the Safe on-chain, reverting with GS020, with the explorer link. This uses a pre-funded test wallet, because the relayer would refuse it first. The UI must not just block it.

### FR-5: Evidence timeline and public page
- Events: venture created, founder verified (human), seat attested on Whitechain, agreement version created or signed, Safe deployed, deposit, proposal, approval, rejected attempt, execution.
- Every event carries a verification label: `HUMAN_VERIFIED` (World), `SIGNED` (EIP-712), `CHAIN_VERIFIED` (a transaction receipt on Sepolia or Whitechain) or `SELF_REPORTED`.
- Public page at `/v/<ensname>`: it **resolves ENS on Sepolia, then reads the Safe, Guard, SeatRegistry and USDT on Whitechain**, and joins the World and signature evidence from our API. Agreement text, emails and real names aren't shown.
- A failed or rejected attempt is shown as a failure, never as a payment.

### FR-6: Funder view
- A list of ventures with badges: humans verified (2/2), terms signed, treasury active (Whitechain), USDT funded.
- "Fund this team" resolves the Safe from ENS (ENSIP-11). The funder signs a USDT `transferWithAuthorization` to it, and the relayer submits it. **The funder never needs WBT.**
- This view sells to the buyer, so it must look like a tool a program manager or fund associate would use.

### FR-7: DayZero contracts on Whitechain (ours, verified on the Whitechain explorer)
Written in Solidity with Foundry, with failing-first tests for every MUST-revert rule.

```solidity
// SeatRegistry: which wallets are verified-human seats of which venture
attestSeat(bytes32 ventureId, address wallet, bytes32 nullifierHash)   // attester only; reverts on a reused nullifier within a venture
revokeSeat(bytes32 ventureId, address wallet)                          // attester only (founder departure flow, P1)
isSeat(bytes32 ventureId, address wallet) view returns (bool)
event SeatAttested(bytes32 indexed ventureId, address indexed wallet, bytes32 nullifierHash)

// DayZeroGuard: a Safe Guard (ITransactionGuard), with each Safe bound to its ventureId at setup
checkTransaction(...)   // when the Safe calls itself with addOwnerWithThreshold / swapOwner:
                        //   require(registry.isSeat(ventureId, newOwner))
                        // block delegatecall except to the allowlisted MultiSend
                        // block setGuard(0) (removing the guard), so the rule can't be switched off without a new venture
checkAfterExecution(...) // no-op
// MUST revert: an owner change to a non-seat wallet · a reused nullifier · attestSeat by a non-attester · removing the guard
```
- **Why it matters:** the "two humans" rule is **enforced in the treasury contract**, not just in our database. This also meets Whitechain's requirement that contracts be deployed and verified on Whitechain.

### FR-8: Gasless relayer (target prize: Whitechain "Scale: Payments Nobody Notices")
- Submits exactly two kinds of call, and nothing else:
  1. USDT `transferWithAuthorization` / `receiveWithAuthorization`, where the recipient is a **DayZero-registered Safe**
  2. `Safe.execTransaction`, on DayZero-registered Safes only
- **How it can't be drained** (the brief requires this answer):
  - It only relays calls whose fund movement has **already been authorised** by the payer's signature, or by threshold Safe signatures.
  - It **simulates every call (`eth_call`) before sending** and drops anything that would revert. A 1-of-2 attempt never costs us gas.
  - A function allowlist, contract allowlist, per-venture and per-address rate limits, a daily gas budget cap, and an alert when the gas wallet runs low.
  - Its gas wallet is separate from all user funds and holds only faucet WBT.
- **Where its WBT comes from:** the Whitechain faucet for the hackathon. In production, a per-venture gas allowance paid by the funder program as part of the subscription.
- **Payer flow with zero visible crypto steps:** a wallet signature prompt in plain language ("Approve sending 1,000 USDT to Northstar Labs' treasury"). There's no network switch, no gas and no WBT.

## 7. Architecture (weekend)
```
Next.js app (founder, funder and public views)
  ├─ wagmi/viem + RainbowKit (signatures only on Whitechain; ENS writes go through the backend registrar)
  ├─ IDKit widget ──▶ API /verify-human ──▶ store nullifier ──▶ attestSeat() on Whitechain
  ├─ Safe Protocol Kit (contractNetworks for 1874): build and sign Safe transactions off-chain
  └─ viem public clients: Sepolia (ENS resolve) + Whitechain (Safe, Guard, SeatRegistry, USDT)
API (Next.js route handlers) + SQLite/Postgres
  ├─ ventures, seats(nullifier), agreement_versions, signatures, safe_tx_signatures, events
  ├─ registrar key (Sepolia): creates ENSv2 subnames and sets records
  ├─ attester key (Whitechain): SeatRegistry.attestSeat only
  └─ relayer (Whitechain gas wallet): simulate, then submit allowlisted calls (FR-8)
Ethereum Sepolia: ENSv2 registry and resolver (identity; ENSIP-11 addr → Whitechain Safe)
Whitechain Sepolia: Safe v1.4.1 L2 + DayZeroGuard + SeatRegistry + test USDT (money)
```
**Security rules:**
- The backend never holds founder keys.
- The relayer, registrar and attester are three separate keys, each with the narrowest possible role. None of them can move treasury funds.
- Nonces and nullifiers have unique indexes.

## 8. Prize targeting
| Prize | Pool | Why we fit | Required items |
|---|---|---|---|
| **ENS: Best Use of ENSv2** (primary) | $7k (4 places) | A venture as a namespace: our own subname registry, non-transferable founder subnames, records controlled through Enhanced Access Control, and the name as the venture's **cross-chain identity** (ENSIP-11 pointing to the Whitechain treasury) | ENSv2 on Sepolia, central to the product, no hard-coded values, a live demo link, open source |
| **Whitechain: Scale · Payments Nobody Notices** | $3k ($2k / $1k) | The funder and founders pay in USDT without WBT, seed phrases or knowing the chain. The relayer is drain-resistant and its gas source is explained. | Verified contracts on 1874 (SeatRegistry, Guard); a USDT payment in the main flow with an explorer link in the README; the README "why on-chain" line; steady commits; a 2–4 minute video showing every party; `WHITECHAIN_FEEDBACK.md` |
| **World: Best Use of IDKit** | $2.5k (2 × $1,250) | A real trust moment (who holds a seat), the minimum sufficient credential (Proof of Human), a server-verified nullifier per venture, **enforced on-chain by the Guard** | Successful plus alternative path, backend verification, feedback debrief |
| **ETHGlobal Finalist** | $1k per person plus $500 travel (3–5 people) | Technicality, originality, practicality, usability, WOW | Strong demo and real traction |

If ETHGlobal limits how many partner prizes we can choose, pick these three: **ENS, Whitechain and World**.

**Considered and not targeted:**
- *Whitechain Operate:* excludes "payroll, escrow and revenue splits on their own", and we have no merchant checkout.
- *Whitechain Tokenize:* we don't model an RWA.
- *World Agent Pass:* only if the AI payment-drafting stretch ships.
- *EF CROPS, Arc, Hedera:* roadmap only.

## 9. Scope
**In:**
- FR-1 to FR-8
- a fresh venture created live
- real Sepolia (ENS) and Whitechain (USDT, Safe) transactions
- the public evidence page
- real teams onboarded

**Stretch, in order, after G3:**
1. **Live demo of the Guard:** an attempted `swapOwner` to an unverified wallet reverts on-chain.
2. **Handover:** venture ENS records move from the registrar to venture governance, with the agreement hash anchored by a 2-of-2 action.
3. **AI drafting:** an AI agent drafts a payment proposal, and a World ID Agent Pass human approval is required before it's queued.
4. A shareable snapshot with an expiry date.

**Cut (from the vision PRD):**
- Email auth (wallet only)
- Invite expiry and revocation (single-use link only)
- Encrypted document storage
- Lawyer templates
- Incorporation checklist
- Read-only Q&A
- Re-org handling beyond waiting for confirmation
- Chains beyond these two
- Any token or equity issuance

## 10. Build gates (deadline Sat 09:00 IST)
| Gate | Must be true | Target |
|---|---|---|
| G0 | ENS booth confirms the ENSv2 Sepolia path and ENSIP-11 support. World app ID and simulator are working. Parent name registered. Faucet WBT and USDT in the relayer and demo wallets. Safe Protocol Kit deploys a test Safe on 1874 using `contractNetworks`. | Immediately (about 2 hours) |
| G1 | SeatRegistry and Guard tests pass, and both are **deployed and verified on Whitechain**. Venture create, ENS subname and records. IDKit verify with the duplicate refused, then `attestSeat` on-chain. | +5 hours |
| G2 | Agreement sign, verify, re-version. Safe deployed on Whitechain with the Guard. Relayer working. Gasless USDT deposit, gasless 2-of-2 execution, and a 1-of-2 revert on-chain. Timeline. | +5 hours |
| G3 | Funder view and public page resolved from ENS and reading Whitechain. Demo steps 1–7 recordable end to end. **Onboard real teams now.** | **Sat 02:00 at the latest** |
| G4 | Stretch goals 1 → 2 → 3 | 02:00–04:30 |
| G5 | README (why on-chain, explorer links, the relayer's drain protection, current limits), architecture diagram, `WORLD_FEEDBACK.md`, `WHITECHAIN_FEEDBACK.md`, ENS write-up, video | 04:30–07:30 |
| Submit | Submitted with buffer | **By 08:00** |

**Commit steadily** from the start (Whitechain checks this). Push after each sub-task, not in one upload at the end.

**Order to cut if behind:**
1. Stretch goals.
2. Agreement re-versioning polish.
3. The funder list (keep the "Fund" button on the venture page).
4. **If the relayer is still broken at G2+2h**, founders pay gas with faucet WBT. This drops the Scale prize but keeps the Safe and USDT on Whitechain.
5. **If Safe on 1874 is blocked at G0**, move the treasury to Sepolia and drop Whitechain entirely.

**Never cut:**
- The duplicate-human refusal.
- The on-chain 1-of-2 revert.
- ENS-resolved public evidence.
- A fresh venture created live.

## 11. Traction plan (runs alongside the build, owned by one person)
1. **From G1 on:** walk the venue and onboard teams. Pitch: "Take 3 minutes to get your team a verified name and a 2-of-2 USDT treasury for your prize money, with no gas needed." The goal is **5 or more real teams**, each with 2+ verified founders. Record venture ENS names; that's the proof.
2. **Ask sponsors who run builder programs.** **Start with the Whitechain Builders Program** (mainnet launches this month, and their teams would hold treasuries on Whitechain), then the 0G Builder Hub and ETHGlobal itself. Ask: "Would you require this from teams you fund?" Get **one named quote or written intent** from a program *other than* Hercules (see §16.6).
3. **The Hercules partner's weekend asks:** see §16.3, Phase 0.
4. Put both numbers on the submission page and in the last 10 seconds of the video.

## 12. README "why on-chain"
1. **A team that hasn't incorporated can't open a joint bank account.** A stablecoin treasury on Whitechain with a code-enforced 2-of-2 is the only shared treasury such a team can hold. A funder anywhere can pay into it in minutes, and neither founder can take the money alone. A regular payment rail can't do this for a team with no company.
2. A funder can verify the treasury rule (2 distinct humans, both required, enforced by the Guard) from the chain and ENS without trusting DayZero.
3. The venture's identity, signed terms and treasury are bound to one name that outlives our app and our database.

## 13. Q&A prep (own these answers)
- **"Why would a funder require this?"** Programs fund teams before incorporation, with no entity, no verified signers and no record of who controls the money. Give the independent sponsor quote from §11.
- **"Isn't this just a Safe?"** The Safe enforces "2 keys". DayZero enforces "2 *humans*", in the Guard on-chain and not just in our database. It binds them to signed terms and makes it publicly verifiable under one name. A Safe alone can't tell one person with two wallets from two people.
- **"Why two chains?"** Identity lives where ENS lives (Ethereum). Money lives where stablecoin payments are cheap and native (Whitechain). ENSIP-11 links them, so the name is the single entry point.
- **"Who can drain your relayer?"** Nobody. It only submits calls already authorised by the payer's or the threshold's signatures, simulates every call first, and is limited by allowlists, rate limits and a budget cap (FR-8).
- **"Do you trust your own attester?"** Yes, and we say so: it's a stated trust assumption for the weekend, because World's on-chain verifier isn't on Whitechain. Next step: verify proofs on-chain where supported, or have programs co-attest.
- **"Is this a legal company?"** No. Every screen says so, and the `dayzero.status` record can never be `incorporated`.
- **"Privacy?"** Only hashes, nullifier hashes, a seat count and treasury activity are public. The agreement text and identities stay off-chain. Proof of Human reveals no identity.
- **"Proof-of-human limits?"** World ID shows uniqueness, not honesty or competence. We label evidence; we don't score founders.
- **"Business model?"** Programs and funds pay per cohort or per seat, through a dashboard, verified milestone reporting and a sponsored gas allowance. It's free for founders. Later: diligence exports for investors.
- **"Bear market?"** Grant and ecosystem programs are still paying out, and funds are writing fewer, more careful cheques. Both are under pressure to prove where the money went. That's our buyer.
- **"You work at a VC. Isn't this a deal-flow funnel for your fund?"** No. Founders own their records and choose who sees them. Hercules gets the same view as any other funder, the evidence format is open, and the relationship is disclosed. See §16.6.

## 14. Risks for the weekend
| Risk | Mitigation |
|---|---|
| ENSv2 Sepolia tooling is immature or undocumented, or ENSIP-11 isn't supported on the v2 resolver | G0 booth check. Fallback: a Permissioned Resolver on an owned name, or a `dayzero.treasury` text record as `eip155:1874:<addr>`. Log every bit of friction for the write-up. |
| Safe Protocol Kit doesn't know chain 1874 | The contracts are verified present. Pass `contractNetworks` explicitly. Test the deployment at G0. |
| The relayer takes longer than planned | Simulate first, then send. Start with `execTransaction` only, and add USDT authorisation second. Use the cut order in §10. |
| Two chains add to integration time | Keep each chain to one job. Don't move anything from one to the other except reads. |
| IDKit staging or simulator problems | Set up the World ID Simulator in the first hour. Keep the backend verification path tested. |
| Real teams don't sign up | Start at G1, not at the end. Even 3 teams beats zero. |
| Scope creep from the vision PRD | §9 cut list. Anything not in demo steps 1–7 waits until after G3. |

## 15. After the hackathon (where the vision PRD takes over)
1. **Pilot with 1–2 builder or grant programs** on a real cohort. The Whitechain Builders Program is the first target, timed to their mainnet launch. Measure the share of teams completing signed terms and a governed payment within 7 days.
2. Founder interviews (hypotheses H1–H5 in the vision PRD).
3. Whitechain mainnet after a security review of the Guard, SeatRegistry and relayer. Milestone attestations from programs. Diligence exports for investors.
4. Later: an incorporation hand-off with one licensed provider in one jurisdiction.

---

## 16. Go-to-market

> **Everything in this section is a hypothesis.** It assumes the Hercules Ventures partner is willing to make the introductions described. None of the ecosystem relationships below has been confirmed. Treat each one as a test with an owner and a result, not as an asset we already have.

### 16.1 The unfair advantage, and its limit
We're building DayZero from inside **Hercules Ventures**, a web3 venture fund. That gives us three things most hackathon teams don't have:
1. **A first funder-customer:** a fund that writes early cheques into exactly the teams DayZero serves.
2. **A network of other funds and programs**, through the partner, for co-funders, syndicate partners and grant programs.
3. **Warm paths to the teams behind the technologies we build on** (ENS, World, Safe, Whitechain), so ecosystem co-promotion is plausible rather than cold outreach.

**The limit:** a VC-built tool for vetting founders can look like a deal-flow funnel. If founders or other funds believe that, it kills adoption. Neutrality isn't optional; it's part of the product (§16.6).

### 16.2 Who we sell to, and what each side gets
| Audience | Role in GTM | What they get | What we ask for |
|---|---|---|---|
| **Hercules Ventures** | Design partner and first funder-customer | Cleaner pre-seed diligence; a portfolio hygiene standard (who controls the money, signed founder terms) | Use DayZero on its live pipeline; introductions; feedback on the funder view |
| **Other funds and syndicates** (partner's network) | Second-wave buyers; makes the evidence page a shared diligence norm | One standard evidence page per team instead of custom diligence calls | Accept a DayZero evidence page in their intake; co-sign a "verified team" standard |
| **Grant, ecosystem and builder programs** (Whitechain Builders first) | The cohort buyer (one deal brings many teams) | Proof of who they funded and where grant money went; for Whitechain, real USDT treasuries on their new mainnet | A paid or free cohort pilot; require DayZero for one funding round |
| **Technology teams** (ENS, World, Safe, Whitechain) | Ecosystem amplifiers | A flagship real-world use of their newest products: ENSv2 namespaces as cross-chain venture identity; World Proof of Human for a concrete trust moment; Safe as the standard early-team treasury; Whitechain as the money layer for early teams | A case study, a showcase or docs listing, posts to their community, introductions to their grantees, an ecosystem grant |
| **Founders** | End users (free) | A verified team identity, signed terms, a safe gasless treasury, a stronger fundraising signal | Create a venture; share their evidence page when raising |

### 16.3 Phases

**Phase 0: this weekend (Nov 6–7)**
- The partner posts or forwards one message to their network: *"We're building DayZero at ETHGlobal Mumbai. Verified teams from day zero. Want your program's teams on it?"* The goal is **2–3 funds or programs replying "interested"** before submission.
- The partner sends warm introductions to the ENS, World and Whitechain DevRel or founders: "Our team is building a flagship use case across ENSv2, World and Whitechain. Can we get 15 minutes at the booth or a call next week?" Showing up through a fund's introduction turns a hackathon booth chat into a partnership conversation.
- On-site: onboard 5+ real teams (§11). Get at least one **independent** program quote, ideally from the Whitechain Builders Program.
- Submission: name Hercules as the design partner, disclose the relationship, and show the "interested" count.

**Phase 1: weeks 1–4 after the hackathon (design partners)**
- **Hercules dogfoods it:** every pre-seed team in the active pipeline is *offered* (not required) a DayZero venture. Measure completion and whether the evidence page changed the time or quality of diligence.
- **2–3 program pilots**, sourced through the partner and the sponsors met at Mumbai. The Whitechain Builders cohort is timed to their mainnet launch. One cohort each, with signed terms plus one governed payment as the success event.
- **Ecosystem co-marketing:** a joint case study with ENS ("Every venture is a namespace"), with World ("Two humans, not two keys") and with Whitechain ("The treasury for teams that aren't companies yet"). Ask for a slot in their showcase or docs and a post to their developer community.
- **Apply for ecosystem grants** (ENS, World, Safe, Whitechain Builders) to fund the security review and the mainnet move.

**Phase 2: months 2–3 (make it a norm)**
- **"DayZero Verified" as a diligence norm:** 3–5 funds from the partner's network agree to accept the evidence page as part of intake. A shared norm across several funds is what makes founders come on their own.
- **Hackathon channel:** a DayZero side quest or booth at the next ETHGlobal events: "Form your team on DayZero and get your prize money into a verified 2-of-2." Hackathons are where teams form, so this repeats every few weeks.
- **Content:** a monthly public "verified teams" leaderboard and a write-up of anonymised pilot data, such as how often single-key "multisigs" were found.

**Phase 3: month 3 onward (fundraising)**
- Raise a pre-seed through the partner's network on pilot data: the number of programs, verified ventures, USDT under governance and repeat governed payments.
- **Decide on Hercules's role before raising:** whether it's an investor, an incubator or arm's length. It affects cap-table neutrality and whether other funds will trust the product (§16.6).

### 16.4 Channels, owners and success metrics
| Channel | Owner | 30-day metric | Kill or rethink signal |
|---|---|---|---|
| Hercules pipeline dogfood | Founder + partner | ≥ 10 ventures created, ≥ 5 with signed terms and a governed payment | Founders do it once only because the fund asked, and never return |
| Partner's fund and program introductions | Partner → founder | ≥ 2 signed pilots (one being Whitechain Builders) | Interest but nobody will require it for funding |
| ENS / World / Safe / Whitechain co-promotion | Founder (with partner's intro) | 1 published case study or showcase listing; 1 ecosystem grant application | No team will co-sign after a live demo |
| Hackathon side quest | Founder | ≥ 20 teams per event | Teams create the venture but don't move money through it |
| Founder word of mouth | n/a | ≥ 20% of new ventures arrive without a program or fund introduction | 0%, meaning it's only used when required |

**North star (unchanged from the vision PRD):** ventures that complete a verified joint commitment *and* at least one governed operational action.

### 16.5 Messaging by audience
- **Funds:** "Before you wire, know there are two real founders, signed terms, and a treasury neither can drain alone. One link, no diligence call."
- **Programs:** "Prove where your grant money went, and to whom, for every team in the cohort."
- **Technology teams:** "The first product where your new primitive (ENSv2 namespaces, Proof of Human, gasless USDT on Whitechain) is the load-bearing part, used by real teams and real funders."
- **Founders:** "Get your team's name, terms and treasury sorted in 10 minutes, with no gas or seed phrases, and raise with proof instead of promises."

### 16.6 Neutrality and conflict-of-interest guardrails (required)
1. **Founders own access.** Hercules, like any funder, sees only what a founder chooses to share. There's no special dashboard or back door, and we state that publicly.
2. **An open evidence format.** The evidence page and its schema (ENS records, EIP-712 types, labels, SeatRegistry events) are open source, so any fund can verify it without DayZero or Hercules.
3. **Disclosure.** Every pitch, the hackathon submission and the website state the Hercules relationship.
4. **No preferential deal flow.** Hercules gets no first look, no ranking and no automatic access to ventures created on DayZero.
5. **Ownership clarity, now.** Before submitting, confirm in writing with the partner who owns the hackathon IP and the future company (you, Hercules, or a spin-out), and check that it complies with ETHGlobal's rules and any employment terms.
6. **Independent proof.** At least one design partner must be independent of Hercules, or the traction story reads as an inside job.

### 16.7 GTM assumptions to test (a hypothesis list)
| # | Assumption | First test | When |
|---|---|---|---|
| G1 | The partner will actively make introductions to funds and programs | Phase 0 message is sent; count replies | This weekend |
| G2 | Funds will *accept* (not just like) an evidence page in intake | 3 funds asked to write it into their process | Weeks 1–4 |
| G3 | Programs will *require* it for at least one funding round | 1 program pilot with it as a requirement (Whitechain Builders first) | Weeks 1–4 |
| G4 | ENS, World and Whitechain will co-promote a third-party app | Case-study request after a demo call | Weeks 1–4 |
| G5 | Founders return without being told to | Second governed action within 14 days | Weeks 2–6 |
| G6 | Being VC-built doesn't deter founders | Ask in onboarding interviews; track drop-off | Ongoing |

---

**Founder note:** what wins this weekend is the same thing that has to be true for the company: *a funder chooses to require this.* Hercules gives us a head start on that sentence. Independent funders saying it is what makes it true. Spend at least as much effort getting it from people outside the fund as on the UI.
