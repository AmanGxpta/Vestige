<!--
  C2 DRAFT for H — root README.md is not C2-owned. Copy to /README.md after review.
  Every hash/address below was taken from committed receipt files (paths in "Evidence").
  Rows marked PENDING must be updated (or left PENDING) at submission — never filled from memory.
-->

# vestige

**Know who you're funding, from day zero.** vestige gives an unincorporated founding team one name
(`<team>.vestige.eth`) that binds:

- **two distinct humans** (World ID, one seat per human),
- **signed founding terms** (exact EIP-712 hash, both founders),
- **a 2-of-2 USDT treasury** on Whitechain that no single founder can move, enforced by a Guard that only accepts verified-human seats.

Anyone can check all three from ENS and the chain, without trusting vestige.

> A vestige venture is a team workspace with verifiable records. **It is not a company** and confers no legal rights. `vestige.status` can never be `incorporated`.

## Why on-chain

1. **A team that hasn't incorporated can't open a joint bank account.** A stablecoin treasury on Whitechain with a code-enforced 2-of-2 is the only shared treasury such a team can hold. A funder anywhere can pay into it in minutes, and neither founder can take the money alone. A regular payment rail can't do this for a team with no company.
2. **A funder can verify the rule themselves.** Two distinct humans, both required, enforced by the Guard: all of it reads from the chain and ENS, without trusting vestige.
3. **One name outlives our app.** The venture's identity, signed terms and treasury are bound to one name that outlives our app and our database.

## Architecture

```
                      ┌────────────────────────── Next.js app (one origin) ──────────────────────────┐
 founder / funder     │  UI (C2)                         API routes → shared root composition (H)     │
 MetaMask (EIP-1193)──┤  • founder workspace, terms,     ┌───────────────────┐  ┌──────────────────┐  │
 explicit chain       │    treasury, funder page         │ identity (C1)     │  │ treasury (X)     │  │
 switching            │  • public evidence /v/<name>     │ SIWE-style auth   │  │ Safe 1.4.1 + 2/2 │  │
                      │    reads ENS + Whitechain        │ ventures, invites │  │ VestigeGuard     │  │
                      │    directly in the browser       │ World ID 4.0      │  │ SeatRegistry     │  │
                      │                                  │ EIP-712 terms     │  │ EIP-3009 funding │  │
                      │                                  │ ENS plans (gated) │  │ relayer (gated)  │  │
                      │                                  └─────────┬─────────┘  └────────┬─────────┘  │
                      └────────────────────────────────────────────┼─────────────────────┼────────────┘
                                                                   │ SQLite (one file)   │
                Ethereum Sepolia 11155111  ◄── identity ───────────┘                     └── money ──►  Whitechain testnet 1874
                vestige.eth (ENSv2) → <team>.vestige.eth                                       Safe (2-of-2) + Guard + SeatRegistry
                text: vestige.ventureId / status / humans / agreement / guard                  official test USDT (6 dp)
                addr(coinType 2147485522) = Whitechain Safe (ENSIP-11)  ───────── links ──────────►
```

- **Identity lives where ENS lives** (Sepolia). **Money lives where stablecoin payments are cheap** (Whitechain 1874). ENSIP-11 coin type `2147485522` links the two, so the name is the single entry point.
- **Founders' keys never touch our backend.** Founders sign EIP-4361 sign-in, EIP-712 terms and Safe transactions in their own wallet. Registrar, attester and relayer keys are separate server roles. Every broadcast goes through a human-approved, digest-bound plan.
- **Fail-closed public page.** `/v/<name>` resolves the name with the Universal Resolver, reads `vestige.*` records, follows ENSIP-11 to the Safe, and checks owners, threshold, Guard binding, code hashes, modules, SeatRegistry and USDT against a **reviewed deployment manifest** (`public/manifests/<name>.json`). Without that manifest it never says ACTIVE.
- **Labels, not scores.** Every fact is labelled HUMAN_VERIFIED, SIGNED, CHAIN_VERIFIED or SELF_REPORTED. Staging World proofs carry **TESTED IN SIMULATOR**. Operator overrides carry **DEMO OVERRIDE · NOT WORLD-VERIFIED**.

## Live on-chain evidence

### Ethereum Sepolia (11155111): ENS identity

| What | Tx / address | Block |
|---|---|---|
| P1: `vestige.eth` parent registry deployed (VerifiableFactory proxy) | [`0x3a32aca8…e151`](https://sepolia.etherscan.io/tx/0x3a32aca8086f8c8bcc3d4026e98e5caea28cf921259d39e5d87d753c1b30e151) | 12079704 |
| P2: `vestige.eth` subregistry set to the parent | [`0x36a8f637…5bb7`](https://sepolia.etherscan.io/tx/0x36a8f637f1fded35601eb22c06e193a9653c0d5cb529ac064f101f3c6a655bb7) | 12079922 |
| V1: northstar venture registry deployed | [`0xa11e884a…623b`](https://sepolia.etherscan.io/tx/0xa11e884ab4131b8fcb129d5f7a12a1977bc113edff9aa34c9ff582d381f9623b) | 12080129 |
| V2: northstar venture resolver deployed | [`0x9af16690…af9b`](https://sepolia.etherscan.io/tx/0x9af16690cf3ab772c54a155e99db4a9e23e4d442ba1140b8288e19ede2f6af9b) | 12080131 |
| V3: `northstar.vestige.eth` registered | [`0x941bb725…3ab0`](https://sepolia.etherscan.io/tx/0x941bb725a2d7e7efddcc739cd7c62640d9e5e87d392fb91e9e4f490989173ab0) | 12080133 |
| Founder resolver for `aman.northstar.vestige.eth` deployed | [`0x0d9df8d5…fcdc`](https://sepolia.etherscan.io/tx/0x0d9df8d536db797952c0c01025bc9d85bf0840c64a3c04c7cdc722bdedfdfcdc) | 12080135 |
| `aman.northstar.vestige.eth` registered (non-transferable) | [`0x282286c7…028f`](https://sepolia.etherscan.io/tx/0x282286c7c1478b1ddeec7c43fe3a71d395f8329026888f6813e5b5b28114028f) | 12080137 |
| `vestige.eth` parent registry | [`0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73`](https://sepolia.etherscan.io/address/0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73) | — |
| northstar venture subregistry | [`0x0300FAE41e372C5c8BEF564F8348d4292FB36101`](https://sepolia.etherscan.io/address/0x0300FAE41e372C5c8BEF564F8348d4292FB36101) | — |
| northstar resolver (read by the public page) | [`0x17cb013B4E8B3d47A7A1F3A8D08A5a4a04189C08`](https://sepolia.etherscan.io/address/0x17cb013B4E8B3d47A7A1F3A8D08A5a4a04189C08) | — |
| Registrar role (server key, H-approved plans only) | [`0xc63F0594309F21E35b41298C71d370c0d0A9313C`](https://sepolia.etherscan.io/address/0xc63F0594309F21E35b41298C71d370c0d0A9313C) | — |

**Live records on `northstar.vestige.eth`** (C1 read-back at block 12080140: 18 of 18 post-deployment checks pass, including the transfer and resolver-write negative tests; re-read by the public page today):
`vestige.ventureId = 0xe68b1b43989080cfe7581731204a977009d67e3b3660062d24157562cc93e3ff`, `vestige.status = workspace`, `vestige.humans = 1`. `vestige.agreement`, `vestige.guard` and the ENSIP-11 treasury address are **not set yet**.

### Whitechain testnet (1874): treasury

**vestige infrastructure, LIVE.** Deployed by X under H approval on 2026-11-07, with at least 2 confirmations. Runtime code hashes were re-read today and match `contracts/manifests/whitechain-1874/infrastructure.json`.

| Contract | Address | Deployment tx | Block |
|---|---|---|---|
| SeatRegistry (attester `0x8406…DDEd`) | [`0xe91BF256Afa7c5453e715c39Ab2431EAd492bcBA`](https://explorer.testnet.whitechain.io/address/0xe91BF256Afa7c5453e715c39Ab2431EAd492bcBA) | [`0x4b3303aa…d6ff`](https://explorer.testnet.whitechain.io/tx/0x4b3303aaec451196264af6ef4faf0df072d24456311c99fec98cc97b6e72d6ff) | 12417009 |
| SafeSetup (singleton `0x29fc…C762`) | [`0x153406cd0509E71d302eD49E787051Bb98231558`](https://explorer.testnet.whitechain.io/address/0x153406cd0509E71d302eD49E787051Bb98231558) | [`0xb8f34f2b…4adb`](https://explorer.testnet.whitechain.io/tx/0xb8f34f2b425cd80ac512ee44d7cc18f9301a25a71a2223e0a79e4334e79f4adb) | 12417015 |

**Pre-existing canonical contracts the treasury is built on** (provenance explained below):

| Contract | Address | Creation tx | Block |
|---|---|---|---|
| Safe L2 singleton v1.4.1 | [`0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`](https://explorer.testnet.whitechain.io/address/0x29fcB43b46531BcA003ddC8FCB67FFE91900C762) | [`0x4c296f74…8f84`](https://explorer.testnet.whitechain.io/tx/0x4c296f740fe3fdd0bea056c40ee5522d00ea65e5a58a45304d9386429fb68f84) | 2509810 |
| Safe proxy factory v1.4.1 | [`0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`](https://explorer.testnet.whitechain.io/address/0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67) | [`0xa1994d4c…bd24`](https://explorer.testnet.whitechain.io/tx/0xa1994d4c061ac168a223873875a0255d225165643dd0104dd4b6ed3f288abd24) | 2509796 |
| Official test USDT (proxy, 6 decimals) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) | [`0xabf14f3d…99f5`](https://explorer.testnet.whitechain.io/tx/0xabf14f3df9f912b513edff9ec77fbfa9bf80ea5a5e9186e76f3e647df5b999f5) | 10321991 |
| Test USDT implementation | [`0x26425662D126412128967ECf0a02EC48573026F7`](https://explorer.testnet.whitechain.io/address/0x26425662D126412128967ECf0a02EC48573026F7) | [`0xb73e02b2…06b9`](https://explorer.testnet.whitechain.io/tx/0xb73e02b23eacaea76bb2845ba5f71003095f7c498e378bd324e414e33a6406b9) | 7957063 |

**Role funding (H-approved transfers, not deployments):**

| What | Tx |
|---|---|
| Deployer 0.80 WBT | [`0xa067edca…64ef`](https://explorer.testnet.whitechain.io/tx/0xa067edca93578197bae5bfea6b02164534a128306c5463cd04394a13876064ef) |
| Relayer 0.80 WBT | [`0x975654d8…7a21`](https://explorer.testnet.whitechain.io/tx/0x975654d820334026fa9eeceb79f37585ac7ae9a2dfea328cf7ba5246e6ee7a21) |
| Attester 0.20 WBT | [`0x671ffa95…89a9`](https://explorer.testnet.whitechain.io/tx/0x671ffa9548b2e3495c69443d0306f245d6e39bb57f1aa5c232cc8e1dfcfd89a9) |
| Isolated failed-tx sender 0.05 WBT | [`0x7d91fa75…a936`](https://explorer.testnet.whitechain.io/tx/0x7d91fa759e916d3ccf14cd4dca9a71d388e53b60a229a679cc61de470ba0a936) |
| Demo funder 100 test USDT | [`0x31c4345c…a10d`](https://explorer.testnet.whitechain.io/tx/0x31c4345cca60ba544d08be0c74c361169d4d09ec9e4b2324887a852797c4a10d) |

**northstar treasury.** Rows are filled only from receipts X or C1 report and C2 re-reads on-chain (status, block, `to` = SeatRegistry, `from` = attester `0x8406…DDEd`, `attestSeat` calldata decoded). Until then each one stays PENDING.

| Step | Tx / address | Block | Status |
|---|---|---|---|
| Seat attested: `aman` (World staging nullifier digest) | [`0x4c123b4f…cec2`](https://explorer.testnet.whitechain.io/tx/0x4c123b4f9e3e4d93fb25b9abeaadb69a94a1ad1aa6c37f508bcc5bb00e29cec2) | 12418426 | **LIVE**. `isSeat(northstar, 0xfc2e…9f3E) = true`; TESTED IN SIMULATOR |
| Seat attested: `ravi` (**demo-override hash, MOCK_ONLY**) | [`0x2d185976…28de`](https://explorer.testnet.whitechain.io/tx/0x2d1859763c7b5b621fc251e37b3d60c81b1242bdc7cb5411118be2045a7728de) | 12418471 | **LIVE chain fact, MOCK_ONLY human.** `isSeat(northstar, 0x1711…3454) = true`. The calldata seat hash `0xa512…05dc` equals `keccak256("vestige.demo-override/1\|ventureId\|wallet")`, not a World digest |
| northstar Safe [`0xE707…23A2`](https://explorer.testnet.whitechain.io/address/0xE707e3e99Da85B0D8F3814a640976b3B08A123A2) (2-of-2) + VestigeGuard [`0x3255…fa6B`](https://explorer.testnet.whitechain.io/address/0x3255A0C5d39167FC55b6dE917DCf6F014F6efa6B), created through the proxy factory with the SafeSetup initializer | [`0x93ef2146…6293`](https://explorer.testnet.whitechain.io/tx/0x93ef21464c92d8a903df9b885cc4801386b39d76f9d0808bf26e8f36b9116293) | 12418659 | **LIVE.** Owners aman + ravi, threshold 2, guard slot = Guard, no modules; `Guard.safe/registry/ventureId` match; code hashes match the manifest |
| ENSIP-11 `addr(northstar, 2147485522)` = Safe, and `vestige.guard` set (Sepolia) | PENDING | | **PENDING (C1 / H ENS plan).** Re-read 2026-11-07: not set. Until it is, the public and funder pages can't reach the Safe from ENS and say "No treasury linked", never ACTIVE |
| Reviewed manifest `public/manifests/northstar.vestige.eth.json` | SHA-256 `ebee2686…02ef` | | **Published.** Byte-identical copy of X's `contracts/manifests/published/northstar.vestige.eth-4504d9782084.json`. Accepted by both C2's and X's validators |
| Gasless deposit, 10 USDT funder → Safe (EIP-3009 `transferWithAuthorization`, relayed) | [`0x80a0323b…ddef`](https://explorer.testnet.whitechain.io/tx/0x80a0323b7e3397135bea641644ca5c391c1c2e93d003e58b7d2fc1ce93caddef) | 12418978 | **LIVE.** Transfer `0xD613…d43A` → Safe 10.000000 USDT. Sent by relayer `0xc57f…3116`; the funder holds 0 WBT |
| 2-of-2 payment, 5 USDT Safe → `0xabdc…a8d8` (`execTransaction`, both owner signatures, relayed) | [`0x9be37d58…d4ad`](https://explorer.testnet.whitechain.io/tx/0x9be37d5801a42dc9427325c1204db156725fa61c9948e37748cc596a532bd4ad) | 12419847 | **LIVE.** Safe nonce 0 → 1; Safe balance now 5.000000 USDT |
| Rejected 1-of-2 `execTransaction` from the isolated sender `0xd03c…C852`, reverted **`GS020`** | [`0x7a0691c2…883a`](https://explorer.testnet.whitechain.io/tx/0x7a0691c2dd082938514418955ec40d6a39e291c682957f62a8bbd2694c82883a) | 12419728 | **LIVE (mined, status 0).** C2 replayed the same call at parent block 12419727: `execution reverted: GS020`. Blockscout shows the same revert reason |

#### How the pre-existing contracts are proven

The Safe singleton, the Safe proxy factory and the test USDT proxy and implementation were deployed long before vestige existed. The public Whitechain RPC doesn't allow `debug_traceTransaction` and prunes historical state older than about 27 hours. So X's strict check reports `MANIFEST_CREATION_UNPROVEN` for these four, and the manifest records their creation transactions as **explorer-attested** (taken from Blockscout's indexer).

Each part of that claim can still be checked independently from the public RPC alone (`docs/agent-reports/product/2026-11-07-infra-provenance-check.txt`):

- **Code.** Today's runtime code keccak equals the manifest's `runtimeCodeHash` for all six contracts.
- **Token proxy and implementation.** The creation transaction's receipt `contractAddress` is exactly the manifest address.
- **Singleton and factory.** Both were created through the deterministic deployer `0x914d…43d7`. `keccak256(0xff ‖ deployer ‖ salt ‖ keccak256(initcode))`, computed from each transaction's own input, gives exactly the manifest address, and the transaction succeeded (status 1).
- **What stays explorer-attested:** only the historical execution trace. Whether to accept this mode or require a tracing RPC is H's decision; X did not weaken the check.

## What is simulated, mocked or not yet live (honest list)

| Area | Status |
|---|---|
| **World ID** | **Staging (simulator) only.** Every seat proof is labelled TESTED IN SIMULATOR. The duplicate-human refusal (same identity, second wallet, same venture) is real staging evidence. **Two distinct founders is MOCK_ONLY** (D-024): the simulator returned the same nullifier for two test identities. **No real humans** have verified; no production uniqueness is claimed. |
| **Second founder on northstar: demo-override seat (MOCK_ONLY)** | `ravi` is not World-verified. An operator marks that seat ready with the **CR-ID-06 demo override** so the terms and treasury flow can be shown with only one simulator identity. **What is real:** if attested, the SeatRegistry seat is a real Whitechain fact, and the Safe owner, Guard and 2-of-2 rule are real. **What is not:** the seat hash is `keccak256("vestige.demo-override/1\|ventureId\|wallet")`, namespaced so it can never collide with a World nullifier digest. No human proof stands behind it. Everywhere it appears it is labelled `SELF_REPORTED · DEMO OVERRIDE · NOT WORLD-VERIFIED`, and attestation events are `DEMO-OVERRIDE HASH · MOCK_ONLY`. It is never counted in `humansVerified` or `vestige.humans` (still `1`), and it gets no ENS subname. The public and funder pages say so next to the seat check, even when the treasury is ACTIVE. |
| **ENS for new ventures** | The API never broadcasts. A venture created live gets its ENS steps **PENDING** until an operator broadcasts an H-approved, digest-bound plan. `northstar` went through exactly that path. |
| **Whitechain treasury** | **Live:** SeatRegistry, SafeSetup, the northstar Safe and Guard, the reviewed manifest, a 10 USDT gasless deposit, a 5 USDT 2-of-2 payment and the mined GS020 revert. **Pending:** the Sepolia ENS records pointing northstar at the Safe. The public and funder pages show ACTIVE only from independent chain reads (ENS → Safe → Guard → SeatRegistry → code hashes → USDT) against the reviewed manifest, never from the vestige API. |
| **Relayer (gasless USDT)** | Implemented with simulation, allowlists, rate limits and a budget cap. It ran **only in an H-approved, session-only mode** to relay the deposit and the payment above, and was **disabled again** afterwards (X evidence `2026-11-07-23-relay-session/`). The funder paid no WBT. |
| **Seat attestation on Whitechain** | **Live for northstar** (both seats, table above). The attester signer is limited to `attestSeat` on the manifest registry (exact calldata, value 0, gas and fee caps). The relayer has no signer. The `ravi` seat is a real chain seat built on the MOCK_ONLY override hash. |
| **Venture list summaries** | Reported by the API and shown as `· reported`, never green. Treasury and funding values are **Unknown** until X's chain-backed summary port is live. |
| **DEV MOCK** | A development adapter exists for UI work. It is visibly labelled DEV MOCK on every screen and **forced off in production builds**. |
| **Legal** | Not a company. No incorporation, no legal rights. |

## Run it

```bash
pnpm install
cp .env.example .env.local   # server: VESTIGE_DB_PATH, VESTIGE_AUTH_URI, SEPOLIA_RPC_URL, WHITECHAIN_RPC_URL, World RP config
                             # browser: NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL=/manifests/{ensName}.json
pnpm build && pnpm start      # port 3200
open http://localhost:3200/v/northstar.vestige.eth
```

Tests: `pnpm typecheck`, `pnpm test` (unit), `pnpm exec vitest run -c tests/e2e/cross-owner/vitest.config.ts` (cross-owner on real modules), and `pnpm exec playwright test -c tests/e2e/playwright.config.ts` (browser: `mock`, `live`, `integration` with `E2E_INTEGRATION_URL`).

## Evidence

- ENS parent: `docs/agent-reports/human/ens-p2/p1-receipt.json`, `docs/agent-reports/human/ens-p2/p2-confirmed.json`, `docs/agent-reports/identity/evidence/ens-parent-readback.json`.
- northstar: `docs/agent-reports/identity/evidence/first-venture-receipts-northstar.json`, `docs/agent-reports/identity/evidence/post-deploy-northstar.json`.
- World staging: `docs/agent-reports/identity/evidence/world-staging-e2e.json` (per-case labels).
- Whitechain funding: `docs/agent-reports/treasury/2026-11-07-human-approved-wallet-funding.{md,json}`.
- Product: `docs/agent-reports/product/` (E2E transcripts, cross-owner runs, handoffs).
- Sponsor feedback: `WORLD_FEEDBACK.md`, `WHITECHAIN_FEEDBACK.md` (H).
