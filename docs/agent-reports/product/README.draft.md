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

| What | Tx / address |
|---|---|
| Official test USDT (6 decimals) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |
| H-approved role funding: deployer 0.80 WBT | [`0xa067edca…64ef`](https://explorer.testnet.whitechain.io/tx/0xa067edca93578197bae5bfea6b02164534a128306c5463cd04394a13876064ef) |
| H-approved role funding: relayer 0.80 WBT | [`0x975654d8…7a21`](https://explorer.testnet.whitechain.io/tx/0x975654d820334026fa9eeceb79f37585ac7ae9a2dfea328cf7ba5246e6ee7a21) |
| H-approved role funding: attester 0.20 WBT | [`0x671ffa95…89a9`](https://explorer.testnet.whitechain.io/tx/0x671ffa9548b2e3495c69443d0306f245d6e39bb57f1aa5c232cc8e1dfcfd89a9) |
| H-approved role funding: isolated failed-tx sender 0.05 WBT | [`0x7d91fa75…a936`](https://explorer.testnet.whitechain.io/tx/0x7d91fa759e916d3ccf14cd4dca9a71d388e53b60a229a679cc61de470ba0a936) |
| H-approved funding: demo funder 100 test USDT | [`0x31c4345c…a10d`](https://explorer.testnet.whitechain.io/tx/0x31c4345cca60ba544d08be0c74c361169d4d09ec9e4b2324887a852797c4a10d) |
| SeatRegistry | **PENDING (X)**: not deployed |
| VestigeGuard | **PENDING (X)**: not deployed |
| northstar Safe (2-of-2) | **PENDING (X)**: not deployed |
| Deposit 100 USDT → Safe (EIP-3009, relayed) | **PENDING (X)** |
| 2-of-2 payment 50 USDT | **PENDING (X)** |
| Rejected 1-of-2 attempt (on-chain revert `GS020`) | **PENDING (X / H approval)** |
| Reviewed manifest `public/manifests/northstar.vestige.eth.json` | **PENDING (X)** |

## What is simulated, mocked or not yet live (honest list)

| Area | Status |
|---|---|
| **World ID** | **Staging (simulator) only.** Every seat proof is labelled TESTED IN SIMULATOR. The duplicate-human refusal (same identity, second wallet, same venture) is real staging evidence. **Two distinct founders is MOCK_ONLY** (D-024): the simulator returned the same nullifier for two test identities. **No real humans** have verified; no production uniqueness is claimed. |
| **Second founder on northstar** | `ravi` is not World-verified. For the demo an operator may mark that seat ready with the **CR-ID-06 demo override**. It is labelled `SELF_REPORTED · DEMO OVERRIDE · NOT WORLD-VERIFIED`, is never counted in `humansVerified` or `vestige.humans` (still `1`), and gets no ENS subname. |
| **ENS for new ventures** | The API never broadcasts. A venture created live gets its ENS steps **PENDING** until an operator broadcasts an H-approved, digest-bound plan. `northstar` went through exactly that path. |
| **Whitechain treasury** | Contracts are written and tested (Foundry, local fork), and the deploy plan is reviewed, but **nothing vestige-owned is deployed on 1874 yet**. The UI shows "Deployment requested — waiting for operator approval" and the public page never says ACTIVE without a reviewed manifest and live reads. |
| **Relayer (gasless USDT)** | Implemented with simulation, allowlists, rate limits and a budget cap, but **disabled** (`RELAYER_ENABLED=false`) until H approves activation. No relayed transaction exists yet. |
| **Seat attestation on Whitechain** | The attester is wired through the root composition in read-only mode (`authorizeSend: false`). On-chain seats read "not attested". |
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
