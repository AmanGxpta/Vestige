# C1 Identity — Spike A/B report + first identity slice

**Role:** C1 (Claude Identity) · **Branch:** `agent/identity` · **Worktree:** `../vestige-identity`
**Date (UTC):** 2026-11-06 · **Interface version targeted:** CONTRACTS v0 (PROPOSED) + CRs below
**Code commit:** `8027b53` (this report is committed separately on top)

> Claim classes follow MASTER §11. Nothing in this report is `VERIFIED_ON_CHAIN` for a vestige write yet: **no ENS write and no World proof has happened.** Both are blocked on human actions (see "Commands/actions for H").

---

## 0. Housekeeping found on start (needs H attention)

- **Worktree link was broken.** `.git` pointed at `…/vestige-main/.git/worktrees/dayzero-identity`. The main repo is now `…/vestige/vestige` and worktrees were renamed `dayzero-*` → `vestige-*`. I ran `git -C ../vestige worktree repair "$PWD"` for **my worktree only**. The **product and treasury worktrees are still broken.** H should run `git -C vestige worktree repair ../vestige-product ../vestige-treasury`. Branch names are unchanged.
- **Master docs show uncommitted modifications in this worktree:** `MASTER_TEAM_INSTRUCTIONS.md`, `docs/PRD.md`, `docs/CONTRACTS.md`, `agents/*.md`, `scripts/setup-worktrees.sh`, among others. They aren't my edits; they look like H's newer copies. I read the working-tree versions, **did not stage or commit them**, and every commit stages explicit paths only.
- **No app scaffold exists** (no root `package.json`/tsconfig/Next.js). Because root configs are H's, I put a **temporary, self-contained test harness** in `tests/identity/` (`package.json`, `vitest.config.ts`, `tsconfig.json`, lockfile) with pinned deps. H should fold these deps into the root package and delete the harness: `viem@2.57.7`, `@worldcoin/idkit-core@4.6.0`, `vitest@4.1.12`, `typescript@5.9.3`, `@types/node@24.9.1`. All are ≥14 days old except idkit-core 4.6.0 (published 2026-10-21, 16 days).
- DB: H hasn't picked an engine. I used Node's built-in `node:sqlite` (Node v26.10.0, no native dependency) behind a small `SqlDb` port. The migrations are portable SQL.

---

## 1. SPIKE B — World ID per-venture uniqueness (CONFIRMED from docs + portal source; NOT yet live-tested)

### Sources read with Claude in Chrome (read-only)
| Source | What it established |
|---|---|
| https://docs.world.org/world-id/idkit/integrate | IDKit **4.x**. Server signs each request with `signRequest({signingKeyHex, action})`. Verify by forwarding the IDKit result to `POST https://developer.world.org/api/v4/verify/{rp_id}`. Check `environment`. **"Your backend must check that the nullifier hasn't been used before."** |
| https://docs.world.org/world-id/idkit/signatures | The RP signature message is `0x01‖nonce‖created_at‖expires_at‖hash_to_field(action)`. **`action` is any UTF-8 string signed per request.** It isn't part of any portal registry. |
| https://docs.world.org/world-id/concepts | Nullifier = f(user, app/rp, **action**) |
| https://docs.world.org/api-reference/developer-portal/verify | Request schema, including optional `action_description` |
| `worldcoin/developer-portal@main` `web/api/v4/verify/uniqueness-proof/handler.ts` | **(1) Unknown actions are auto-created** ("Keep dynamic actions"). **(2) A reused nullifier returns `success:true` with "nullifier reuse".** |
| same repo `request-schema.ts`, `verify-v4.ts` | Proofs are verified against the **client-supplied** `action` and `signal_hash`. Issuer 1 = proof_of_human; faux issuer 128 is accepted only in staging/sandbox. `min_protocol_version` is RP-controlled. |
| https://registry.npmjs.org/@worldcoin/idkit-core/latest | Current version **4.6.0** |
| `worldcoin/idkit` `rust/core/src/types.rs`, `crypto.rs` (search results) | `hashSignal` decodes valid even-length `0x` hex strings as raw bytes, so an address signal = `abi.encodePacked(address)` |
| https://docs.world.org/world-id/sandbox/what-is-sandbox | Sandbox accounts are **resettable** and are "not a source of real uniqueness" |

### Findings
1. **The PRD hypothesis `vestige-founder-seat:<ventureId>` works** in IDKit 4.x. Actions are dynamic, signed per request by our RP key, and auto-created on first verify. No portal pre-registration is needed. — `VERIFIED_OFF_CHAIN` (docs + source code), **not yet exercised live**.
2. **World does NOT refuse duplicates.** The portal returns `success:true` for a reused nullifier, so the duplicate-human refusal is **entirely our backend's job**. Implemented as `UNIQUE(venture_id, nullifier)` plus `UNIQUE(action, nullifier)` in `db/migrations/010_identity.sql`. — `IMPLEMENTED`, `MOCK_ONLY` test (ID-03).
3. **The portal verifies whatever `action`/`signal_hash` the client sends.** If our server forwarded the IDKit result as-is (as the docs example does), a proof made for *another* action or *another wallet* would verify. Our verifier therefore:
   - pins `action = vestige-founder-seat:<ventureId>` server-side;
   - recomputes `hashSignal(sessionWallet)` and compares it to the response's `signal_hash`;
   - forwards **exactly one** `proof_of_human` response (the portal returns the *first* success among many, so a weaker credential could otherwise be smuggled in);
   - sends its own `environment` and `min_protocol_version`, and drops `action_description`.
4. **Same human, different venture is allowed**, because the nullifier differs per action. — `MOCK_ONLY` test (ID-04).
5. 🔴 **SECURITY: pin exactly one protocol version.** World ID 3.0 (Semaphore) and 4.0 nullifiers come from different schemes. If both are accepted (`allow_legacy_proofs: true`, as the docs example sets it), **one human could plausibly produce a 3.0 nullifier and a 4.0 nullifier for the same action and take both seats.** This is a *high-confidence inference from the protocol design; I have not tested it.* Mitigation implemented: `WORLD_PROTOCOL_VERSION` (default `4.0`). Any other version is rejected with `WORLD_PROTOCOL_MISMATCH`, and `min_protocol_version` is sent to the portal. **Decision for H (D-004):** confirm 4.0-only and ask World DevRel whether Orb users can produce 4.0 PoH proofs in World App today. If not, switch to **3.0-only** for the event, never mixed.
6. **Replay defence:** the RP nonce is issued per (venture, wallet), stored, single-use, 5-minute TTL, and consumed *before* calling World. 4.0 binds the nonce in-circuit; under 3.0 the nonce is not bound, but signal binding plus nullifier uniqueness still make a replay useless.
7. **Staging caveat:** the simulator/sandbox issue faux-issuer (128) credentials and resettable accounts. A staging "duplicate refused" demo proves our **code path**, not real-world uniqueness. Label it `TESTED_IN_SIMULATOR`. A real denial needs **one real human with two wallets** on production (Orb/PoH).
8. **Privacy:** nullifiers are stored as decimal strings (per World docs) and never returned by any API. The public summary test asserts this.

### Proposed product decision (no change needed to the PRD's FR-2 wording)
- Use the dynamic action as specified. Enforce `4.0`-only (or `3.0`-only). The backend is the sole uniqueness authority. The on-chain SeatRegistry is a second, attester-trusted layer (X).

---

## 2. SPIKE A — ENSv2 on Sepolia (CONFIRMED from docs + live read-only RPC; NO write yet)

### Sources read with Claude in Chrome
- https://docs.ens.domains/ensv2/permissioned-registry/ — roles table, register signature, transfers, emancipation
- https://docs.ens.domains/ensv2/permissioned-resolver/ — DNS-encoded setters, record roles, `initialize(grants, calls)`
- https://docs.ens.domains/ensv2/verifiable-factory — `deployProxy`, salts, CREATE2 prediction
- https://docs.ens.domains/ensv2/subnames — topologies; "use a resolver they control" so subname owners can write their own records
- https://docs.ens.domains/ensv2/eth-registrar — commit/reveal, ERC20 payment
- https://docs.ens.domains/learn/deployments — Sepolia (ENSv2) addresses

### Live RPC evidence (read-only, `https://ethereum-sepolia-rpc.publicnode.com`, 2026-11-06T07:42Z, block **12075162**)
Test `tests/identity/live/ens-sepolia.live.test.ts` (4/4 pass) output:
```
{"chainId":11155111,"block":"12075162","codeBytes":{"ETHRegistry":16000,"ETHRegistrar":8037,"RootRegistry":16000,"VerifiableFactory":1524,"PermissionedResolverImpl":15608,"UserRegistryImpl":18982,"UniversalResolverV2":18792,"UniversalResolverProxy":2491,"MockUSDC":4309}}
{"vestigeEthStatus":"AVAILABLE","ethRegistryEmancipated":true,"proxyLogic":"0xC41576B4B809B99CF0fF2e5B41b4F147cd9b6BDd"}
{"nonexistentNameResolution":null}
```
Additional `cast` reads at block `0xb8404c`:
- `ETHRegistrar.isAvailable("vestige") = true`
- `getRegisterPrice("vestige", 31536000, MockUSDC) = (8000021, 0)` → **8.000021 MockUSDC** (6 decimals) for 1 year
- `rentPriceOracle().isPaymentToken(MockUSDC) = true`
- `MIN_COMMITMENT_AGE = 60`, `MIN_REGISTER_DURATION = 2419200` (28 days)
- MockUSDC bytecode contains the `mint(address,uint256)` selector. That's probably a public faucet mint; H should confirm before relying on it.
- Selector check: all 17 functions we encode exist in the deployed bytecode (register, initialize×2, setSubregistry, revokeRootRoles, grantRootRoles, unsafeTransfer, setParent, getStatus, roles, setAddress, setText, resolve, multicall, grantSetterRoles, deployProxy, verifyContract).

### Addresses (Sepolia ENSv2) — encoded in `src/modules/identity/config.ts`
| Contract | Address |
|---|---|
| ETHRegistry | `0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4` |
| ETHRegistrar | `0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3` |
| VerifiableFactory | `0xda70306c98e97ece36f997a21368e53298572991` |
| PermissionedResolverImpl | `0x115eb53f0c60696633855f90b138178fb40b2b2c` |
| UserRegistryImpl | `0x9bd8a88719068d09ecee662f36c0e3856708366a` |
| UniversalResolverV2 | `0x24e1d8e068620b647ca097f961a61055f4f42d72` |
| Universal Resolver proxy (viem default) | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |
| MockUSDC (registration payment) | `0x240b0316df57887dbbe58b586508b19e633a14aa` |

### Findings
1. ENSv2 is live on Sepolia, and the Sepolia ENS app and Universal Resolver use it. — `VERIFIED_ON_CHAIN` (code present, reads succeed).
2. **`vestige.eth` is unregistered (AVAILABLE).** H must register it (commit, wait ≥60s, register; paid in MockUSDC). — `BLOCKED (human)`.
3. **ENSIP-11 is supported** by the Permissioned Resolver: `setAddress(dnsName, 2147485522, bytes20)` writes it, and it's read via `addr(node, coinType)` through the Universal Resolver. — docs-confirmed; **live write pending**.
4. **Setters take DNS-encoded names** (`packetToBytes`), not namehashes. Implemented.
5. **Non-transferable founder subnames are enforceable at the contract level, not just hidden in the UI.** A token transfer requires `ROLE_CAN_TRANSFER_ADMIN` on the *owner* (reverts `TransferDisallowed`). Name-level admin roles can only be granted at registration. Operator approval inherits the owner's roles, so it can't bypass this either. We register founders with `roleBitmap = 0`. — docs-confirmed; **needs a live `unsafeTransfer` revert test once a name exists.**
6. 🟠 **PRD gap — "each founder can edit only their own founder subname's text records":** resolver roles have **no per-name scoping**. A `ROLE_SET_TEXT` holder can write every name served by that resolver instance. The only correct design is **one Permissioned Resolver proxy per founder**, with the founder as the sole grantee. (The ENS prize text names this pattern explicitly: "Give subnames their own Permissioned Resolver so they fully own their data.") → **CR-ID-01**.
7. 🟠 **PRD gap — "revocable only by venture governance, not by vestige":** venture governance (the Safe) lives on Whitechain and has no Sepolia address. Proposed weekend design: the venture registry is initialized with the registrar holding **only `ROLE_REGISTRAR | ROLE_RENEW`** (operational, non-dangerous), so the registry is **emancipated from block one**. Neither vestige nor anyone else can unregister, re-point, transfer or upgrade founder names until expiry. Honest claims to make: "non-transferable; **not revocable by vestige**; revocation by governance = stretch (needs a Sepolia governance address holding `ROLE_UNREGISTER`)". **Disclosed residual power:** the `vestige.eth` parent-registry operator (our registrar) can still re-point or unregister the *venture* name until handover.
8. Token IDs are mutable in ENSv2 (they regenerate on role changes), so we never persist token IDs as identity. We key on labels and names.

---

## 3. ETHGlobal Mumbai prize check (Claude in Chrome, https://ethglobal.com/events/mumbai/prizes, read 2026-11-06)

| Track | Live requirement | Our status |
|---|---|---|
| **ENS — Best Use of ENSv2, $7,000** (3k/2k/1k/1k) | ENSv2 on mainnet **or Sepolia**; central, not cosmetic; no hard-coded values; live demo link; open source. The prize text explicitly praises *own subname registry*, *EAC to let an account edit only certain text records*, *subnames with their own Permissioned Resolver*, *non-transferable / revocable* setups. | ✅ Aligned. CR-ID-01 makes us match the prize text even more closely. |
| **World — Best Use of IDKit, $2,500** (up to 2 × $1,250) | IDKit in a working app; verify on server; explain the trust moment and why the credential is the **minimum sufficient**; success path + one alternative path (cancel/reject/ineligible); debrief (time to first success, friction, missing docs, top improvement). | ✅ Aligned (PoH, server verify, duplicate/cancel paths). `WORLD_FEEDBACK.md` is still to write after the first live proof. |
| World — **Agent Pass, $5,000** (2.5k/1.5k/1k; non-Continuity) | Integrate the official Agent Pass; full journey including a denied path; "proofs are mocked now". | ⚠️ Bigger pool than IDKit; it's the PRD's stretch #3. **H decision**: whether the 2-of-2 payment approval should use Agent Pass. It probably counts as the same "World" partner pick, so check. |
| **Whitechain — Scale: Payments Nobody Notices, $3,000** (2k/1k) | Contracts deployed and verified on 1874; ≥1 payment in the official USDT `0xcedf…55a7` (self-minted tokens don't count); README "why on-chain"; steady commits; 2–4 min video showing each party; `WHITECHAIN_FEEDBACK.md`; payer has zero crypto steps; explain relayer gas source and drain protection. **Won't place:** payer signs a gas-costing tx. | ✅ Aligned (X's scope). Note for X/H: founders' Safe approvals must be off-chain signatures. The GS020 on-chain attempt is a separate test-wallet demo of the *failure*, not the payer flow. |
| Whitechain — Operate $5k | "Won't place: payroll, escrow and revenue splits on their own." | Correctly not targeted (PRD agrees). |
| Partner picks | Page text: "…does not use another of your **three picks**". | ✅ PRD's ENS + Whitechain + World = 3 picks. |
| Finalist | Per person: solo 250 USDC; 2 people 250 + 250 travel; **3–5 people 1,000 + 500 travel**. | PRD's "$1k per person plus $500 travel" holds only for 3–5-person teams. |

---

## 4. What changed (code)

| Path | Purpose |
|---|---|
| `src/modules/identity/world.ts` | RP-signed IDKit request params; hardened `verifyWorldProof` (pins action, signal, environment, protocol; one PoH response; nullifier consistency) |
| `src/modules/identity/ventures.ts` | Venture create (server `ventureId`, slug, ENS name), single-use hashed invites, join, World request/verify, duplicate gate, attestation via port, ENS sync after receipt + read-back |
| `src/modules/identity/auth.ts` | EIP-4361-style single-use challenge → bearer session (hashed at rest) |
| `src/modules/identity/ens/encoding.ts`, `ens/registrar.ts` | ENSv2 ABIs, roles, DNS encoding, salts, CREATE2 prediction, `ViemEnsRegistrar` (simulate → send → receipt), `EnsReader` (Universal Resolver incl. ENSIP-11) |
| `src/modules/agreements/*` | Canonical JSON → keccak docHash; EIP-712 `FoundingTerms` (PRD domain/type); versioning; nonce/expiry/signer checks; ENS `vestige.agreement` after full signing |
| `src/modules/identity/public.ts` | Non-PII public summary (no text, nullifiers, invites) |
| `src/modules/identity/ports.ts` | `SeatAttestationPort` (X seam), `EnsPort`, fail-closed `UnconfiguredPort` |
| `src/modules/identity/http.ts`, `container.ts`, `app/api/identity/**`, `app/api/agreements/**` | Framework-neutral handlers + thin Next.js App Router routes (Next 15 async `params`) |
| `db/migrations/010_identity*.sql` | Identity + agreement tables; unique nullifier/nonce indexes; provenance columns |
| `tests/identity/**` | 46 unit/route tests + 4 live read-only tests; DEV MOCK World portal modelling the real portal's reuse behaviour |

## 5. Tests + actual output

`cd tests/identity && npm test` → **Test Files 4 passed | 1 skipped; Tests 46 passed | 4 skipped (50)**. The skipped tests are the live suite, which runs only with `VESTIGE_LIVE=1`.
`npm run test:live` → **4 passed** (output in §2). `npm run typecheck` → clean (0 errors).
Lint: **NOT RUN.** There's no lint config yet (H owns root config).

Every World test uses the **DEV MOCK** portal, so claim class `MOCK_ONLY` for World behaviour and `IMPLEMENTED_NOT_TESTED` (live) for ENS writes.

Mapping to TEST_MATRIX: ID-01 (logic ✓, live ✗), ID-02 (logic ✓), ID-03 (logic ✓), ID-04 (logic ✓), ID-05 replay/invalid/null/cancel/expired/wrong-wallet/wrong-venture/env/protocol (logic ✓), ID-06 (logic ✓; ENS write live ✗).

## 6. Evidence URLs / tx hashes
- No vestige transactions yet. Read-only evidence: Sepolia block 12075162 (output above).

---

## 7. Decisions + CONTRACT CHANGE REQUESTS (H approval required; `docs/CONTRACTS.md` NOT edited)

**CR-ID-01 — ENS topology and founder resolvers**
FROM: CONTRACTS v0 is silent; PRD says "EAC: each founder can edit only their own subname's text records".
TO: `vestige.eth` → parent UserRegistry (H-deployed; registrar has `ROLE_REGISTRAR`). Each venture gets its **own UserRegistry** (registrar root roles `REGISTRAR|RENEW` only → emancipated) and its **own PermissionedResolver** (registrar `SET_TEXT|SET_ADDRESS`, no LINK/UPGRADE). Each founder subname has `roleBitmap 0` and its **own PermissionedResolver** whose only grantee is the founder (`SET_TEXT|SET_ADDRESS`), initialized with `addr(60) = founder wallet`.
PURPOSE: makes the PRD claim true at the contract level; matches the ENS prize text. AFFECTED: C1 only (C2 reads via Universal Resolver, unchanged). COST: 2 txs per venture + 2 per founder from the registrar (gas on Sepolia). EVIDENCE: §2.

**CR-ID-02 — Additional C1 endpoints and seat fields**
New routes (all within C1-owned paths, C2 must not depend on them until approved):
- `POST /api/identity/auth/challenge {wallet}` → `{nonce, message, expiresAt}`
- `POST /api/identity/auth/session {nonce, signature}` → `{token, wallet, expiresAt}`. All writes require `Authorization: Bearer <token>`; client `founderWallet` is ignored.
- `POST /api/identity/ventures/:id/invites` → `{inviteToken}` (single-use, returned once)
- `POST /api/identity/ventures/:id/world/request` → IDKit params `{app_id, action, environment, signal, allow_legacy_proofs, preset, rp_context}`
- `GET /api/agreements/ventures/:id/sign?nonce=&expiry=` → exact EIP-712 typed data to sign

Contract input shapes: `ventures` `{name, slug?, founderLabel}`; `join` `{inviteToken, founderLabel}`; `world/verify` `{idkitResult}`; `sign` `{version, nonce, expiry, signature}`. `founderSeat` gains `founderLabel` and `subnameStatus` (read-status enum). Errors are `{error:{code,message}}` with the stable codes in `src/modules/identity/errors.ts` (e.g. `DUPLICATE_HUMAN` 409 → "This human already holds a seat in <Venture>.").

**CR-ID-03 — SeatAttestationPort (X seam)**
`attestSeat({ventureId, wallet, nullifierHash}) → {txHash, chainId}` and `confirm({ventureId, wallet, txHash}) → PENDING | CONFIRMED{chainId, blockNumber, confirmedAt} | FAILED{reason}`. CONFIRMED means **receipt success + `SeatRegistry.isSeat` read-back**. X implements it in `src/modules/treasury` and registers it via `registerSeatAttester()` (`src/modules/identity/container.ts`). Until then the port fails closed and the on-chain seat stays `FAILED/UNVERIFIED`.

**CR-ID-04 — What goes on-chain as `nullifierHash`** (X + H)
Current code sends the raw nullifier as bytes32. Proposal: send `keccak256(abi.encode(uint256 nullifier))` instead. It's just as unique per venture, and avoids publishing the raw World nullifier on Whitechain. X's `attestSeat` uniqueness check is unaffected. One-line change in `nullifierToBytes32` once agreed.

**D-004 (World) — proposed resolution:** dynamic per-venture action ✅; **single protocol version** (4.0 default, else 3.0, never mixed) ✅; backend nullifier index is the uniqueness authority ✅; staging duplicate demo labelled `TESTED_IN_SIMULATOR`.

**Proposed env names for `.env.example` (H):** `VESTIGE_DB_PATH, VESTIGE_AUTH_DOMAIN, VESTIGE_AUTH_URI, WORLD_APP_ID, WORLD_RP_ID, WORLD_RP_SIGNING_KEY (secret), WORLD_ENVIRONMENT, WORLD_PROTOCOL_VERSION, SEPOLIA_RPC_URL, ENS_REGISTRAR_PRIVATE_KEY (secret), VESTIGE_ENS_PARENT, VESTIGE_PARENT_REGISTRY, VESTIGE_ENS_EXPIRY`.

---

## 8. Remaining issues / risks
- No live World proof yet (needs portal app + RP key). No live ENS write yet (needs `vestige.eth`, parent registry, registrar key).
- The ENS sync steps run "deferred" in-process. A crash mid-sync leaves `PENDING`, and there's no retry job yet. Next: an idempotent `resync` endpoint/CLI.
- Signature verification is EOA-only (`verifyMessage`/`verifyTypedData`). Smart-account founders (ERC-1271/6492) need a public-client verifier; the seam exists via the `MessageVerifier`/`TypedDataVerifier` injection.
- Live test still to add: `unsafeTransfer` of a founder subname must revert `TransferDisallowed`, and the venture registry must report `isEmancipated() == true`.
- Hierarchy caveat (vestige.eth operator can re-point a venture) is disclosed, not solved. The governance handover is a stretch goal.

## 9. Sponsor-specific feedback (draft for WORLD_FEEDBACK.md / ENS write-up)
- **World:** (a) the docs' verify example forwards the client payload verbatim, but the portal verifies against client-supplied `action`/`signal_hash`. The docs should say plainly that the RP must pin both. (b) The portal returns `success:true` on nullifier reuse; that's documented only implicitly ("your backend must check"). (c) Mixing `allow_legacy_proofs` with 4.0 needs a warning about cross-protocol nullifiers. (d) Docs page text and llms.txt were easy to read; I found the action auto-creation behaviour only in the source code.
- **ENS:** (a) the docs are excellent and the deployments table is accurate on Sepolia (all code present). (b) "Resolver roles have no per-name scoping" is easy to miss and conflicts with a common product assumption. (c) Sepolia registration requires MockUSDC; the ETH-paying flow familiar from v1 is gone, which is worth flagging for hackers.

## 10. Commands / actions for H (human-only — please add to INSTRUCTION_FOR_HUMAN)
| ID | Crit | Action | Expected result / paste back |
|---|---|---|---|
| H-C1-01 | 🔴 | Repair the other worktrees: `git -C ../vestige worktree repair ../vestige-product ../vestige-treasury` | `git -C ../vestige-product status` works |
| H-C1-02 | 🔴 | World Developer Portal: create app (or click **Enable World ID 4.0**) → note `app_id`, `rp_id`; store the **signing key** as `WORLD_RP_SIGNING_KEY` in the local env/secret manager (never in chat). Confirm whether Orb users get **4.0 PoH** proofs today (World DevRel). | Paste back `app_id`, `rp_id` (not secret) and "4.0 available: yes/no" |
| H-C1-03 | 🔴 | Create a **registrar** Sepolia key (separate from deployer/attester/relayer), fund it with Sepolia ETH, put the key in `ENS_REGISTRAR_PRIVATE_KEY`. | Paste back the registrar **address** only |
| H-C1-04 | 🔴 | Register **`vestige.eth`** on Sepolia ENSv2 to the registrar address: ENS app (sepolia.app.ens.domains) or ETHRegistrar `commit` → wait ≥60s → `register`. Price ≈ **8.000021 MockUSDC** per year (MockUSDC `0x240b…14aa`; get it via the faucet/mint). Approve the spend first. | Paste back the register tx hash |
| H-C1-05 | 🔴 | Approve C1 to run, **from the registrar key**, the one-time parent setup: deploy the `vestige.eth` UserRegistry via VerifiableFactory and `setSubregistry` on ETHRegistry. Then run the **first live venture + founder write** (ID-01). This is a testnet tx; MASTER §0.6 requires your approval. | "Approved" + env set; C1 returns tx hashes + read-backs |
| H-C1-06 | 🟠 | Approve CR-ID-01…04 and D-004 (above) and lock the env names | Decision IDs |
| H-C1-07 | 🟠 | Two real humans with production World ID (Orb) for ID-02/03. For ID-03 the **same** human uses two different wallets. | Confirm availability |
| H-C1-08 | 🟡 | Decide whether to target World **Agent Pass ($5k)** in place of, or in addition to, IDKit (check the partner-pick rules) | Decision |

## 11. Next unblocked task
1. `resync` CLI/endpoint for PENDING ENS steps, plus a live script for H-C1-05 (parent registry setup) gated behind explicit env + `--i-have-approval`.
2. Live negative ENS test (`unsafeTransfer` → `TransferDisallowed`; `isEmancipated()`), runnable once the first name exists.
3. A minimal IDKit widget wrapper in `src/modules/identity` exposing props for C2, plus a draft `WORLD_FEEDBACK.md` after the first live proof.
