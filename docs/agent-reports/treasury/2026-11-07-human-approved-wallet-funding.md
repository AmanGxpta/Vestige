# H-approved wallet funding, Whitechain Sepolia 1874

H explicitly requested using Waypoint deployer/relayer as the WBT source and Waypoint supplier as the USDT source, following the agreed Vestige split. Waypoint deployer was chosen to avoid consuming the application's relayer nonce. Each encrypted source keystore was unlocked through a local hidden-password prompt, its derived address checked, and chain ID/nonce/balance/gas checked before sending. No private key/password or signed authorization was logged or committed. This authorization covers these transfers only, not contract deployments or relay activation.

## Confirmed transfers

All six successful receipts were observed with two confirmations, transaction sender/recipient/value/calldata checked, and balances independently read afterwards. Public receipt details are in `2026-11-07-human-approved-wallet-funding.json`.

| Recipient role | Amount | Transaction hash |
| --- | --- | --- |
| Vestige deployer | 0.80 WBT | `0xa067edca93578197bae5bfea6b02164534a128306c5463cd04394a13876064ef` |
| Vestige relayer | 0.80 WBT | `0x975654d820334026fa9eeceb79f37585ac7ae9a2dfea328cf7ba5246e6ee7a21` |
| Vestige attester | 0.20 WBT | `0x671ffa9548b2e3495c69443d0306f245d6e39bb57f1aa5c232cc8e1dfcfd89a9` |
| Vestige isolated failed-tx sender | 0.05 WBT | `0x7d91fa759e916d3ccf14cd4dca9a71d388e53b60a229a679cc61de470ba0a936` |
| Waypoint supplier, transfer gas | 0.002 WBT | `0x89e2e7684c6be12787110161cfc3196102af2c4968bd84f6143353927f9df6ab` |
| Vestige funder, official test USDT | 100 USDT | `0x31c4345cca60ba544d08be0c74c361169d4d09ec9e4b2324887a852797c4a10d` |

WBT sender: `0x9FF5aAdA0b1343CCF5612863C5AFe7C1382084ed`.
USDT sender: `0xa7A6339bEE69a6de7342e03b311c04492df682a2`.
USDT contract: `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, decimals 6; transfer event matched sender, funder and 100000000 raw units.

Independent final balances: Vestige deployer 0.8 WBT, relayer 0.8 WBT, attester 0.2 WBT, isolated sender 0.05 WBT; Vestige funder 100 USDT. Waypoint deployer retains 0.122147914994499152 WBT; supplier retains 0.0016953240769975 WBT after its token-transfer fee.

Funding prerequisites for these roles are now confirmed. No Vestige contract deployment, Safe creation, seat attestation or governed payment is implied by these wallet transfers. The demo can deposit 100 USDT and pay 50 USDT once its remaining gates are satisfied.
