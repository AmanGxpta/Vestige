# Vestige testnet signer provisioning

## What changed

Created six fresh encrypted Foundry keystores outside the repository at `~/.vestige/keystores/`, using the Waypoint pattern but no Waypoint account. Each has a distinct generated password stored as `vestige-<role>-keystore` in the macOS login Keychain. No transactions were signed or broadcast.

| Role | Public address |
| --- | --- |
| deployer | `0x10d8C1d6359F0694203924182d3da83843a4e052` |
| attester | `0x84068C51A9236A869E5F05FBA96323E97597DDEd` |
| relayer | `0xc57f2f78997e35fc2C1E0BA06249B499cD293116` |
| funder | `0xD613312b630C9359EcE15dBF3969c47261d8d43A` |
| payee | `0xabDC5035CEa855Ec7Cf8A7259eA26E131f0BA8D8` |
| isolated failed-tx sender | `0xd03ce7DAE6c4B75fE26213Cb08CEB9286D1FC852` |

## Tests + actual output

`cast wallet address --keystore <file> --password <generated password>` returned the addresses above during creation. All six keystore files exist with mode `600`; parent directories have mode `700`. Read-only `security find-generic-password` confirmed all six Keychain records. No network balance or transaction test was performed.

## Remaining issues / actions for H

H should create a separate Sepolia ENS registrar in MetaMask and provide only its address. Founder A and B must be controlled by two distinct World-verified people; no founder wallet was created here. Fund the deployer, attester, relayer and isolated failed-tx sender with bounded faucet WBT, and the funder with test USDT, after checking chain and addresses. Keep the relayer private to Vestige; do not reuse the Waypoint relayer nonce owner. H still approves exact deployments and broadcasts.

Keychain passwords can be retrieved locally by the human via `security find-generic-password -a "$USER" -s vestige-<role>-keystore -w`; do not paste that output into chat, logs or shell history.
