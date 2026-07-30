# Mainnet USDC upgrade receipt — in progress

## Verified completed state

- Cluster: Solana Mainnet-Beta.
- Program: `FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC`.
- ProgramData: `5ZUXyjYZaXAbSAC4EQk2Xu5HhEcogamn7gsG4Mnr7zkM`.
- Pause transaction:
  `4FBR88vwbp6J26WaUKFurakGZavy3ddwEpcB7Cx4CWgZ4XETXHtBydZnfa93L1A8nWMXL5nFPjCgxseVG19jzqFF`.
- Upgrade transaction:
  `2z5iPZgeQc7b6vXskG38VMSpvH5BVjkftRgyjtJLZkcMDtesDgJg549NgKgP2CJ1WKNfCXtWUA9zgy1D9GoDjnuc`.
- Upgrade slot: `436210094`.
- Live ProgramData length: `437,768` bytes.
- Live ProgramData SHA-256:
  `04cc06a3f9b6795b472a3de6e8a2c5b15b0f8d71135f1a5f4034f735e743d1e0`.
- The live bytes exactly match the approved release artifact.
- Program status after upgrade: paused.
- Config and SOL treasury authority migration transaction:
  `4c7rkBd894UpsoRMUAF2xCbSjy1WP39Nsc1jxDiyropwm7P3K9kGEauP3brA8mgQRiKCfomiJ2TqWLHJVUUQ7HyH`.
- Program upgrade authority migration transaction:
  `r5vvD7zJuUknwYyotJQcZXepE721cTMHFZuCou8rEkaNcbZoJRwtxztmWWRsCR45UVd7inDz84Sf6ErAkJ5yzEz`.
- Current program/config/treasury authority:
  `Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko`.
- Token config: not initialized.

## Verified custody destination

- Squads V4 multisig:
  `1P8a83j4SK28JCSTMpv5w7HS92ko5Ki5xGcyfy68uz5`.
- Squads vault:
  `Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko`.
- Threshold: exactly 2-of-3.
- Members:
  - Signer A: `5fWRv9gLT2JuZnrRXRtCrqnQGiy8E4h2NftrVh9YdYq9`;
  - Signer B: `2UPEsHM9HCwxrfeyGun1Mx312yEktJe9jgF8PsuaTcHb`;
  - Signer C: `ELrLeuWRUu4yFJfpwNwtxB41MFU3LLw2XGvbpmCbMKQ8`.
- All three members have initiate, vote, and execute permissions.
- On-chain verification command: `npm run verify:mainnet-squads`.

## Remaining release gates

The following are not complete and must not be represented as live:

1. [Done] Transfer program upgrade, config, and SOL treasury authorities to the
   Squads vault.
2. Top up the Squads vault by `0.001 SOL`. Its existing `0.001 SOL` is below
   the `0.0014616 SOL` rent required to create the 82-byte token-config account.
3. Through Squads, initialize only canonical Circle Mainnet USDC
   `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` with six decimals.
4. Verify all authorities and token configuration while paused.
5. Through Squads, unpause for a controlled canary window.
6. Deposit `0.01 SOL` and verify `0.0002 SOL` fee / `0.0098 SOL` protected.
7. Deposit `1.00 USDC` and verify `0.02 USDC` fee / `0.98 USDC` protected.
8. Keep the public application USDC gate off until both receipts and displayed
   balances pass.

No canary, public application cutover, or Terms change is recorded by this
receipt yet.
