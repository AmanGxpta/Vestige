# Approved P1 and product integration

User explicitly approved ENS parent P1 in chat. Approved plan SHA-256:
`1471c7880a7d7b89931c2320e6ce4cce252234c9164df8b01d4fec9b1e49576a`.

P1 Sepolia transaction: `0x3a32aca8086f8c8bcc3d4026e98e5caea28cf921259d39e5d87d753c1b30e151`.
Receipt status 1, waited for two confirmations; code present at
`0x61Dc50fE2099012bD1d0A684192071Ef51d7Aa73`.
Independent `roles(0, registrar)` read returns 65537 (REGISTRAR|RENEW).
Public receipt is `ens-p2/p1-receipt.json`. No P2 was sent.
Registrar signed through its encrypted Vestige keystore with password loaded from
macOS Keychain into an ephemeral mode-600 password file, removed afterward.

Product committed handoff 4742566 and treasury committed preparation 10af504 are
merged into main. Product worktree has further uncommitted UI edits, preserved;
these are not included in this accepted handoff. Root layout adopts AppShell/CSS,
root test config and Playwright dependency are installed.

Verification: integrated root typecheck PASS; product unit tests 100 PASS / 1 skipped;
Next production build PASS (19 API routes and product pages). Actual integrated-root
browser E2E on localhost:3202 PASS: real auth/venture/invite/listing handlers, World
staging prompt, UNKNOWN treasury, real unresolved Sepolia venture read, logout.
The first E2E attempt reused the separate product DEV MOCK server on 3200 and failed;
the accepted run used the isolated production main server on 3202 and matching auth
origin. No chain success or full World proof is inferred from the browser test.

P2 helper: `ens-p2/index.html`, served locally at http://127.0.0.1:3215/.
It checks owner, Sepolia chain and deployed parent code before presenting the exact
P2 transaction to the user's wallet. User must confirm in MetaMask and return the hash.

Remaining engineering: treasury root composition/summary/auth adapters are still
uncommitted in X's worktree; readback contract CR-X-002 and C2 caller adoption remain
pending. CR-C2-008 manifest template is not implemented. No live Whitechain deployment,
attestation, governed USDT transfer or GS020 transaction is authorized by P1 approval.
