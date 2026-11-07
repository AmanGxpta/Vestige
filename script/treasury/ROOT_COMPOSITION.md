# Exact H root composition — current C1 991f524, C2 4742566, X branch

H owns root scaffolding and authoritative contracts. This is a copy/review plan;
X has not edited C1/C2/root-owned files. All three ACKed v0 @30d1ef6. CR-X-002
is a separate pending payload decision, not an ACK already accepted by H.

## Required integration inputs

Merge reviewed owned changes from C1 991f524, C2 4742566 and the X handoff into
H's integration checkout. Reconcile each sibling's H-owned doc copies first; do
not commit those copies or silently resolve owner conflicts. Pin root viem to
2.57.16 as approved; adopt C2's proposed Next/TypeScript scaffold through H.
No harness dependencies are required at root merely to serve X: esbuild/IDKit
in X's devDependencies exist to test pinned cross-owner source, not load credentials.

Use ONE persistent private VESTIGE_DB_PATH on ONE host. Its directory is operator-only;
coordinate SQLite/WAL and relay journal backups. Do not use ephemeral/serverless replicas.
C1 SqliteDb sets WAL, foreign keys and busy_timeout=5000. No X shared-base schema exists.
Migration order on the same connection:
1. C1 migrateIdentity: 010_identity.sql, 010_identity_agreements.sql,
   010_identity_v0_followthrough.sql (actual C1 defaults).
2. X TreasuryStore.migrate: 020_treasury.sql, 020_treasury_readback.sql.
Both use additive CREATE IF NOT EXISTS. H-owned future 000_* migrations, if any,
run first under H's convention; do not invent them or edit identity tables from X.

## Root module H creates: src/shared/composition.ts

```ts
import { createRootComposition } from "../modules/treasury/root-composition.mjs";
import { getIdentityServices, registerSeatAttester } from "../modules/identity/container";

const root = createRootComposition({
  identityModule: { getIdentityServices, registerSeatAttester },
  env: process.env,
});
export const services = () => root.ready();
```

Every C1 and X wrapper must await this SAME services() before dispatching. Do not
call C1's getIdentityServices earlier or reset registerSeatAttester afterward: it
clears C1's singleton. The composition registers a fail-closed forwarding port first,
gets the actual C1 DB/auth once, migrates X on that exact DB object, loads reviewed
manifest/ABIs, constructs the disabled X port/relay, then attaches the forwarding port.
No second SQLite connection/session namespace is opened by this composition.

For a C1 wrapper, H/C1 adapt its existing thin wrapper, e.g. create venture:

```ts
const { identity } = await services();
return handlers(identity).createVenture(req);
```

For X wrappers, H uses the current dispatcher after initialization:

```ts
await services();
return dispatchTreasuryRequest(req, "payments", await ctx.params);
```

Use existing exact relative/root aliases for the wrapper location; the module paths
above are for src/shared/composition.ts. Do not import server modules into C2 views.
Actual C1 handlers + session creation/revocation and exact shared DB are exercised by
`tests/treasury/cross-owner.test.mjs`. C2's fetch bridge adds only browser Origin;
it does NOT inject auth/idempotency headers or replace the C1 session service.

## Authentication and startup failure

X calls C1 AuthService.authenticate through c1SessionAuthentication. Bearers stay in
C2 memory and SHA-256 at rest; logout/revocation works through the same session table.
Trusted VESTIGE_AUTH_DOMAIN/URI come from server configuration, never Host headers.
HTTPS is mandatory outside localhost. Invalid session remains UNAUTHENTICATED/401;
configuration failure is unavailable, never an ACTIVE treasury or a successful write.
Do not log env, headers, signed payloads or full errors containing RPC inputs.

## Manifest and disabled signing defaults

Set the approved VESTIGE_DEPLOYMENT_MANIFEST_PATH only when genuine reviewed
InfrastructureManifestV1 or DeploymentManifestV1 exists. Do not place a placeholder
Safe/Guard in infrastructure. The loader checks schema/ABI hashes/path confinement;
chain readback checks actual receipts, code, initializer and canonical block provenance.
Missing manifest yields UNKNOWN and unconfigured ports; it never fabricates deployment.

Current composition is READ_ONLY: no keystore/private-key loader, no attester signer,
no relay signer, authorizeSend=false, and no reviewed fee policy. RELAYER_ENABLED=true
alone cannot enable a transport. Keep RELAYER_ENABLED=false throughout integration.
Actual attester submission later requires H-approved signer, registry bytecode/address,
exact narrow call and explicit authorization. C1 supplies only the approved hashed
nullifier digest; it never sends a raw nullifier to X. Source stays staging-qualified.

After a complete live fee/signer/alert review, H can compose a separately approved
createReviewedRelayer with opaque signer callbacks; this read-only bootstrap does not
automatically gain that authority. See proposed-operator-bounds.json and RUNBOOK.

## Pending payload and C2 caller changes

Do NOT install readback-payload.mjs as the endpoint response until H accepts CR-X-002
(spec SHA-256 4360cfa0f61691a28bc14f3852a8a1a826a5ed9897456081774475bf65f64b77).
Current default service remains v0/flat. The isolated candidate test subclasses it;
its success is not a claim that the current endpoint or C2 branch was silently changed.

C2 already fixed optional bearer GETs and approval idempotency at ef9e3be. Its
current 4742566 adapter supports flat v0 and reloadable draft data, but retains a
legacy tab-only typedData cache and drops relay/depositsStatus in its mapper.
`2026-11-07-c2-treasury-caller.patch` is now a payload-adoption candidate against
4742566: canonical safeTypedData, no tab cache, nullable relay, and depositsStatus.
C2 must review the patch and align its types/UI (including nullable terminal data,
relay lifecycle, string evidence blocks and visible partial-history status). The
harness tests actual current baseline and exact patched source, without editing C2.
No C2 source/ACK or H acceptance is implied by these isolated tests.

## CR-ID-05 implementation and registration gate

H approved the signature at main b67de31 / D-025 (reviewed through 0e06e8a).
X ACKs that signature and implements summary-port.mjs with fresh invariant readback,
block-pinned decimals/balance, reorg checks and null for unavailable observations.
A confirmed zero balance is false; a failed read is null. Staging source remains explicit.

Do not inject it through C1 private state: actual 991f524 getIdentityServices
constructs VentureService without the optional treasury dependency, and exports
no summary registration hook. C1/H must wire that already-approved port (preserving
the same DB/auth/services lifecycle). Current root passes no TreasurySummaryPort;
the actual C1 test proves both booleans null. Report 05 also records observation-time
semantics to settle for cached values. C1's outer verificationStatus intentionally
means ENS status; replacing it with treasury ACTIVE would require a contract change.
CR-X-002 acceptance is separate. CR-C2-006 is now H-approved; CR-C2-007 is
withdrawn/resolved, and CR-C2-008 remains pending.

## Cross-owner reproducibility

```sh
npm ci --prefix src/modules/treasury --ignore-scripts
npm test --prefix src/modules/treasury
```

Git objects for pinned C1 991f524ebab059337b953cc3c142c5c5aa330632 and C2
474256609570ba11085701f5db107127deaef780 must exist (fetch those owner branches
if using a shallow CI checkout). The harness archives only tracked source/migrations
into an ignored cache, bundles TypeScript and uses real C1 auth plus SQLite. It never
loads sibling .env.local or edits sibling worktrees. For bundled C1 db.ts, import.meta.url
is preserved as its archived source path so its actual default migrations resolve.
Root Next integration/build and real-wallet smoke tests remain H/C1/C2 acceptance gates.
