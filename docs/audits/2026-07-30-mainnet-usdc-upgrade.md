# Mainnet USDC upgrade receipt — configuration verified

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
- Canonical USDC proposal account:
  `8exKGRBPpN2D2uNQVxnaRmGDQypbKnAU5gpjhjMJchTa`.
- Canonical USDC Squads transaction:
  `Gcq14R9dxcS1iBXAFssBAh9hXcP8rPrkwEwRdyB6rZAq`.
- Proposal approvals:
  - Signer A: `5fWRv9gLT2JuZnrRXRtCrqnQGiy8E4h2NftrVh9YdYq9`;
  - Signer B: `2UPEsHM9HCwxrfeyGun1Mx312yEktJe9jgF8PsuaTcHb`.
- Signer B approval transaction:
  `T86td4L6wdbsqMP9S2bkPgx5mbhQwvnJj4dSL7k8f4Hz8XMfQ8qotdQgKZKkFCJ3h71cbx1c79oxCquJwyYefzG`.
- Canonical USDC execution transaction:
  `4nawDqbxwhPQXshW4PtPaB7hTeGb9Vz2UZbtHKnQfGGdjVLqQmE6Em5KttMcyN2QHiZHNGL57nWGeyBci5sWW7K9`.
- Execution slot: `436239100`.
- Execution network fee: `8,389` lamports.
- Token-config PDA:
  `8xRT3sCyveZaFhoGgtsn8ZvTx4YwxDYSZuCs9gfdH6UM`.
- Token-config rent: `1,461,600` lamports for 82 bytes.
- Allowed mint:
  `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- Decimals: `6`.
- Token-config authority:
  `Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko`.
- Post-execution Squads vault balance: `1,038,400` lamports.
- Program status after configuration: paused.

## P2 unpause proposal — created, not executed

- Squads transaction index: `2`.
- VaultTransaction PDA:
  `J6Fn7rSGkkY9NbKFEYDjw71kgfsUward1eijmHQPT3c4`.
- Proposal PDA:
  `4Qnbns25oegZgKKh24bBH6dumg3rD5Pk65hPLW9oKhyC`.
- Creation and Signer A approval transaction:
  `2ra4efgXKDhEgZBjekkxUTTvHKTkLkKyKbRJkMheVsxGxGTnh4x1ZtMWoCkHL1Ed6ykqhPYegshBdfxf1AdiZPfA`.
- Finalized slot: `436241756`.
- Exact payer debit: `5,896,341` lamports (`0.005896341 SOL`), within
  the approved `0.0060 SOL` maximum.
- Debit components: `2,401,200` lamports VaultTransaction rent,
  `3,382,560` lamports Proposal rent, `100,000` lamports Squads service
  account payment, and `12,581` lamports network/priority fee.
- Decoded inner instruction: TFN `unpause` discriminator
  `[169, 144, 4, 38, 10, 141, 188, 255]`.
- Decoded writable accounts: Squads vault
  `Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko` and TFN config
  `44USggbuAeHoexpJCjEi3vpB8t61CMZrJhDNdz4ZfJ7X`.
- Decoded invoked program:
  `FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC`.
- Current proposal state: `Active`, approved only by Signer A
  `5fWRv9gLT2JuZnrRXRtCrqnQGiy8E4h2NftrVh9YdYq9`.
- Signer B approval, execution, and the resulting `paused=false` state are
  not complete. No canary deposit is authorized by this receipt.

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
2. [Done] Fund the Squads vault for token-config rent.
3. [Done] Through Squads, initialize only canonical Circle Mainnet USDC
   `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` with six decimals.
4. [Done] Verify all authorities and token configuration while paused.
5. Through Squads, unpause for a controlled canary window.
6. Deposit `0.01 SOL` and verify `0.0002 SOL` fee / `0.0098 SOL` protected.
7. Deposit `1.00 USDC` and verify `0.02 USDC` fee / `0.98 USDC` protected.
8. Keep the public application USDC gate off until both receipts and displayed
   balances pass.

No canary, public application cutover, or Terms change is recorded by this
receipt yet.
