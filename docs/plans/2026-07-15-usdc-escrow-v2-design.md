# USDC Escrow V2 Design

## Decision

Add USDC as a parallel deposit rail inside the existing upgradeable Tooth Fairy Network program. Build and prove it on devnet first. Do not alter the layout or behavior of existing SOL accounts, and do not upgrade mainnet during this phase.

The existing program remains the canonical program ID. New USDC instructions and account types are additive, so Sia's live SOL time-lock and every existing child profile, milestone, and SOL deposit remain readable.

## Approaches considered

### 1. Additive upgrade to the existing program — selected

Add token-specific accounts and instructions without changing existing account layouts. This keeps one verifiable TFN program while isolating token custody from native SOL custody.

### 2. Deploy a second stablecoin program — deferred

This reduces upgrade coupling, but creates two program IDs, two pause systems, and a more confusing public receipt. It remains the fallback if the existing program approaches size or compatibility limits.

### 3. Support arbitrary SPL tokens — rejected for V2

Generic token support increases attack surface and creates misleading balances. V2 allowlists one canonical mint per cluster: Circle's devnet USDC during testing and Circle's mainnet USDC only after approval.

## Compatibility boundary

The following existing account structs must not change:

- `Config`
- `ChildProfile`
- `Milestone`
- `Deposit`
- `Treasury`

The existing SOL instructions remain unchanged. V2 introduces new token-specific PDAs, so an upgrade cannot reinterpret or resize live accounts.

## New accounts

### TokenConfig

Singleton PDA: `["token_config"]`

- program authority
- allowlisted USDC mint
- expected decimals
- initialized timestamp
- bump

The authority must match the existing global `Config` authority. The mint is configured separately on devnet and mainnet because the official Circle addresses differ by cluster.

### TokenMilestone

PDA: `["token_milestone", milestone]`

- linked milestone
- token deposit count
- total token units deposited
- total token units claimed or refunded
- bump

This creates token aggregates without changing the existing `Milestone` account.

### TokenDeposit

PDA: `["token_deposit", milestone, deposit_index]`

- milestone
- mint
- depositor
- depositor display name
- canonical deposit-vault address
- net token amount in base units
- lock timestamp
- state
- creation and settlement timestamps
- sequential index
- bump

Its associated token account is the vault. The TokenDeposit PDA controls that vault and signs claim, refund, and early-withdraw token transfers.

The client creates the deposit and treasury associated token accounts immediately before the deposit instruction, ideally in the same transaction. The program independently derives and verifies both canonical addresses, owners, and mints before moving funds. Keeping token-account creation outside the custody instruction avoids Solana's small execution-stack limit without weakening vault validation.

## Instructions

1. `initialize_token_config` — existing program authority allowlists the cluster's canonical USDC mint and verifies six decimals.
2. `deposit_token` — anyone deposits USDC; two percent goes to the token treasury vault and the net amount enters a deposit-specific vault.
3. `claim_token_deposit` — guardian releases matured USDC to the child's associated token account.
4. `refund_token_deposit` — original depositor reclaims the net amount during the seven-day grace period.
5. `early_withdraw_token_deposit` — guardian releases the full protected amount early; no second platform fee is charged.
6. `withdraw_token_treasury` — token-config authority moves collected USDC fees to its associated token account.

## Token safety rules

- Use the original SPL Token Program for canonical Circle USDC V2; do not accept Token-2022 or arbitrary token programs.
- Require the mint to equal `TokenConfig.allowed_mint` on every instruction.
- Use `transfer_checked` so the mint and decimal count are validated during transfers.
- Store and calculate amounts as integer base units. USDC has six decimals; `1.25 USDC` is `1_250_000` units.
- Use checked arithmetic for fees and aggregates.
- Keep the existing global emergency pause effective for token instructions.
- Never combine SOL and USDC into one numeric balance. Receipts render separate rows.

## Public receipt model

A Toothlight may have zero, one, or both fund rails:

- `0.049 SOL · locked until July 2031`
- `1.25 USDC · locked until July 2031`

Each row links to its own verifiable deposit or vault account. The cNFT asset remains a third independent proof. Minting a cNFT does not fund the Toothlight, and funding a Toothlight does not mint another cNFT.

## Release gates

1. Pure fee and lock arithmetic tests pass.
2. Local-validator deposit, claim, refund, wrong-mint, early-withdraw, and pause tests pass.
3. Program build is reproducible.
4. Devnet uses Circle's official devnet USDC mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.
5. Independent devnet receipt verification passes.
6. App preview renders SOL and USDC as separate proof rows.
7. Mainnet upgrade requires a separate explicit approval, security review, and official mainnet mint check.

## Primary references

- Solana token CPI and `transfer_checked`: https://solana.com/docs/tokens/advanced/cpi
- Anchor SPL Token integration: https://www.anchor-lang.com/docs/tokens
- Anchor token accounts and PDA vaults: https://www.anchor-lang.com/docs/tokens/basics/create-token-account
- Circle USDC addresses: https://developers.circle.com/stablecoins/usdc-contract-addresses
