# Interface Contracts — v0 LOCKED

**Status:** H-APPROVED v0 baseline; owner compatibility ACKs pending. **Owner:** Human Lead. **Decision date:** 2026-11-06 UTC.
Changes require a numbered CR, affected-owner review, migration notes, and H approval. A locked interface does not make an unverified live deployment or World proof verified; runtime state remains `UNKNOWN`/`UNVERIFIED` until independently read back.

This document settles H's decisions and authorizes owner-scoped implementation and local integration work. Under MASTER §3, the team freeze is complete only after C1, C2, and X ACK this exact revision in their own report, identifying deviations and tests. None of those ACKs has yet been supplied; approval of a proposal is not an implementation ACK. Live signing/deployment still requires H's separate approval of exact network and parameters.

| Owner | Compatibility ACK | Required follow-through |
|---|---|---|
| C1 | PENDING | Hash nullifiers, publish ENS ventureId, add consent/list API, match signing and session rules |
| X | PENDING | Implement attestation/auth adapters, publish ABIs/manifest, configure relay limits and monitoring |
| C2 | PENDING | Consume manifest and ENS ventureId, byte-match C1 agreement document, test real wallet switching |

## Approved change register

| Change | Decision | Scope / condition |
|---|---|---|
| CR-X-001 | **APPROVED** | VestigeGuard; exactly two owners and threshold 2; only verified-seat owner swaps; no modules, delegatecalls, MultiSend, fallback handler, Guard replacement/removal, threshold downgrade, upgrade, or recovery path; atomic guarded Safe setup. Lost founder keys intentionally lock the treasury. |
| CR-ID-01 | **APPROVED** | Each venture gets its own UserRegistry and each founder subname gets its own Permissioned Resolver, scoped to that founder's records. |
| CR-ID-02 | **APPROVED** | Wallet challenge/session, invite, World request, agreement signing-payload, and signing endpoints below are part of v0. |
| CR-ID-03 | **APPROVED** | C1-to-X `SeatAttestationPort` below is the only seat-attestation seam. It fails closed until receipt plus independent seat read-back. |
| CR-ID-04 | **APPROVED** | The on-chain value is `keccak256(abi.encode(uint256(worldNullifier)))`; the raw World nullifier never enters the chain or public API. |
| D-004 | **APPROVED with gate** | Pin World 4.0, dynamic per-venture actions, backend nullifier uniqueness, and `TESTED_IN_SIMULATOR` labeling. A 3.0 fallback requires H approval before enrolling any founder, with a fresh RP/app and registry namespace. Never change protocol for existing ventures or mix versions. |
| CR-C2-001 | **APPROVED** | Founder-consented public venture list with non-PII `VentureSummary`; no authoritative treasury claims. |
| CR-C2-002 | **APPROVED** | Publish `ventureId` in the ENS `vestige.ventureId` text record. The public verifier resolves it from ENS; an API value is only a cross-check. |
| CR-C2-003 | **APPROVED** | X publishes reviewed SeatRegistry/VestigeGuard ABIs and the deployment manifest schema below. |
| CR-C2-004 | **APPROVED** | Treasury readback includes `deploymentBlock`; the public reader scans logs from that block in RPC-sized windows. |
| CR-C2-005 | **APPROVED** | Canonical JSON and `docHash` algorithm below is authoritative for C1, C2 preview, and agreement verification. |
| CR-C2-006 | **APPROVED** | Add optional `worldEnvironment: "staging"|"production"` to verified founder seat and public founder projections, and `source` to evidence events. Staging results must display `TESTED_IN_SIMULATOR`; absent provenance remains unknown. |
| CR-C2-007 | **RESOLVED** | Keep C1's existing founder-only listing shape `{ listed, consents: [{ wallet, listed }] }`; C2's current adapter already consumes it. No `optedIn` alias is added. |
| CR-ID-05 | **APPROVED for implementation; X ACK pending** | Read-only `TreasurySummaryPort.summary(ventureId)` returns `{ treasuryActive: boolean|null, funded: boolean|null, observedAt: string, source: string, verificationStatus: "UNKNOWN"|"PENDING"|"ACTIVE"|"UNVERIFIED"|"FAILED" }`. C1 keeps treasury booleans null until X registers the port and supplies independently checked data. |

## Network and approved runtime anchors

- ENS network: Ethereum Sepolia `11155111`.
- Treasury network: Whitechain `1874`.
- ENS coin type for Whitechain: `2147485522`.
- Safe v1.4.1 L2 singleton: `0x29fcB43b46531BcA003ddC8FCB67FFE91900C762`.
- Safe v1.4.1 ProxyFactory: `0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67`.
- Official test USDT: `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`; expected decimals `6`; expected EIP-712 domain is `Tether USD`, version `1`, chainId `1874`, verifying contract equal to the proxy. Runtime code, implementation, domain, and decimals must be rechecked against the approved manifest before relay.
- ENSv2 addresses and the parent/resolver deployment are configuration inputs from C1's read-only spike; no address is considered live deployment evidence until the transaction and read-back are recorded.

## Identifiers and privacy

- `ventureId`: server-generated `0x` + 64 lowercase hex characters, allocated once and reused byte-for-byte in SQLite, World action derivation, SeatRegistry, Guard, APIs, and ENS `vestige.ventureId`. The frontend never generates or substitutes it.
- `slug`: case-normalized, unique, DNS-compatible, collision-checked string.
- `ensName`: `${slug}.vestige.eth`; the public status record is `workspace`, never `incorporated`.
- `founderSeat`: `{ ventureId, wallet, founderLabel, founderSubname, worldProofStatus, onchainSeatStatus, attestationTxHash? }`. Raw World nullifiers are server-only and never returned.
- `agreement`: `{ ventureId, agreementId, version, canonicalJson, docHash, nonce, expiry, signatures[] }`; full agreement text is private.
- `treasury`: `{ ventureId, safeAddress, chainId:1874, ownerAddresses[], threshold:2, guardAddress, registryAddress, verificationStatus, deploymentTxHash, deploymentBlock }`.
- `payment`: `{ paymentId, ventureId, safeTxHash, recipient, tokenAddress, amountRaw, reason, signerWallets[], status, executedTxHash? }`.
- `evidence`: `{ id, ventureId, kind, label, status, chainId?, txHash?, blockNumber?, confirmedAt?, source }`.
- Labels are exactly `HUMAN_VERIFIED`, `SIGNED`, `CHAIN_VERIFIED`, and `SELF_REPORTED`. `TESTED_IN_SIMULATOR` is a separate evidence-source qualifier, not a fifth label; it must accompany simulator results and never imply live human uniqueness.
- Read status remains `UNKNOWN | PENDING | VERIFIED | FAILED`. Treasury verification is separately `UNKNOWN | PENDING | ACTIVE | UNVERIFIED | FAILED`; `ACTIVE` requires complete independent chain read-back. Payment lifecycle is `AWAITING_APPROVALS | READY | EXECUTED | FAILED`; relay submission is separately `RESERVED | UNKNOWN | SUBMITTED | EXECUTED | FAILED`. Pending submission must not appear executed. JSON uint256/block amounts use decimal strings; API times use ISO-8601 UTC, signing expiry uses Unix seconds, and internal port `confirmedAt` uses Unix milliseconds.

## Identity, ENS, and World rules

- A World action is exactly `vestige-founder-seat:<ventureId>`, signed per request by the configured RP. The backend pins the action, signal wallet, environment, credential type, and one `WORLD_PROTOCOL_VERSION`; it never trusts client-supplied action or signal fields.
- Backend uniqueness is the authority: `(ventureId, worldNullifier)` is unique, and the action/nullifier replay key is unique. Same human/different venture is allowed; same human/same venture is refused. World portal success on nullifier reuse is not treated as a duplicate denial.
- C1 stores the World nullifier privately and passes only `keccak256(abi.encode(uint256(worldNullifier)))` to X. The on-chain `SeatAttested` event may expose that digest, not the raw nullifier.
- Pin `(RP/app, environment, protocol)` for the lifetime of a venture and its registry. Environment/protocol changes cannot reuse previously attested ventures: different nullifier schemes could otherwise allow one person into both seats. Hashing reduces raw disclosure; the attester still sees the nullifier and the digest is a public correlation value, not anonymity.
- ENS topology: `vestige.eth` is the parent; each venture has its own UserRegistry; each founder subname is non-transferable and has its own Permissioned Resolver with only that founder's permitted text/address records. The public venture records include `vestige.status`, `vestige.humans`, `vestige.agreement`, `vestige.guard`, `vestige.ventureId`, and ENSIP-11 address coin type `2147485522`.
- ENS writes are considered complete only after receipt success and Universal Resolver read-back. If parent setup, resolver setup, or write confirmation fails, the API remains pending/failed and the UI says unresolved.
- Registrar roles inside each venture registry are only `REGISTRAR|RENEW`; founder token roles are zero. Founder resolvers grant `SET_TEXT|SET_ADDRESS` only to their founder; venture resolvers grant these to the registrar, with no LINK/UPGRADE grant. Non-transferability and emancipation need live negative tests. Founder revocation by governance is deferred: the Whitechain Safe has no Sepolia governance authority. Until handover, the parent operator can still re-point/unregister the venture name; this residual power must be disclosed.

## Wallet authentication, persistence, and wallet strategy

- Persistence v0 is SQLite using Node's built-in `node:sqlite`, WAL mode, migrations, foreign keys, busy timeout, and unique constraints. Persistent disk and one application host are required; ephemeral/serverless replicas are unsupported. H owns shared connection/migration conventions; C1 owns `010_*`, X owns `020_*` migrations. Use transactions for invites, seats, signatures and idempotency. Pending ENS writes are durable jobs reconciled after restart.
- Accept X's existing exclusive-lock, fsync/atomic-rename FileJournal for the single dedicated relayer wallet on that host, on persistent private disk, with one process owning its nonce. This avoids forcing an unimplemented SQLite journal rewrite. Transactional SQLite replacement is allowed behind the same journal port only after concurrency/crash tests. No transaction may broadcast before its reservation is durably committed; stuck locks/UNKNOWN submissions require sender/nonce reconciliation before recovery. Never blindly delete locks or replay. Journal and SQLite backup/recovery must be coordinated.
- Authentication is EIP-4361-style EOA challenge/session. The server creates a 16-byte single-use nonce with a five-minute TTL, binds the message to `VESTIGE_AUTH_DOMAIN`, `VESTIGE_AUTH_URI`, wallet, chainId `11155111`, issued-at, and expiry, and verifies with `viem` ECDSA recovery. The session is a 32-byte random bearer token, stored only as SHA-256 at rest, valid for 12 hours, and supplied as `Authorization: Bearer`. No client-supplied founder wallet is trusted for authorization. Challenge consumption is atomic before signature verification; expired/used sessions fail closed.
- Both auth endpoints are unauthenticated and rate limited; domain/URI come from trusted server configuration, never Host headers. Browser tokens stay in memory, not localStorage, URLs, logs, or analytics. Use HTTPS outside localhost, same-origin mutation checks, no wildcard credentialed CORS, `Cache-Control: no-store`, and clear sessions on account change/disconnect. Logout revokes the token server-side. A wallet session is authentication only; sensitive calls also check venture membership, payment authority, and signed intent. Funding requires session wallet = recovered payer. Private agreements are readable only by current authorized founders.
- v0 supports injected EIP-1193 EOA wallets through `viem` only. The root integration pins one compatible `viem` version; wagmi, embedded wallets, passkeys, ERC-1271/6492, and approved-hash modes are out of scope for v0. The backend never receives founder private keys.
- Visible network switching is accepted and explained in the UI: identity/auth/agreement context uses Sepolia `11155111`; Safe/payment signatures and EIP-3009 funding use Whitechain `1874`. Do not promise exactly one switch: revisiting terms may require another. Request a switch only after user action; rejected switches remain actionable errors. Use one injected EOA per consenting human in separate browser profiles, with distinct funder/payee and operator keys. No embedded wallet or gas-free-network-switch claim is approved; founder/payer operations are off-chain signatures, with gas paid by operators. Pin the existing C2 `viem@2.57.16` at root, subject to root integration compatibility tests; isolated spike locks remain scoped to their packages.

## API contract v0

All mutation routes require the authenticated bearer session unless stated otherwise. Errors are `{ error: { code, message } }`; codes are stable and user-safe. C2 uses typed clients and never imports C1/X databases or private modules.

Auth challenge/session are the exceptions. Implementations validate body sizes, address/bytes32 formats and decimal uint256 strings. All signed payloads are server constructed. Retryable writes carry an `Idempotency-Key`, scoped to session wallet + route + canonical body digest: identical retries return the original operation, changed bodies return 409. Chain submission remains deduplicated by token nonce or Safe nonce. This is an implementation requirement, not a claim the current handlers already provide it.

| Route | Owner | Inputs | Outcome |
|---|---|---|---|
| `POST /api/identity/auth/challenge` | C1 | `{ wallet }` | `{ nonce, message, expiresAt }`; no state change beyond the challenge row |
| `POST /api/identity/auth/session` | C1 | `{ nonce, signature }` | `{ token, wallet, expiresAt }`; bearer token only, never logs it |
| `DELETE /api/identity/auth/session` | C1 | authenticated session | 204, revoke this token |
| `POST /api/identity/ventures` | C1 | authenticated founder + `{ name, slug?, founderLabel }` | server `ventureId`, `ensName`, created state |
| `POST /api/identity/ventures/:id/invites` | C1 | authenticated founder seat | single-use `{ inviteToken }`, returned once |
| `POST /api/identity/ventures/:id/join` | C1 | `{ inviteToken, founderLabel }` | pending seat; invite is consumed atomically |
| `POST /api/identity/ventures/:id/world/request` | C1 | authenticated founder seat | IDKit params with server-pinned action, protocol, environment, signal |
| `POST /api/identity/ventures/:id/world/verify` | C1 | `{ idkitResult }` | verified/duplicate/failed result; attestation pending or confirmed |
| `GET /api/identity/ventures/:id` | C1 | authenticated seat/read policy | founder seats, ENS and non-PII verification summaries |
| `GET /api/identity/ventures` | C1 | public read; only founder-consented ventures are listed | `VentureSummary[]`: `ventureId`, `displayName`, `ensName`, `humansVerified`, `termsSigned`, `treasuryActive`, `funded`; no PII |
| `GET /api/identity/public/:ensName` | C1 | ENS name | off-chain human/agreement evidence only; no authoritative treasury claim |
| `GET /api/agreements/ventures/:id/sign?nonce=&expiry=` | C1 | authenticated founder; nonce/expiry are optional bounded hints | exact EIP-712 `FoundingTerms` payload, current version/hash; server validates freshness and rejects replay |
| `POST /api/agreements/ventures/:id/versions` | C1 | canonical agreement fields | version/hash; all prior-version signatures reset |
| `POST /api/agreements/ventures/:id/sign` | C1 | `{ version, nonce, expiry, signature }` | verified signer for the current version |
| `POST /api/treasury/ventures/:id/deploy` | X | authorized venture + two verified seats | deployment requested/confirmed + chain read-back and manifest reference |
| `POST /api/treasury/ventures/:id/fund` | X | payer's EIP-3009 authorization | relayer result + receipt provenance; only approved USDT/Safe target |
| `POST /api/treasury/ventures/:id/payments` | X | recipient + `amountRaw` + reason | Safe transaction proposal; `AWAITING_APPROVALS` |
| `POST /api/treasury/ventures/:id/payments/:pid/sign` | X | EOA Safe signature | verified signer and approval count |
| `POST /api/treasury/ventures/:id/payments/:pid/execute` | X | ready payment | simulated, submitted, and receipt-tracked result |
| `GET /api/treasury/ventures/:id` | X | read request | chain read-back, manifest, `deploymentBlock`, and pending payments |

The public page resolves ENS Sepolia first, reads the ENS `ventureId` and treasury address, reads Safe/Guard/Registry/token state directly from Whitechain, then joins C1's minimal non-PII summary. A mismatch between ENS, API, and manifest is `UNVERIFIED`.

Public-list consent is explicit via `POST /api/identity/ventures/:id/listing { listed: boolean }`, requires all current founders to opt in, defaults false, and any founder can withdraw. The list booleans are cached summaries with `observedAt`, `source`, and `verificationStatus`; `treasuryActive`/`funded` are null when unknown, and must be joined from X's read service rather than invented by C1. Public funding views use minimal summary data, never the founder-only venture endpoint.

Treasury JSON conventions: deployment input is `{}` (server loads confirmed seats); funding is `{ from, to, value, validAfter, validBefore, nonce, signature }` with decimal uint strings and bytes32 token nonce; payment creation is `{ recipient, amountRaw, reason }`; signing is `{ signature }` for the stored proposal; execution is `{}`. A proposal response includes server `paymentId`, exact Safe typed data, Safe nonce, and `safeTxHash`; stale Safe nonces invalidate approvals. Relay operations return `{ operationId, status, txHash?, error? }` with the separate relay lifecycle. Treasury readback includes the latest operation results and block-pinned chain provenance. A deploy request schedules/prepares a deployment; it does not bypass the separate H approval gate.

## C1-to-treasury SeatAttestationPort

X implements this port in `src/modules/treasury`; C1 registers it through `registerSeatAttester()`. No HTTP endpoint or generic arbitrary-call bridge is permitted.

```ts
interface SeatAttestationPort {
  attestSeat(input: {
    ventureId: `0x${string}`;       // bytes32
    wallet: `0x${string}`;           // EOA
    nullifierHash: `0x${string}`;    // keccak256(abi.encode(uint256 rawNullifier))
  }): Promise<{ txHash: `0x${string}`; chainId: 1874 }>;
  confirm(input: {
    ventureId: `0x${string}`;
    wallet: `0x${string}`;
    txHash: `0x${string}`;
  }): Promise<
    | { state: "PENDING" }
    | { state: "CONFIRMED"; chainId: 1874; blockNumber: bigint; confirmedAt: number }
    | { state: "FAILED"; reason: string }
  >;
}
```

`CONFIRMED` requires a successful receipt and an independent `SeatRegistry.isSeat(ventureId, wallet)` read at/after the receipt. The port is fail-closed when X is unconfigured.

## Treasury safety contract

- `VestigeGuard` is bound immutably to one Safe, one SeatRegistry, and one `ventureId`.
- The Safe is created with exactly two distinct verified-seat owners and threshold `2`. The only owner-set change allowed is an atomic verified-seat swap that leaves exactly two distinct current seats and threshold `2`.
- `delegatecall`, MultiSend, module enablement/execution, fallback handler, Guard removal/replacement, threshold changes, arbitrary Safe self-calls, upgrades, and recovery/admin paths are refused. `VestigeGuard` does not claim to protect module execution; modules are absent by invariant.
- `SafeSetup` is the only setup delegatecall target and is used only inside the approved factory initializer. It binds the Guard to the actual Safe and attaches it in the same creation transaction; no unguarded interval is accepted. Only manifest-approved singleton/factory/setup bytecode qualifies.
- A lost founder key intentionally has no recovery path in v0 and can make funds inaccessible. The UI and docs must state this trade-off.
- The normal relayer never submits the deliberate one-signature failure. H may run the separately approved test-wallet GS020 transaction only after reviewing exact calldata and funding; its mined receipt is evidence of rejection, not a payment.

## Canonical agreement hash and signatures

- Agreement schema identifier is `vestige.founding-terms/1`.
- Hash exactly C1's validated document: `{ schema, ventureId, effectiveDate, decisionRule, founders, notes, disclaimer }`, where each founder is `{ wallet, role, contribution, ownershipBps, vestingIntent }`. Lowercase wallets, sort founders by wallet, require exactly the current verified founders and total ownership 10000 bps, and use C1's fixed workspace disclaimer. Agreement `version`, `agreementId`, nonce, expiry and signatures are outside the hashed document and are bound by EIP-712. C2's current `{ventureId, version, template, fields}` preview differs and must be replaced before signing integration.
- Canonical JSON: recursively normalize strings to NFC; reject non-JSON values, non-plain objects, unsafe/non-integer numbers, and duplicate keys after normalization; omit `undefined`; sort object keys lexicographically after NFC normalization; preserve array order; emit compact JSON with no whitespace. `docHash = keccak256(UTF-8(canonicalJson))`.
- Omit undefined object properties only; undefined/sparse array elements are invalid. Sort keys by UTF-16 code units, normalize negative zero to `0`, and reject nesting beyond 16 levels. This is the vestige restricted algorithm, not a claim of full RFC 8785 compliance. C1 and C2 must run shared byte/hash vectors including composed/decomposed Unicode, key normalization collisions, array order, integers and invalid values.
- EIP-712 domain: `{ name: "vestige", version: "1", chainId: 11155111 }`, with no verifying contract.
- EIP-712 primary type `FoundingTerms`: `ventureId bytes32`, `agreementId bytes32`, `version uint256`, `docHash bytes32`, `nonce uint256`, `expiry uint256`.
- The server verifies current version, founder session wallet, doc hash, nonce, expiry, domain, and signature. Updating the agreement creates a new version and clears all prior signatures; v1 signatures never satisfy v2.

## Deployment manifest v1

The manifest is an operator-reviewed, committed JSON artifact. Missing, stale, mismatched, or unverifiable manifests fail closed.

```ts
interface DeploymentManifestV1 {
  schemaVersion: 1;
  network: "whitechain-sepolia";
  chainId: 1874;
  deploymentBlock: number;
  sourceCommit: string;
  explorerBaseUrl: string;
  ventureId: `0x${string}`;
  ensName: string;
  owners: [`0x${string}`, `0x${string}`]; // initial owners; current owners read on-chain
  threshold: 2;
  setupInitializerHash: `0x${string}`;
  approvedAt: string; // ISO-8601 UTC, operator review record
  contracts: {
    safe: ContractArtifact;
    guard: ContractArtifact;
    registry: ContractArtifact;
    singleton: ContractArtifact;
    factory: ContractArtifact;
    setup: ContractArtifact;
    token: ContractArtifact & {
      decimals: 6;
      eip712Domain: TokenDomain;
      domainSeparator: `0x${string}`;
      implementation: ContractArtifact;
    };
  };
}
interface ContractArtifact {
  address: `0x${string}`;
  deploymentTxHash: `0x${string}`;
  deploymentBlock: number;
  runtimeCodeHash: `0x${string}`;
  abiPath: string;
  abiSha256: string;
  verifiedSourceUrl?: string;
}
interface TokenDomain { name: "Tether USD"; version: "1"; chainId: 1874; verifyingContract: `0x${string}`; }
```

Infrastructure manifests use a separate `InfrastructureManifestV1` with `schemaVersion:1`, `kind:"infrastructure"`, chainId, sourceCommit, approvedAt, explorerBaseUrl, and the registry/setup/singleton/factory/token artifacts only; no placeholder Safe or Guard is fabricated. Treasury manifests require every field above. Pre-existing canonical contract provenance must be sourced from real deployment records; missing provenance is a gate, not an invented transaction hash. X publishes ABI JSON with these artifacts and a pure adapter from this nested schema to its existing flat relayer manifest and token config. Codehash/ABI integrity is an operator trust anchor, never a substitute for independent chain reads. Token implementation/domain drift disables relay. Confirm receipts with at least two confirmations and record block hashes for reorg reconciliation. `deploymentBlock` is the Safe creation block; read transfer logs from there in windows no larger than 10000 blocks.

## Relayer fee policy and monitoring

- Users pay no relayer fee in v0. The isolated relayer wallet pays Whitechain WBT for approved funding and payment calls; it is never a founder, attester, deployer, or registrar wallet.
- The relayer constructs only the approved USDT `transferWithAuthorization` funding call and Safe `execTransaction` wrapping an approved USDT transfer. It rejects native value, arbitrary target/function, delegatecall, refund, unsupported token, wrong domain, stale nonce, malformed amount, or unverified manifest.
- Before broadcast it uses the actual sender for simulation, reserves a bounded EVM gas/fee amount plus a conservative OP L1-fee reserve, enforces per-wallet and per-venture rate limits, and persists replay/gas reservations transactionally. `UNKNOWN`, `RESERVED`, or `SUBMITTED` sender-nonce entries block automatic retry until operator reconciliation.
- The L1 reserve is an operational circuit-breaker, not a mathematical cap on total Whitechain fee. No documentation may claim that the relayer is impossible to drain.
- Required monitoring: gas-wallet balance and low-balance alert; reserved/used daily WBT budget; EVM gas and observed L1 fee; simulation failures; codehash/domain/manifest drift; nonce locks/unknown receipts; failed/reverted receipts; duplicate/replay attempts; and confirmation latency. Relay is disabled on manifest drift, insufficient balance, stale nonce lock, or alert transport failure where configured.
- Live relay defaults disabled. Every fee/balance/rate field in `.env.example` must be explicitly configured by X/H before enabling; blank limits reject startup. No numeric L1 allowance is approved without measuring estimates and receipt fees on the target network. Require a working alert transport and kill switch, a narrowly funded wallet, and a fresh fee quote before each send. Persist worst-case gas plus L1 reservations before broadcast; reconcile actual fees afterward without releasing replay protection. Stop when observed fees exceed the reserve. A local-fork result does not satisfy this live fee gate.

## Environment variables

These names are locked; secret values remain local or in the approved secret manager.

Public/browser configuration:

- `NEXT_PUBLIC_VESTIGE_ADAPTER` (`live` or visibly labeled `mock`)
- `NEXT_PUBLIC_SEPOLIA_RPC_URL`
- `NEXT_PUBLIC_WHITECHAIN_RPC_URL`
- `NEXT_PUBLIC_WHITECHAIN_EXPLORER_URL`
- `NEXT_PUBLIC_ENS_UNIVERSAL_RESOLVER`
- `NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL`

Server configuration:

- `VESTIGE_DB_PATH`, `VESTIGE_AUTH_DOMAIN`, `VESTIGE_AUTH_URI`
- `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`, `WORLD_ENVIRONMENT`, `WORLD_PROTOCOL_VERSION`
- `SEPOLIA_RPC_URL`, `WHITECHAIN_RPC_URL`, `WHITECHAIN_EXPLORER_URL`
- `VESTIGE_ENS_PARENT`, `VESTIGE_PARENT_REGISTRY`, `VESTIGE_ENS_EXPIRY`
- `VESTIGE_ATTESTER_PRIVATE_KEY` and `ENS_REGISTRAR_PRIVATE_KEY` (server-only, separate keys)
- `VESTIGE_DEPLOYMENT_MANIFEST_PATH`
- `RELAYER_ENABLED`, `RELAYER_JOURNAL_PATH`, `RELAYER_KEYSTORE_PATH`, `RELAYER_KEYSTORE_NAME`, `RELAYER_DAILY_WBT_BUDGET_WEI`, `RELAYER_MAX_GAS_LIMIT`, `RELAYER_MAX_FEE_PER_GAS_WEI`, `RELAYER_L1_FEE_RESERVE_WEI`, `RELAYER_MIN_BALANCE_WEI`, `RELAYER_MAX_PER_MINUTE`, `RELAYER_ALERT_WEBHOOK_URL`

The env max-fee field maps to the current service `maxGasPrice` bound, not a promise of EIP-1559 total-fee coverage. Signature, chain-domain and manifest checks remain mandatory. Browser RPC URLs must contain no private provider credentials. Static Guard/Registry/token addresses come from the manifest, replacing C2's proposed per-address public env vars; rejected-attempt evidence belongs in receipt-backed evidence records. `NEXT_PUBLIC_VESTIGE_ADAPTER=mock` is development-only and must be rejected or forced to live in production. Secret fields have no `NEXT_PUBLIC_` equivalent.

Deployment-only public inputs, never founder secrets: `DEPLOYER_ADDRESS`, `ATTESTER_ADDRESS`, `SEAT_REGISTRY_ADDRESS`, `SAFE_SETUP_ADDRESS`, `EXPECTED_REGISTRY_CODEHASH`, `EXPECTED_SETUP_CODEHASH`, `TREASURY_SALT`, `VENTURE_ID`, `FOUNDER_A_ADDRESS`, and `FOUNDER_B_ADDRESS`.

## Change control

`CR-###: FROM → TO | PURPOSE | AFFECTED OWNERS | MIGRATION | EVIDENCE | H: APPROVED/REJECTED`. No agent may widen a locked signature, route, schema, environment name, or security invariant without a new accepted CR.
