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
- Signer B approval transaction:
  `5Yo5jUFsPzPnyv2EJJsPEfxEpPqyajxk4J8Mwt97cEcdbKV3TPrWpNPFp74jbsod47uWTi9gbkgcYiVpB4CcLb38`.
- Signer B approval finalized at slot `436242706`; exact payer debit was
  `107,526` lamports (`100,000` Squads service payment plus `7,526`
  network/priority fee).
- Current proposal state: `Approved`, with exactly Signers A and B recorded.
- A fresh unsigned execution simulation succeeds, consumes `36,548` compute
  units, invokes only Squads `VaultTransactionExecute` and TFN `unpause`, and
  quotes a raw network fee of `5,000` lamports before the Squads UI's service
  payment and dynamic priority fee.
- Execution transaction:
  `nCTW6rcCnzdKeArqqaESFNAhXa7oecsY5fTMJ7wMwcfyasPcZJkUVCtgsZeXRG6KMXgkLYs86JKiMNhxSsh9bGY`.
- Execution finalized at slot `436243568`.
- Exact execution payer debit: `107,374` lamports (`0.000107374 SOL`),
  comprising the `100,000` lamport Squads service payment and `7,374`
  lamport network/priority fee. This was below the approved `0.0002 SOL`
  maximum.
- Execution logs contain `VaultTransactionExecute` and
  `Contract UNPAUSED by Eu4B39...uYko`; no transfer or withdrawal occurred
  and the Squads vault balance did not change.
- Independent Anchor decoding after finalization records config authority
  `Eu4B39...uYko` and `paused=false`.
- P2 is complete. No canary deposit is authorized by this receipt.

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
5. [Done] Through Squads, unpause for a controlled canary window.
6. [Done with cost-control deviation] Deposit `0.01 SOL` and verify
   `0.0002 SOL` fee / `0.0098 SOL` protected.
7. [Done with cost-control deviation] Deposit `1.00 USDC` and verify
   `0.02 USDC` fee / `0.98 USDC` protected.
8. Keep the public application USDC gate off until both receipts and displayed
   balances pass.

No public application cutover or production Terms change is recorded by this
receipt.

## C0 canonical-USDC Mainnet canary

- Depositor: Signer A
  `5fWRv9gLT2JuZnrRXRtCrqnQGiy8E4h2NftrVh9YdYq9`.
- Existing founder-controlled milestone:
  `BV3ALxZwwvzFkMwJztpFMXGAmDhK4kx4RAhY5mBsgVtJ`.
- Finalized transaction:
  `4YzU7S5pDxDX2DsFcoiKD27zhbUKqjZyoBxWvoroJ4G9UrRdAwoGbi4d9wtE3bn4Z1vYe8CzQB6tVVKbJ9dGMCif`.
- Finalized slot: `436248601`.
- Canonical mint:
  `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- Gross source debit: exactly `1,000,000` base units (`1.00 USDC`).
- TFN fee vault credit: exactly `20,000` base units (`0.02 USDC`).
- Protected vault credit: exactly `980,000` base units (`0.98 USDC`).
- Token-deposit PDA:
  `Hkg4F79YRGwjuF49SnXwk5LQxUh64P8hP1t5RPwpPecR`.
- Protected vault:
  `DjJ6NVffQhmhZ9YeYaioaJWuseu18YyobjoTGtP5WrQn`.
- Fee vault:
  `HU9Gho7iDob5QkMb4zsfk5iLzZcZAFpXvFVEzS5GUMZ4`.
- Receipt owner is the TFN program; receipt amount, vault address, depositor,
  mint, state, and deposit index independently decode exactly.
- Remaining Signer A source balance: `1.00 USDC`.
- Program remains `paused=false`; the public application feature remains off.

The asset/economics canary passed, but its SOL cost ceiling did not. The
approved maximum was `0.0077 SOL`; the finalized payer debit was
`0.007833440 SOL`, an overrun of `0.000133440 SOL`. The decoded debit is
`0.007753440 SOL` account rent plus an `0.000080000 SOL` transaction fee.
The preview undercounted the variable-length token-deposit account as 176
bytes instead of the live 211 bytes, and Phantom added compute-budget priority
instructions. The operator now enforces the signed-message fee and live
token-deposit size.

## C1 native-SOL Mainnet canary

- Depositor: Signer A
  `5fWRv9gLT2JuZnrRXRtCrqnQGiy8E4h2NftrVh9YdYq9`.
- Existing founder-controlled milestone:
  `BV3ALxZwwvzFkMwJztpFMXGAmDhK4kx4RAhY5mBsgVtJ`.
- Finalized transaction:
  `44wMPLAWinwKurYxbxc4tFEtvfncjuUK7mtZgUapctwxG1VBtizahWXbXKrNov5Ceeb2EfG692S77n6DJrKFMook`.
- Finalized slot: `436251177`.
- Gross source debit to the escrow instruction: exactly `10,000,000`
  lamports (`0.01 SOL`).
- TFN treasury credit: exactly `200,000` lamports (`0.0002 SOL`).
- Protected principal: exactly `9,800,000` lamports (`0.0098 SOL`).
- Deposit PDA:
  `GcZeE7aw7WmA33xuZXN14KYJ5SxnzcAw19a4mQ7bb3UQ`.
- Deposit-account balance: `11,714,000` lamports, comprising `9,800,000`
  protected lamports and `1,914,000` rent-exempt lamports.
- Receipt owner: the TFN program.
- Decoded receipt: milestone above, Signer A depositor, label
  `TFN Mainnet Canary`, deposit index `2`, immediate lock, unclaimed.
- Program remains `paused=false`; the public application feature remains off.

The asset/economics canary passed, but its total-debit ceiling did not. The
approved maximum was `0.0119 SOL`; the finalized Signer A debit was
`0.011994 SOL`, an overrun of `0.000094 SOL`. The transaction fee was
`0.00008 SOL`. The preview used a 112-byte deposit-account estimate while the
live variable-length account is 147 bytes. The local operator now pins the
observed 147-byte size. This is a process cost-control failure, not a custody,
authority, recipient, or 2%/98% economics failure. No further Mainnet
transaction is authorized by this receipt.
