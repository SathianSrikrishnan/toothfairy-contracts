# toothfairy-contracts

Solana escrow smart contract for Tooth Fairy Network (toothfairy.network).

**Status: deployed to Solana mainnet.** Program ID: `FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC`. Any upgrade or redeploy is HIGH-STAKES and requires explicit Sathian approval.

## Stack

- Anchor framework
- Rust (on-chain program)
- TypeScript + Solana web3.js (tests, scripts, client helpers)
- Metaplex Bubblegum (compressed NFT minting for tooth tokens)

## Design

Multi-depositor escrow with time-locked withdrawals. 8 on-chain instructions covering: deposit, time-locked withdraw, multi-depositor support, guardian transfer, server-assisted minting, emergency controls.

## Commands

- `anchor build` — compile program
- `anchor test` — run tests against local validator
- `anchor deploy` — **NEVER run without explicit Sathian approval in chat.** Any deploy to devnet or mainnet requires sign-off.

## Working rules

- This is a **public** repo. Never commit keypairs, `.env*`, wallet seeds, or credentials.
- Never modify the platform fee constants (2% deposit / 10% early withdrawal).
- Never change the escrow account structure in ways that break existing on-chain state — the contract is live with real user funds.
- Never run `anchor deploy` or `anchor upgrade` against any cluster without explicit approval.
- Work on feature branches. `master` reflects what's deployed to mainnet.
- Read the program entrypoint (`programs/*/src/lib.rs` or equivalent) before making any program changes.

## Companion

Frontend client that consumes this contract lives at `../sathian-ai/`.

## Context pointers

- User-global context: `~/.claude/CLAUDE.md`
- Recommended skill: https://github.com/solana-foundation/solana-dev-skill

## Reporting

When completing a task, report:

```
What I did: <changes, file paths>
What I verified: <tests, commands, exit codes>
What I did NOT do: <deferred / out of scope>
Open questions: <decisions needed>
```
