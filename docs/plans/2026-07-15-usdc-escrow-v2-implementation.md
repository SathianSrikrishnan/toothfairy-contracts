# USDC Escrow V2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an allowlisted, time-locked USDC deposit rail to the existing Tooth Fairy Network escrow program without changing any existing SOL account layout or mainnet state.

**Architecture:** Add token-specific config, aggregate, deposit, and vault accounts to the existing upgradeable program. Canonical USDC moves through SPL Token `transfer_checked` calls; existing native-SOL instructions and data remain untouched. Validate locally and on devnet before proposing any mainnet upgrade.

**Tech Stack:** Rust 2021, Anchor 0.30.1 program APIs, `anchor-spl` 0.30.1, original SPL Token Program, TypeScript integration tests, Solana local validator and devnet.

---

### Task 1: Freeze the existing account compatibility boundary

**Files:**
- Create: `tests/account-layout-compatibility.test.mjs`
- Create: `scripts/account-layout-snapshot.mjs`
- Modify: `package.json`

**Steps:**

1. Write a failing test that requires the existing `Config`, `ChildProfile`, `Milestone`, `Deposit`, and `Treasury` fields to stay byte-for-byte ordered.
2. Run the test and confirm it fails because the snapshot helper is missing.
3. Implement a small IDL layout snapshot helper without changing the program.
4. Run the test and confirm it passes.
5. Commit the compatibility guard.

### Task 2: Define token arithmetic and state

**Files:**
- Modify: `programs/toothfairy-escrow/Cargo.toml`
- Modify: `programs/toothfairy-escrow/src/lib.rs`
- Test: Rust unit tests inside `programs/toothfairy-escrow/src/lib.rs`

**Steps:**

1. Write failing Rust tests for 2% deposit fees, full early-release payouts, minimum USDC units, overflow rejection, and lock timestamp calculation.
2. Run the Rust library tests and confirm the new tests fail for missing token helpers.
3. Add `anchor-spl` and minimal checked-arithmetic helpers.
4. Add `TokenConfig`, `TokenMilestone`, `TokenDeposit`, and token-deposit state without changing existing structs.
5. Run the Rust tests and confirm they pass.
6. Commit the token model.

### Task 3: Initialize the allowlisted token rail

**Files:**
- Modify: `programs/toothfairy-escrow/src/lib.rs`
- Modify: `tests/toothfairy-escrow.ts`

**Steps:**

1. Write a failing integration test requiring the existing config authority, exact mint, and six decimals.
2. Add `initialize_token_config` with PDA `["token_config"]` and existing-authority validation.
3. Reject wrong authorities and non-six-decimal mints.
4. Run the focused integration test and confirm it passes.
5. Commit the allowlist instruction.

### Task 4: Deposit USDC into a deposit-specific vault

**Files:**
- Modify: `programs/toothfairy-escrow/src/lib.rs`
- Modify: `tests/toothfairy-escrow.ts`

**Steps:**

1. Write failing tests for a valid deposit, exact two-percent fee, wrong mint, too-small amount, and paused contract.
2. Add token milestone, token deposit, deposit vault, and token treasury accounts.
3. Transfer the fee and net amount with `transfer_checked`.
4. Store net base units and the chosen lock timestamp.
5. Run focused tests and commit.

### Task 5: Claim, refund, and early-withdraw USDC

**Files:**
- Modify: `programs/toothfairy-escrow/src/lib.rs`
- Modify: `tests/toothfairy-escrow.ts`

**Steps:**

1. Write failing tests for matured guardian claim, premature claim rejection, original-depositor refund, expired refund rejection, and full early-release payout without a second fee.
2. Implement PDA-signed transfers from the deposit vault.
3. Record settlement state and timestamps before returning success.
4. Run the focused tests and commit.

### Task 6: Add token treasury withdrawal and complete local verification

**Files:**
- Modify: `programs/toothfairy-escrow/src/lib.rs`
- Modify: `tests/toothfairy-escrow.ts`
- Modify: `README.md`

**Steps:**

1. Write failing tests for authority-only token fee withdrawal.
2. Implement the token treasury withdrawal.
3. Run all local-validator tests, Rust tests, `anchor build`, formatting, and linting.
4. Document the separate SOL and USDC rails.
5. Commit and push the verified contract branch.

### Task 7: Devnet upgrade and receipt verification

**Files:**
- Create: `scripts/verify-usdc-devnet.mjs`
- Create after execution: `docs/audits/2026-07-15-usdc-devnet-receipt.md`

**Steps:**

1. Verify the devnet program authority and Circle devnet USDC mint.
2. Upgrade devnet only; do not run a mainnet deploy command.
3. Initialize the devnet token config.
4. Fund a test wallet with devnet SOL and Circle faucet USDC.
5. Deposit, verify vault balance, and record public transaction/account links.
6. Commit the public audit receipt without secrets.

### Task 8: Add the dual-balance app model in a separate app branch

**Files:**
- Modify in `tooth-fairy-network`: `src/lib/solana/escrow.ts`
- Modify in `tooth-fairy-network`: `src/lib/solana/seal.ts`
- Modify in `tooth-fairy-network`: `src/app/c/[id]/page.tsx`
- Modify in `tooth-fairy-network`: homepage proof components only after permanent-page verification

**Steps:**

1. Generate and commit the devnet IDL.
2. Write failing app tests for separate SOL and USDC rows.
3. Add token deposit reads and transactions without changing existing SOL behavior.
4. Render `SOL` and `USDC` as separate proof rows with separate explorer links.
5. Deploy a Vercel Preview; do not promote production.
