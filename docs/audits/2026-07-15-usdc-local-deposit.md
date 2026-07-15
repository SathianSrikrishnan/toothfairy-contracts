# USDC V2 Local Deposit Receipt

## Scope

This receipt covers the additive USDC deposit path only. It did not deploy or modify devnet, mainnet, the production application, or any existing SOL account.

## Proven on an isolated local Solana validator

- A six-decimal allowlisted test mint was configured by the existing program authority.
- A `1.25 USDC`-equivalent deposit moved `1_250_000` base units from the depositor.
- The exact two-percent fee, `25_000` units, arrived in the canonical token treasury vault.
- The net `1_225_000` units arrived in the canonical deposit-specific vault.
- The token receipt stored the depositor, label, vault, mint, lock timestamp, and net amount.
- The token-milestone aggregate recorded one deposit and `1_225_000` locked units.
- A deposit below `0.01 USDC` was rejected and its receipt account was rolled back.
- A deposit while the global emergency pause was active was rejected.
- A different six-decimal mint was rejected.
- A still-locked deposit could not be released normally.
- An early release moved exactly ten percent to the treasury and ninety percent to the child's token account.
- The original depositor reclaimed the net amount during the seven-day grace period.
- An immediately available deposit moved to the child's token account and could not remain in the vault.
- Token aggregates reconciled total deposited units with total settled units after the lifecycle completed.

## Verification commands and results

- Rust focused safety test: passed.
- Existing SOL account-layout compatibility test: passed before this batch and remains part of the release gate.
- Anchor program build: passed after reducing the deposit account frame below Solana's stack limit.
- Focused local-validator suite: `8 passing`.

## Known follow-up gates

- Treasury withdrawal is not implemented yet.
- The repository's older SOL integration suite needs repair before it can be used as a full regression gate.
- The JavaScript dependency audit currently reports transitive development-tool vulnerabilities; these must be reviewed before a release candidate.
- Devnet remains untouched until the complete lifecycle suite passes locally.
