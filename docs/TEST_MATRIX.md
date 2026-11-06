# Test Matrix (evidence ledger)

All statuses start `NOT_RUN` and change only after H observes evidence.

| ID | Scenario | Owner | Expected | Status | Evidence link / commit |
|---|---|---|---|---|---|
| ID-01 | New venture ENS name not hard-coded | C1 | Actual name resolves on Sepolia | NOT_RUN | |
| ID-02 | Two distinct founders verified | C1 | Two valid World proofs / seats | NOT_RUN | |
| ID-03 | Same human in second seat denied | C1 | Backend denies, seat empty, unchanged registry | NOT_RUN | |
| ID-04 | Same human across different venture | C1 | Allowed according to PRD | NOT_RUN | |
| ID-05 | Cancelled/invalid/replayed World proof | C1 | Safe and unambiguous error; no attestation | NOT_RUN | |
| ID-06 | Two signed terms, edit and invalidate | C1 | Current signatures only; ENS hash updated | NOT_RUN | |
| CT-01 | Non-attester cannot attest seat | X | Foundry revert | NOT_RUN | |
| CT-02 | Duplicate nullifier denied | X | Foundry revert | NOT_RUN | |
| CT-03 | Unknown owner change denied | X | Foundry revert | NOT_RUN | |
| CT-04 | Guard removal and replacement blocked | X | Foundry revert | NOT_RUN | |
| CT-05 | Threshold downgrade and module bypass blocked | X | Foundry revert | NOT_RUN | |
| CT-06 | Unsafe delegatecall/MultiSend bypass blocked | X | Foundry revert | NOT_RUN | |
| TR-01 | Safe 2 owners threshold 2 Guard readback | X | Real chain contract reads | NOT_RUN | |
| TR-02 | Test USDT EIP3009 payer-signed transfer | X | Actual funded Safe receipt, no payer WBT | NOT_RUN | |
| TR-03 | Relayer allowlists/rate limit/budget/nonce | X | Negative tests prove restrictions | NOT_RUN | |
| TR-04 | One-signer relayer refusal | X | `eth_call` rejection, no relayed tx | NOT_RUN | |
| TR-05 | One-signer on-chain failed transaction | X/H | Mined reverted tx, GS020 trace | NOT_RUN | |
| TR-06 | Two-signer payment | X | Payee gets test USDT, receipt verified | NOT_RUN | |
| UX-01 | Founders, funder, payee, public verifier flows | C2 | Screen recording, no mock success | NOT_RUN | |
| UX-02 | Public evidence via ENS → Whitechain | C2 | Read chain directly, show signatures provenance | NOT_RUN | |
| UX-03 | Error, pending, failure, privacy/legal banners | C2 | Browser e2e assertions | NOT_RUN | |
| GTM-01 | Real teams onboarded | H | Consented verifiable ventures, not just sign-ups | NOT_RUN | |
| GTM-02 | Independent program feedback | H | Named quote only with approval | NOT_RUN | |
| SUB-01 | Prizes and submission evidence complete | H | README, video, explorer links, feedback | NOT_RUN | |
