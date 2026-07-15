# USDC V2 Devnet Release Checklist

## Purpose

Prove the additive USDC escrow rail on Solana devnet without changing the mainnet program or production application.

## Current devnet preflight

- Program: `FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC`
- Program data account: `5ZUXyjYZaXAbSAC4EQk2Xu5HhEcogamn7gsG4Mnr7zkM`
- Upgrade authority: `5piptchcKR5qbJKqVJCjTo2rq1TouvpeAeH3XQuEYsXq`
- Local signer: matches the upgrade authority.
- Existing program capacity: `338,936` bytes.
- New verified binary: `568,808` bytes.
- Required extension: at least `229,872` bytes, plus a small safety margin if the CLI requires one.
- Approximate additional rent at the current devnet rate: `1.60 SOL`.
- Upgrade-authority devnet balance at preflight: `0.0083677 SOL`.
- The public CLI airdrop was rate-limited during preflight, so no devnet state changed.
- Canonical Circle devnet USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.

## Release gates already passed

- Deployed SOL account layouts remain unchanged.
- Rust safety suite: 13 passing.
- SOL local-validator regression suite: 19 passing.
- USDC local-validator lifecycle suite: 9 passing.
- Anchor program and IDL build: passing.
- No mainnet or production application state changed.

## Required before the devnet upgrade

1. Build once with Anchor CLI `0.30.1`, matching the program and JavaScript client.
2. Record the final `.so` SHA-256 and byte length.
3. Fund the devnet upgrade authority with enough devnet SOL to extend the program-data account and pay deployment fees.
4. Dump and hash the current devnet program as the rollback artifact.
5. Extend the devnet program-data account only by the required amount.
6. Upgrade devnet only; every command must use an explicit devnet RPC target.

## Devnet proof transaction

1. Initialize the additive token configuration with canonical devnet USDC.
2. Create one real test capsule and milestone.
3. Deposit a small devnet-USDC amount.
4. Verify the exact two-percent fee and net vault amount on chain.
5. Release or refund the deposit according to its test lock.
6. Save the program-upgrade signature, token-config address, deposit receipt address, settlement signature, and explorer links.
7. Rerun the SOL smoke path after the upgrade.

## Mainnet boundary

This checklist does not authorize a mainnet upgrade. Mainnet remains SOL-only until the devnet receipt is reviewed, the client dependency/toolchain findings are explicitly accepted or resolved, and a separate production release is approved.
