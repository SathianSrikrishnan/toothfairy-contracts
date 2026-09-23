# USDC V2 Devnet Release Receipt

## Scope

This release upgrades and proves the Tooth Fairy Network program on Solana devnet only. Mainnet and the production application were not changed.

## Verified program release

- Program: `FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC`.
- Upgrade authority: `5piptchcKR5qbJKqVJCjTo2rq1TouvpeAeH3XQuEYsXq`.
- Release binary: `568,808` bytes.
- Release SHA-256: `cc95c85397a47f3ead53a0ebe1ef0023ec2b1c2fbafd685aab8121c1657fb3ee`.
- Devnet deployment slot: `476559693`.
- Upgrade signature: `4DH7kwGYMfB17CL65cpPBZ7JwBde6wkuEocAwPUnXX7NKSd7oUZyKTsDPaFmM2XwUBoGD5MGfGrVNMzZngkRNLeS`.
- Post-deployment dump: byte-for-byte identical to the local release binary.

The previous `338,936`-byte devnet binary is retained at `.anchor/rollback/devnet-toothfairy-before-usdc-v2.so` with SHA-256 `68a6873263310091b31f3c916cbe774b900f62ec15f909bdd6d21e53732c46f7`.

## Canonical USDC configuration

- Circle Solana devnet USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
- Global config: `44USggbuAeHoexpJCjEi3vpB8t61CMZrJhDNdz4ZfJ7X`.
- SOL treasury: `BnJcGtas4pJh9JBEqrYLb7ze3HzeEDAcCctsiYeZfyR3`.
- Token config: `8xRT3sCyveZaFhoGgtsn8ZvTx4YwxDYSZuCs9gfdH6UM`.
- Authority USDC account: `5s1YCCzptWWJSrvxCCu3aukpvdTTHTiyVdmrN2rFqNj`.
- Initialize-config signature: `5cxwubJxrUHd1gzb4jbY2wQDXjzs14t4xjPtGKhQsSGxWKiUxS4a2H1LbQ2nt2o4gidkuo5fw4onnPPdSAtR4q8M`.
- Initialize-treasury signature: `LiQRbxEhNpNuWJdJhCQThWLRDhmieHt7rNySS4vaLEiHRgvH4Jn4xoKNmjURFwzptPajTie8YkVC3YXxTCyRHMS`.
- Initialize-token-config signature: `5jtzR2qwwedtt7E1a73QUatuRd3uaGyW8fNgj8W381WhyeyVqrNzXr7M1BnUmaZdRgB14t6krtoRorUghBpZ5v5e`.

The token config verifies six decimals and permits only the official Circle devnet mint. Four unrelated one-unit devnet mints in the authority wallet are not accepted.

## Post-upgrade SOL compatibility proof

- Child wallet: `J9PdcZ5s4HSptH3LjgfZU1bRFa3QG86yNWSU54cWGRXn`.
- Milestone: `HRs4P7jJpKPHRpmiTw8iaF1KqmAxzYQXTizgcdeLvvHk`.
- Deposit receipt: `B5qk6mdGMMeAeqbY9nkdgAPsxNZ4uQCuGCYFV62EQ7mK`.
- Gross: `10,000,000` lamports.
- Fee: `200,000` lamports (2%).
- Released to child: `9,800,000` lamports.
- Deposit signature: `5ho49Dn6jSui12VNkBAnuurf8xsVngU74cVvW8rauWvaWDHS8Bm8wACsneWpyyTZ5w6nzFeW9w6JeGoupZ3ZihQ5`.
- Claim signature: `32k8SnZMxXWtMsod5X99Jv8Jsk3Zyn9fp91MEYmS7gqDDkuYHxuo6GeZH6SNFqFNgHNMasiAZR6W8tD19U1Ft5NX`.

The exact 2% fee and 98% child payment were verified after settlement. This demonstrates that the additive USDC upgrade preserved the original SOL instruction path and account layout.

## Canonical USDC deposit and release proof

- Circle faucet signature: `5wnTzgErUA2DTVb2sCMgTTaz7VTT1NRVFodG9FubR8YQCDBp8Y8y2FybMxeJ6apk1ju6QMje7QYaJfjVdDFfzbF7`.
- Child wallet: `6y8mimMTDq18EDB3mcmtA8hsughRgYKR5XZNHffnWsHK`.
- Child profile: `HmXU1hey2xL6sfBJxtJVW6fMU97LnQDrPXHcVCZPUmQo`.
- Milestone: `HWX1NkLBCJCmUnR22yn3Sp84NtMXYMJFrwMGZHSRWobM`.
- Token milestone aggregate: `CQpNPHP8xQ9mHavKqKA3SHtBq6dmCcQ8xWybcxi4BrVy`.
- Token deposit receipt: `4vPEwKSafZKPC7LmXfqLiu1n3YpBixkozUVeXibyiHJy`.
- Deposit vault: `DP9iYP72tGae2D9G5qxPnB8K67bKkpr6Hkagg5Mu51bK`.
- Child token account: `F74DvjAofV46i6FFbcyk7NdR9J15J1w8aKP3X1ibR31N`.
- Token treasury vault: `73YSECXLeXxa6RhJxrsKGnABXuSCrVX6kfgYxwTeJMjA`.
- Gross deposit: `1,250,000` units (`1.25 USDC`).
- Platform fee: `25,000` units (`0.025 USDC`, exactly 2%).
- Net vault amount: `1,225,000` units (`1.225 USDC`).
- Child balance after release: `1,225,000` units.
- Deposit signature: `y4q2KVYc2cQb47Mb8qDn3dXssNqkNZi1xvube3qLYm6abVudrcfwfCqsT5PynSPCoam1stGu1A7inJu6SV5EkGG`.
- Claim signature: `5LoF1fPZDZG5QsXUAwem5Frns6AsdDWjVSxFDRCbpeM4xShCR4yCLs6Q5B9E7hpzw9GZj9Lc1vBbdyJA5nT72NmP`.

The deposit vault is empty after settlement, the receipt state is `claimed`, and the child account received the exact net amount. A verifier bug originally compared the claim state against the refund code; a regression test now pins the correct claim code before this receipt was finalized.

The first proof run also completed its on-chain deposit and claim before the verifier reported that state-code mismatch. The clean receipt above is the second run. Consequently, the authority retains `17.5 USDC` from the `20 USDC` faucet funding and the token treasury holds `0.05 USDC`, representing two exact `0.025 USDC` fees.

## Final verification

- Pinned Anchor `0.30.1` release build: passed.
- Release binary: `568,808` bytes with SHA-256 `cc95c85397a47f3ead53a0ebe1ef0023ec2b1c2fbafd685aab8121c1657fb3ee`.
- Rust safety tests: `13 passing`.
- JavaScript layout, release-safety, and proof tests: `10 passing`.
- Isolated SOL lifecycle suite: `19 passing`.
- Isolated USDC lifecycle suite: `9 passing`.
- Post-release devnet SOL deposit/release: passed.
- Post-release devnet USDC deposit/release: passed.
- Devnet program dump: byte-for-byte match with the release binary.

## Mainnet boundary

Mainnet was rechecked after this devnet release. Its last deployment remains slot `409717242` and its data length remains `386,648` bytes. No mainnet transaction was executed.
