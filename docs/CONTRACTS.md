# Interface Contracts — v0 PROPOSED; H MUST LOCK BEFORE CODING

**Status:** PROPOSED, not yet acknowledged. **Owner:** Human Lead. No agent silently edits this file.

## Network/config constants
- ENS network: Ethereum Sepolia `11155111`; Whitechain network: Sepolia `1874`.
- ENS coin type for Whitechain: `2147485522`.
- Safe 1.4.1 singleton `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762` and ProxyFactory `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67` **per PRD; re-check chain code**.
- Test USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` **per PRD; verify code/ABI/domain/decimals**.
- Exact ENS contracts, public explorer URLs, World action type and Safe Guard/Registry addresses: **TBD after live verification**.

## Identifiers / canonical shapes
- `ventureId`: server-generated `0x` + 64 hex bytes32, no mutable re-encoding; same bytes32 on Whitechain.
- `slug`: case-normalized, unique, DNS-compatible short string, vetted against collisions.
- `ensName`: `${slug}.dayzero.eth`; venture status record `workspace` only.
- `founderSeat`: `{ ventureId, wallet, founderSubname, worldProofStatus, onchainSeatStatus, attestationTxHash? }`.
- `agreement`: `{ ventureId, agreementId, version, canonicalJson, docHash, nonce, expiry, signatures[] }`, with full text private.
- `treasury`: `{ ventureId, safeAddress, chainId:1874, ownerAddresses[], threshold:2, guardAddress, registryAddress, verificationStatus, deploymentTxHash }`.
- `payment`: `{ paymentId, ventureId, safeTxHash, recipient, tokenAddress, amountRaw, reason, signerWallets[], status, executedTxHash? }`.
- `evidence`: `{ id, ventureId, kind, label, status, chainId?, txHash?, blockNumber?, confirmedAt?, source }`.
- Read status enum: `UNKNOWN | PENDING | VERIFIED | FAILED`; payment: `AWAITING_APPROVALS | READY | EXECUTED | FAILED`. API owners can refine only with H's approved change.

## API rough contract v0 (owners refine implementations only)

| Route | Owner | Inputs | Outcome (no secrets) |
|---|---|---|---|
| `POST /api/identity/ventures` | C1 | authenticated founder + slug/team metadata | ventureId, ensName, created state |
| `POST /api/identity/ventures/:id/join` | C1 | signed single-use invite + wallet proof | pending seat; no duplicate wallet |
| `POST /api/identity/ventures/:id/world/verify` | C1 | World proof, session challenge | proof result; duplicate denied; `SeatRegistry` attestation pending/confirmed |
| `GET /api/identity/ventures/:id` | C1 | auth/read policy | founder seat + ENS + verification summaries |
| `POST /api/agreements/ventures/:id/versions` | C1 | canonical agreement fields | version/hash; signatures reset |
| `POST /api/agreements/ventures/:id/sign` | C1 | typed payload + signature | verified signer + version completion; ENS record sync pending |
| `POST /api/treasury/ventures/:id/deploy` | X | authorized venture + two verified seats | deployment requested/confirmed + readback state |
| `POST /api/treasury/ventures/:id/fund` | X | payer's token typed authorization | relayer result + real chain receipt |
| `POST /api/treasury/ventures/:id/payments` | X | proposal, recipient, raw value | Safe transaction hash; awaiting approvals |
| `POST /api/treasury/ventures/:id/payments/:pid/sign` | X | signed Safe tx hash | verified signer record, approval count |
| `POST /api/treasury/ventures/:id/payments/:pid/execute` | X | ready payment ID | simulated then submitted tx receipt |
| `GET /api/treasury/ventures/:id` | X | read request | chain readback + pending payments |
| `GET /api/identity/public/:ensName` | C1 | ENS name | OFFCHAIN human and agreement evidence only; no authoritative treasury claims |

C2 consumes these through a typed adapter, never imports DB or private key modules. C2 public page resolves ENS Sepolia first, queries Safe/Guard/Registry/token on Whitechain second, then joins the C1 API's minimal non-PII evidence; the public UI must gracefully display RPC errors as `UNKNOWN`.

## Schema and security decisions to finalize at handshake

- **Wallet authentication:** Signed challenge/nonce/session model, expiry/CSRF rules; only H approves.
- **World action binding:** Test whether action can be dynamically venture-scoped; do not rely on signal-only uniqueness. Confirm `same human / different venture` works.
- **Attester:** C1 verifies World then emits an authorized backend request for X's owned `attestSeat` service. Narrow role; no arbitrary contract execution.
- **ENS sync:** C1 owns the registrar, X passes verified safe/guard info via versioned event/service; no direct shared-database coupling from C2.
- **Safe tx signatures:** protocol-defined domain on Whitechain; sorted signatures; signer recovery and threshold check; actual gasless relay on server only.
- **Environment variable names:** H locks names in `.env.example`, agents propose additions rather than editing root unilaterally.
- **Deployment manifest:** human-approved source of contract addresses, tx hashes, network, commits and explorer URLs; missing manifest fails demo build closed.

## Change control

`CR-###: FROM → TO | PURPOSE | AFFECTED OWNERS | MIGRATION | EVIDENCE | H: APPROVED/REJECTED`. Interface v1 only after C1, C2 and X ACK. Do not code against speculative endpoints as if committed.
