# X review — H's uncommitted wrapper/composition integration (main 4457e87 + dirty tree)

ROLE: X (treasury owner, now operated by Claude; same role and ownership)
BRANCH: agent/treasury. Main was inspected READ-ONLY; no main file was edited, copied, staged or reset.
STATE: owned fix IMPLEMENTED_AND_TESTED; H adoption pending. No signing, broadcast or funding.

## Reproduced failure

`cd ../vestige && node --test --test-name-pattern="Next route wrapper" tests/treasury/routes.test.mjs`
fails with `ERR_MODULE_NOT_FOUND: Cannot find package '@/src'` from
`app/api/treasury/ventures/[id]/payments/route.ts`, as H reported.

## Concrete findings beyond the alias

Using a scratch-only resolver + esbuild loader (not committed, not in main):

1. Alias alone is insufficient. `src/shared/composition.ts` imports the extensionless
   `../modules/identity/container`, and C1's `src/modules/agreements/service.ts` uses
   TypeScript parameter properties (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` under Node 26
   strip-only mode; `--experimental-transform-types` no longer exists in Node 26.10.0).
   A plain-Node treasury test cannot import the real composed wrapper without a TS transform.
2. Once loaded, the wrapper's `await services()` runs OUTSIDE `dispatchTreasuryRequest`'s
   fail-closed try/catch. Missing config throws `ROOT_CONFIG_REQUIRED` out of the route
   handler: Next returns a generic 500 instead of the stable
   `503 {error:{code:"TREASURY_UNCONFIGURED"}}`, and the raw error escapes the boundary.
3. Sticky rejection (observation, not changed): both `composition.ts` (`ready ??=`) and
   `root-composition.mjs` (`ready ||=`) cache a rejected readiness promise, so a transient
   startup failure (manifest read, C1 init) persists until process restart. This is
   fail-closed and acceptable for v0 only if documented in the runbook and alerted on.
   X did not change it because H's dirty edits overlap that function.
4. Minor: H's fallback summary uses `source:"UNKNOWN"`, while X's port uses
   `vestige-treasury:UNKNOWN`. Harmless, but C2 should not string-match either.

Reviewed and found consistent: `readbackVersion:1` wiring (read replaced; only the
`payments` creation result is projected; the projected value is what idempotency stores,
so replays return the same v1 shape); summary port uses `context()`, not `read()`, so it is
unaffected by the v1 read swap.

## Owned fix (additive, backward compatible)

`dispatchTreasuryRequest(request, action, params, prepare?)` — `prepare` is awaited after
the bearer-format pre-check and inside the existing fail-closed boundary. Existing three-arg
callers are unchanged. `routes.d.mts` updated accordingly.

Proposed H wrapper shape (H-owned decision; X did not edit main):

```ts
import { services } from "@/src/shared/composition";
import { dispatchTreasuryRequest } from "../../../../../../src/modules/treasury/routes.mjs";
export async function POST(req: Request, ctx: { params: Promise<{ id: string; pid?: string }> }) {
  return dispatchTreasuryRequest(req, "deploy", await ctx.params, services);
}
```

For the plain-Node wrapper test, H chooses one: (a) run the composed-wrapper test under the
root vitest runner (handles `@/` and TS), keeping X's Node test on dispatch only; or
(b) X replaces its actual-wrapper import with a dispatch+prepare test once H's wrapper is
committed. X will not change the wrapper test before H's integration commit.

## Evidence

- Red: `2026-11-07-09-prepare-red.txt` (new test: 200 !== 503).
- Green: `2026-11-07-09-prepare-green.txt` — `npm test --prefix src/modules/treasury`: 82 pass, 0 fail.
- `forge test`: 33 passed, 0 failed, 1 opt-in fork test skipped (unchanged contracts).
- Scratch e2e against H's actual uncommitted composition source: with `prepare`,
  `503 TREASURY_UNCONFIGURED`; bare `services()` throws `ROOT_CONFIG_REQUIRED`.

Local/unit results only. No live receipt, deployment, attestation, payment or GS020 claim.
