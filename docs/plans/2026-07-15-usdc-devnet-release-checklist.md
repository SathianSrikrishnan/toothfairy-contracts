# USDC V2 Devnet Release Checklist

## Purpose

Prove the additive USDC escrow rail on Solana devnet without changing the mainnet program or production application.

## Devnet release state

- Program: `FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC`
- Program data account: `5ZUXyjYZaXAbSAC4EQk2Xu5HhEcogamn7gsG4Mnr7zkM`
- Upgrade authority: `5piptchcKR5qbJKqVJCjTo2rq1TouvpeAeH3XQuEYsXq`
- Local signer: matches the upgrade authority.
- Previous program binary: `338,936` bytes; SHA-256 `68a6873263310091b31f3c916cbe774b900f62ec15f909bdd6d21e53732c46f7`.
- Rollback artifact: `.anchor/rollback/devnet-toothfairy-before-usdc-v2.so`.
- New verified binary: `568,808` bytes; SHA-256 `cc95c85397a47f3ead53a0ebe1ef0023ec2b1c2fbafd685aab8121c1657fb3ee`.
- Devnet program upgraded in slot `476559693`.
- Upgrade signature: `4DH7kwGYMfB17CL65cpPBZ7JwBde6wkuEocAwPUnXX7NKSd7oUZyKTsDPaFmM2XwUBoGD5MGfGrVNMzZngkRNLeS`.
- The dumped devnet program matches the release binary byte for byte after deployment.
- Canonical Circle devnet USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- Canonical token config: `8xRT3sCyveZaFhoGgtsn8ZvTx4YwxDYSZuCs9gfdH6UM`.
- Global config: `44USggbuAeHoexpJCjEi3vpB8t61CMZrJhDNdz4ZfJ7X`.
- SOL treasury: `BnJcGtas4pJh9JBEqrYLb7ze3HzeEDAcCctsiYeZfyR3`.

## Release gates already passed

- Deployed SOL account layouts remain unchanged.
- Rust safety suite: 13 passing.
- SOL local-validator regression suite: 19 passing.
- USDC local-validator lifecycle suite: 9 passing.
- Anchor program and IDL build: passing.
- No mainnet or production application state changed.
- Post-upgrade devnet SOL deposit and release: passing.

## Required before the devnet upgrade

1. [x] Build once with Anchor CLI `0.30.1`, matching the program and JavaScript client.
2. [x] Record the final `.so` SHA-256 and byte length.
3. [x] Fund the devnet upgrade authority with enough devnet SOL to extend the program-data account and pay deployment fees.
4. [x] Dump and hash the current devnet program as the rollback artifact.
5. [x] Extend the devnet program-data account only by the required amount.
6. [x] Upgrade devnet only; every command must use an explicit devnet RPC target.

## Devnet proof transaction

1. [x] Initialize the additive token configuration with canonical devnet USDC.
2. [x] Create one real USDC test capsule and milestone.
3. [x] Deposit a small canonical devnet-USDC amount.
4. [x] Verify the exact two-percent fee and net vault amount on chain.
5. [x] Release the immediate proof deposit to a separate child wallet.
6. [x] Save the USDC deposit receipt address, settlement signature, and explorer links.
7. [x] Rerun the SOL smoke path after the upgrade.

Circle's official faucet funded the authority's canonical devnet-USDC account at `5s1YCCzptWWJSrvxCCu3aukpvdTTHTiyVdmrN2rFqNj` with `20 USDC`. Four unrelated one-unit test mints are also present in the wallet and remain correctly rejected by the canonical-mint allowlist.

## Canonical USDC receipt

- Faucet signature: `5wnTzgErUA2DTVb2sCMgTTaz7VTT1NRVFodG9FubR8YQCDBp8Y8y2FybMxeJ6apk1ju6QMje7QYaJfjVdDFfzbF7`.
- Child wallet: `6y8mimMTDq18EDB3mcmtA8hsughRgYKR5XZNHffnWsHK`.
- Milestone: `HWX1NkLBCJCmUnR22yn3Sp84NtMXYMJFrwMGZHSRWobM`.
- Token deposit receipt: `4vPEwKSafZKPC7LmXfqLiu1n3YpBixkozUVeXibyiHJy`.
- Deposit vault: `DP9iYP72tGae2D9G5qxPnB8K67bKkpr6Hkagg5Mu51bK`.
- Child USDC account: `F74DvjAofV46i6FFbcyk7NdR9J15J1w8aKP3X1ibR31N`.
- Gross deposit: `1,250,000` units (`1.25 USDC`).
- Platform fee: `25,000` units (`0.025 USDC`).
- Released to child: `1,225,000` units (`1.225 USDC`).
- Deposit signature: `y4q2KVYc2cQb47Mb8qDn3dXssNqkNZi1xvube3qLYm6abVudrcfwfCqsT5PynSPCoam1stGu1A7inJu6SV5EkGG`.
- Claim signature: `5LoF1fPZDZG5QsXUAwem5Frns6AsdDWjVSxFDRCbpeM4xShCR4yCLs6Q5B9E7hpzw9GZj9Lc1vBbdyJA5nT72NmP`.

## Post-upgrade SOL receipt

- Gross deposit: `10,000,000` lamports (`0.01 SOL`).
- Platform fee: `200,000` lamports (`0.0002 SOL`).
- Released to child: `9,800,000` lamports (`0.0098 SOL`).
- Deposit account: `B5qk6mdGMMeAeqbY9nkdgAPsxNZ4uQCuGCYFV62EQ7mK`.
- Deposit signature: `5ho49Dn6jSui12VNkBAnuurf8xsVngU74cVvW8rauWvaWDHS8Bm8wACsneWpyyTZ5w6nzFeW9w6JeGoupZ3ZihQ5`.
- Claim signature: `32k8SnZMxXWtMsod5X99Jv8Jsk3Zyn9fp91MEYmS7gqDDkuYHxuo6GeZH6SNFqFNgHNMasiAZR6W8tD19U1Ft5NX`.

## Mainnet boundary

This checklist does not authorize a mainnet upgrade. Mainnet remains SOL-only until the complete USDC devnet receipt is reviewed, the client dependency/toolchain findings are explicitly accepted or resolved, and a separate production release is approved. Mainnet was rechecked after the devnet release and remains at slot `409717242` with data length `386,648` bytes.
