# C2 shared change proposals for H acceptance (2026-11-07)

Format per CONTRACTS change control. Each proposal is backed by a run against current owner code: C1 `a00016b`, X `4d44fa8` (same code as `1d2ff44`).

## Withdrawn

- **CR-C2-007 (listing `optedIn`) — WITHDRAWN.** C2 now consumes C1's shipped shape exactly: `venture.listing = { listed: boolean, consents: { wallet, listed }[] }`. C1's `POST …/listing` returns the same object, and C2 refetches the venture. Verified in the cross-owner run, step 3, and in the integration E2E (where the "2 of 2 founders agreed" text comes from C1). No shared change is needed.

## Open

### CR-C2-009 (revised, precise) — treasury readback that survives reload and a second founder

`CR-C2-009: GET /api/treasury/ventures/:id payments[] {paymentId,recipient,amountRaw,status,reason?} → add { safeTxHash, safeNonce, typedData, signerWallets[], operationId?, executedTxHash? }; operations[] → add { kind }; add evidence[] | PURPOSE: a payment proposal's exact Safe typed data and approval state exist only in the POST response today, so founder B (other browser) or any reload cannot approve; the UI cannot show who approved; the receipt-backed GS020 attempt has no record | AFFECTED: X (service.read), C2 (already consumes the fields) | MIGRATION: additive; C2 falls back to "not reported" | EVIDENCE: cross-owner step 8 (B → BLOCKED), step 8b (with exactly these fields injected into X's read(), B signs, READY 2/2, execute relays) | H: PENDING`

Exact JSON, owner-only fields marked:

```jsonc
"payments": [{
  "paymentId": "uuid", "recipient": "0x…", "amountRaw": "500000000",
  "status": "AWAITING_APPROVALS|READY|EXECUTED|FAILED",
  "reason": "…",                       // owners only (as today)
  "safeTxHash": "0x…32",               // = hashTypedData(typedData)
  "safeNonce": "0",                    // decimal string; stale nonce → status FAILED (as today)
  "typedData": { … },                  // owners only; byte-identical to treasury_payments.typed_json
  "signerWallets": ["0x…"],            // lowercase; from treasury_signatures
  "operationId": "uuid",               // execute operation, if any
  "executedTxHash": "0x…32"            // only after receipt + confirmation
}],
"operations": [{ "operationId": "uuid", "kind": "deploy|fund|payments|sign|execute", "status": "RESERVED|UNKNOWN|SUBMITTED|EXECUTED|FAILED", "txHash": "0x…?", "blockNumber": "…?", "blockHash": "0x…?", "source": "TESTED_IN_SIMULATOR|WORLD_PRODUCTION|UNKNOWN", "error": "CODE|null" }],
"evidence": [{                         // receipt-backed only; never written from a simulation
  "kind": "REJECTED_ATTEMPT", "chainId": 1874, "txHash": "0x…32",
  "blockNumber": "…", "blockHash": "0x…32", "status": "FAILED",
  "label": "CHAIN_VERIFIED", "source": "receipt status=0 + GS020 revert data"
}]
```

**No longer requested:** `balanceRaw`, `tokenDecimals` and `deposits[]`. C2 now reads the Safe's USDT balance and Transfer logs straight from Whitechain, from `deploymentBlock` in windows of 10k blocks or fewer, which is stronger evidence than an API echo.

### CR-C2-006 — World environment on seats and public founders (unchanged, still open)

`CR-C2-006: C1 FounderSeat + PublicIdentitySummary.founders[] → add worldEnvironment: "production"|"staging" | PURPOSE: CONTRACTS requires TESTED_IN_SIMULATOR on simulator results; C1 stores the environment (identity_world_nullifiers.environment) but does not expose it, so the founder and public pages must show "WORLD ENV NOT REPORTED" | AFFECTED: C1 | MIGRATION: additive | EVIDENCE: cross-owner step 4 (seat.worldEnvironment absent); X already derives the same value from C1's table into provenance.source = TESTED_IN_SIMULATOR (step 6) | H: PENDING`

### CR-C2-008 — manifest URL per venture (unchanged, still open)

`CR-C2-008: NEXT_PUBLIC_VESTIGE_DEPLOYMENT_MANIFEST_URL may contain "{ensName}" | PURPOSE: one URL lets only one venture ever verify ACTIVE | AFFECTED: C2, X/H publishing | MIGRATION: none for URLs without the token | H: PENDING`

### CR-ID-05 (C1's) — C2 position

C2 supports it. The list shows `null` as "Unknown", never as false (verified in the integration E2E).

## Root scaffold (H-owned; see `proposed-scaffold/INTEGRATION.md`)

`SCAFFOLD-C2-01`:
- Add `@worldcoin/idkit-core@4.6.0`, `qrcode@1.5.4` and `@types/qrcode@1.5.5`.
- Root `tsconfig` excludes `tests/identity` and `tests/treasury`.
- `.gitignore` adds `private/`, `tsconfig.tsbuildinfo` and `next-env.d.ts`.

Evidence: integrated typecheck, build and real-handler E2E all pass.
