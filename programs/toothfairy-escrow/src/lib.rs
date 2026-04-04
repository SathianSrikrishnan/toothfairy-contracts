use anchor_lang::prelude::*;

declare_id!("FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC");

/// Maximum number of milestones per child (humans have 20 baby teeth)
const MAX_MILESTONES: u8 = 20;

/// Seconds per year (365.25 days)
const SECONDS_PER_YEAR: i64 = 31_557_600;

/// Minimum deposit amount (10,000 lamports = 0.00001 SOL) — anti-spam
const MIN_DEPOSIT_LAMPORTS: u64 = 10_000;

/// Refund grace period (7 days in seconds) — depositors can reclaim within this window
const REFUND_GRACE_PERIOD: i64 = 7 * 24 * 60 * 60;

/// Platform fee in basis points (200 = 2.0%)
const PLATFORM_FEE_BPS: u64 = 200;

/// Early withdrawal penalty in basis points (1000 = 10%)
const EARLY_WITHDRAW_PENALTY_BPS: u64 = 1000;

/// Basis points denominator
const FEE_DENOMINATOR: u64 = 10_000;

#[program]
pub mod toothfairy_escrow {
    use super::*;

    // ========================================================================
    // ADMIN INSTRUCTIONS
    // ========================================================================

    /// Initialize the global config. Called once by the platform admin.
    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.paused = false;
        config.bump = ctx.bumps.config;

        msg!("Config initialized with authority: {}", config.authority);
        Ok(())
    }

    /// Pause the contract — blocks deposits, claims, withdrawals, and transfers.
    /// Only the config authority can call this.
    pub fn pause(ctx: Context<AdminAction>) -> Result<()> {
        ctx.accounts.config.paused = true;
        msg!("Contract PAUSED by {}", ctx.accounts.authority.key());
        Ok(())
    }

    /// Unpause the contract — resumes normal operation.
    /// Only the config authority can call this.
    pub fn unpause(ctx: Context<AdminAction>) -> Result<()> {
        ctx.accounts.config.paused = false;
        msg!("Contract UNPAUSED by {}", ctx.accounts.authority.key());
        Ok(())
    }

    /// Initialize the platform treasury. Called once by the platform admin.
    pub fn initialize_treasury(ctx: Context<InitializeTreasury>) -> Result<()> {
        let treasury = &mut ctx.accounts.treasury;
        treasury.authority = ctx.accounts.authority.key();
        treasury.total_collected = 0;
        treasury.bump = ctx.bumps.treasury;

        msg!("Treasury initialized with authority: {}", treasury.authority);
        Ok(())
    }

    /// Withdraw accumulated fees from the treasury.
    /// Only the treasury authority can call this.
    pub fn withdraw_treasury(ctx: Context<WithdrawTreasury>, amount_lamports: u64) -> Result<()> {
        let rent = Rent::get()?;
        let min_balance = rent.minimum_balance(8 + Treasury::INIT_SPACE);
        let current_balance = ctx.accounts.treasury.to_account_info().lamports();
        let available = current_balance.saturating_sub(min_balance);

        require!(amount_lamports <= available, TfnError::InsufficientTreasuryBalance);

        // Direct lamport manipulation — program owns the treasury PDA
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? -= amount_lamports;
        **ctx.accounts.authority.to_account_info().try_borrow_mut_lamports()? += amount_lamports;

        msg!("Withdrew {} lamports from treasury (available: {})", amount_lamports, available);
        Ok(())
    }

    // ========================================================================
    // CHILD PROFILE INSTRUCTIONS
    // ========================================================================

    /// Initialize a new child profile that tracks milestones.
    /// Called once per child by the parent (guardian).
    ///
    /// V2 CHANGE: PDA seeded by child_wallet only (not guardian).
    /// This allows guardianship transfer without breaking PDA derivation.
    pub fn initialize_child(
        ctx: Context<InitializeChild>,
        child_name: String,
    ) -> Result<()> {
        require!(child_name.len() <= 32, TfnError::NameTooLong);

        let profile = &mut ctx.accounts.child_profile;
        profile.guardian = ctx.accounts.guardian.key();
        profile.child_wallet = ctx.accounts.child_wallet.key();
        profile.child_name = child_name;
        profile.milestone_count = 0;
        profile.total_deposited = 0;
        profile.total_claimed = 0;
        profile.deposit_count = 0;
        profile.status = 0; // Active
        profile.bump = ctx.bumps.child_profile;

        msg!("Child profile created for {}", profile.child_name);
        Ok(())
    }

    /// Create a milestone record for a tooth.
    /// The keepsake cNFT is minted separately via Bubblegum.
    /// Only the guardian can call this.
    pub fn create_milestone(
        ctx: Context<CreateMilestone>,
        tooth_type: ToothType,
        metadata_uri: String,
    ) -> Result<()> {
        let milestone_index = ctx.accounts.child_profile.milestone_count;
        let profile_key = ctx.accounts.child_profile.key();

        require!(
            milestone_index < MAX_MILESTONES,
            TfnError::MaxMilestonesReached
        );

        let profile = &mut ctx.accounts.child_profile;
        profile.milestone_count += 1;

        let now = Clock::get()?.unix_timestamp;

        let milestone = &mut ctx.accounts.milestone;
        milestone.child_profile = profile_key;
        milestone.tooth_type = tooth_type;
        milestone.metadata_uri = metadata_uri;
        milestone.deposit_lamports = 0;
        milestone.total_deposits = 0;
        milestone.deposit_count = 0;
        milestone.claimed = false;
        milestone.created_at = now;
        milestone.milestone_index = milestone_index;
        milestone.bump = ctx.bumps.milestone;

        msg!("Milestone {} created: {:?}", milestone_index + 1, milestone.tooth_type);
        Ok(())
    }

    // ========================================================================
    // DEPOSIT & CLAIM INSTRUCTIONS
    // ========================================================================

    /// Deposit SOL into an existing milestone's escrow.
    /// ANYONE can call this — parents, grandparents, uncles, friends.
    /// Each deposit is tracked as a separate Deposit account.
    /// A 2% platform fee is deducted and sent to the treasury.
    pub fn deposit(
        ctx: Context<MakeDeposit>,
        amount_lamports: u64,
        lock_period: LockPeriod,
        depositor_name: String,
    ) -> Result<()> {
        // Check pause
        require!(!ctx.accounts.config.paused, TfnError::ContractPaused);

        require!(amount_lamports >= MIN_DEPOSIT_LAMPORTS, TfnError::DepositTooSmall);
        require!(depositor_name.len() <= 32, TfnError::NameTooLong);

        let now = Clock::get()?.unix_timestamp;
        let lock_until = match lock_period {
            LockPeriod::Immediate => 0,
            LockPeriod::ThreeYears => now + (3 * SECONDS_PER_YEAR),
            LockPeriod::FiveYears => now + (5 * SECONDS_PER_YEAR),
            LockPeriod::SevenYears => now + (7 * SECONDS_PER_YEAR),
            LockPeriod::TenYears => now + (10 * SECONDS_PER_YEAR),
            LockPeriod::FifteenYears => now + (15 * SECONDS_PER_YEAR),
            LockPeriod::UntilTimestamp { lock_until } => {
                require!(lock_until > now, TfnError::InvalidLockTimestamp);
                lock_until
            }
        };

        // Calculate platform fee (2%) — fee is non-refundable
        let fee_lamports = amount_lamports * PLATFORM_FEE_BPS / FEE_DENOMINATOR;
        let net_lamports = amount_lamports - fee_lamports;

        // Transfer fee to treasury PDA
        if fee_lamports > 0 {
            let fee_transfer = anchor_lang::system_program::Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            };
            anchor_lang::system_program::transfer(
                CpiContext::new(ctx.accounts.system_program.to_account_info(), fee_transfer),
                fee_lamports,
            )?;

            // Track total fees collected
            ctx.accounts.treasury.total_collected += fee_lamports;
        }

        // Transfer net SOL from depositor to deposit PDA (the deposit account IS the vault)
        let transfer_ix = anchor_lang::system_program::Transfer {
            from: ctx.accounts.depositor.to_account_info(),
            to: ctx.accounts.deposit_account.to_account_info(),
        };
        anchor_lang::system_program::transfer(
            CpiContext::new(ctx.accounts.system_program.to_account_info(), transfer_ix),
            net_lamports,
        )?;

        // Set deposit data — amount_lamports stores NET (what child receives)
        let deposit = &mut ctx.accounts.deposit_account;
        deposit.milestone = ctx.accounts.milestone.key();
        deposit.depositor = ctx.accounts.depositor.key();
        deposit.depositor_name = depositor_name;
        deposit.amount_lamports = net_lamports;
        deposit.lock_until = lock_until;
        deposit.claimed = false;
        deposit.created_at = now;
        deposit.claimed_at = None;
        deposit.deposit_index = ctx.accounts.milestone.deposit_count;
        deposit.bump = ctx.bumps.deposit_account;

        // Update milestone totals (net amounts)
        let milestone = &mut ctx.accounts.milestone;
        milestone.total_deposits += net_lamports;
        milestone.deposit_count += 1;

        // Update profile totals (net amounts)
        let profile = &mut ctx.accounts.child_profile;
        profile.total_deposited += net_lamports;
        profile.deposit_count += 1;

        msg!(
            "Deposit #{}: {} lamports net (fee: {} lamports) to milestone {} by {} (locked until: {})",
            deposit.deposit_index,
            net_lamports,
            fee_lamports,
            milestone.milestone_index,
            deposit.depositor_name,
            lock_until
        );

        Ok(())
    }

    /// Claim a specific deposit — transfers escrowed SOL to the child's wallet.
    /// Only the guardian can trigger this (parental control).
    /// Respects time-lock: cannot claim before lock_until.
    pub fn claim_deposit(ctx: Context<ClaimDeposit>) -> Result<()> {
        // Check pause
        require!(!ctx.accounts.config.paused, TfnError::ContractPaused);

        let deposit = &ctx.accounts.deposit_account;
        let now = Clock::get()?.unix_timestamp;

        require!(!deposit.claimed, TfnError::AlreadyClaimed);
        require!(deposit.amount_lamports > 0, TfnError::NothingToClaim);

        // Enforce time-lock
        if deposit.lock_until > 0 {
            require!(
                now >= deposit.lock_until,
                TfnError::DepositStillLocked
            );
        }

        let amount = deposit.amount_lamports;

        // Transfer SOL from deposit PDA to child wallet
        **ctx.accounts.deposit_account.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.child_wallet.to_account_info().try_borrow_mut_lamports()? += amount;

        // Mark claimed
        let deposit = &mut ctx.accounts.deposit_account;
        deposit.claimed = true;
        deposit.claimed_at = Some(now);

        // Update profile totals
        let profile = &mut ctx.accounts.child_profile;
        profile.total_claimed += amount;

        msg!(
            "Deposit #{} claimed: {} lamports sent to child (from {})",
            deposit.deposit_index,
            amount,
            deposit.depositor_name
        );

        Ok(())
    }

    /// Early withdrawal — guardian can withdraw a time-locked deposit before maturity.
    /// A 10% penalty is deducted and sent to the treasury. 90% goes to the child wallet.
    /// Use this for emergencies or changed plans — the penalty discourages frivolous withdrawals.
    pub fn early_withdraw(ctx: Context<EarlyWithdraw>) -> Result<()> {
        // Check pause
        require!(!ctx.accounts.config.paused, TfnError::ContractPaused);

        let deposit = &ctx.accounts.deposit_account;
        let now = Clock::get()?.unix_timestamp;

        require!(!deposit.claimed, TfnError::AlreadyClaimed);
        require!(deposit.amount_lamports > 0, TfnError::NothingToClaim);

        // Only applies to time-locked deposits that haven't matured yet
        require!(
            deposit.lock_until > 0 && now < deposit.lock_until,
            TfnError::DepositNotLocked
        );

        let amount = deposit.amount_lamports;

        // Calculate 10% penalty
        let penalty = amount * EARLY_WITHDRAW_PENALTY_BPS / FEE_DENOMINATOR;
        let payout = amount - penalty;

        // Transfer penalty to treasury
        if penalty > 0 {
            **ctx.accounts.deposit_account.to_account_info().try_borrow_mut_lamports()? -= penalty;
            **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += penalty;
            ctx.accounts.treasury.total_collected += penalty;
        }

        // Transfer remaining 90% to child wallet
        **ctx.accounts.deposit_account.to_account_info().try_borrow_mut_lamports()? -= payout;
        **ctx.accounts.child_wallet.to_account_info().try_borrow_mut_lamports()? += payout;

        // Mark claimed
        let deposit = &mut ctx.accounts.deposit_account;
        deposit.claimed = true;
        deposit.claimed_at = Some(now);

        // Update profile totals (payout amount, not full — penalty is lost)
        let profile = &mut ctx.accounts.child_profile;
        profile.total_claimed += payout;

        msg!(
            "Early withdrawal: {} lamports to child, {} lamports penalty to treasury (deposit #{})",
            payout,
            penalty,
            deposit.deposit_index
        );

        Ok(())
    }

    /// Refund a deposit back to the original depositor.
    /// Only the ORIGINAL DEPOSITOR can call this.
    /// Only works within the 7-day grace period after deposit.
    /// Cannot refund if already claimed.
    pub fn refund_deposit(ctx: Context<RefundDeposit>) -> Result<()> {
        let deposit = &ctx.accounts.deposit_account;
        let now = Clock::get()?.unix_timestamp;

        require!(!deposit.claimed, TfnError::AlreadyClaimed);

        // Enforce grace period — can only refund within 7 days of deposit
        let deadline = deposit.created_at + REFUND_GRACE_PERIOD;
        require!(now <= deadline, TfnError::RefundPeriodExpired);

        let amount = deposit.amount_lamports;

        // Transfer SOL from deposit PDA back to depositor
        **ctx.accounts.deposit_account.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.depositor.to_account_info().try_borrow_mut_lamports()? += amount;

        // Update counters
        let milestone = &mut ctx.accounts.milestone;
        milestone.total_deposits -= amount;

        let profile = &mut ctx.accounts.child_profile;
        profile.total_deposited -= amount;

        // Mark as claimed (prevents double-refund)
        let deposit = &mut ctx.accounts.deposit_account;
        deposit.claimed = true;
        deposit.claimed_at = Some(now);
        deposit.amount_lamports = 0;

        msg!("Deposit #{} refunded: {} lamports returned to {}", deposit.deposit_index, amount, deposit.depositor_name);
        Ok(())
    }

    // ========================================================================
    // GUARDIAN MANAGEMENT INSTRUCTIONS
    // ========================================================================

    /// Transfer guardianship of a child profile to a new wallet.
    /// Only the current guardian can call this.
    pub fn transfer_guardianship(ctx: Context<TransferGuardianship>) -> Result<()> {
        // Check pause
        require!(!ctx.accounts.config.paused, TfnError::ContractPaused);

        let profile = &mut ctx.accounts.child_profile;
        let old_guardian = profile.guardian;
        profile.guardian = ctx.accounts.new_guardian.key();

        msg!("Guardianship transferred from {} to {}", old_guardian, profile.guardian);
        Ok(())
    }

    /// Update the child's destination wallet.
    /// Only the guardian can call this.
    pub fn update_child_wallet(ctx: Context<UpdateChildWallet>) -> Result<()> {
        let profile = &mut ctx.accounts.child_profile;
        let old_wallet = profile.child_wallet;
        profile.child_wallet = ctx.accounts.new_child_wallet.key();

        msg!("Child wallet updated from {} to {}", old_wallet, profile.child_wallet);
        Ok(())
    }

    // ========================================================================
    // QUERY INSTRUCTIONS
    // ========================================================================

    /// Get all milestones for a child (read-only — clients use getProgramAccounts).
    pub fn get_milestones(_ctx: Context<GetMilestones>) -> Result<()> {
        Ok(())
    }

    // ========================================================================
    // CLOSE / CLEANUP INSTRUCTIONS
    // ========================================================================

    /// Close a child profile and reclaim rent.
    /// Only the guardian can call this. All milestones must be closed first.
    /// Rent is returned to the guardian's wallet.
    pub fn close_profile(ctx: Context<CloseProfile>) -> Result<()> {
        let profile = &ctx.accounts.child_profile;
        require!(profile.milestone_count == 0 || profile.total_deposited == profile.total_claimed, TfnError::ProfileHasActiveDeposits);

        msg!("Profile closed for {}. Rent reclaimed.", profile.child_name);
        Ok(())
    }

    /// Close a milestone account and reclaim rent.
    /// Only the guardian can call this. All deposits for this milestone must be claimed or refunded.
    /// Rent is returned to the guardian's wallet.
    pub fn close_milestone(ctx: Context<CloseMilestone>) -> Result<()> {
        let milestone = &ctx.accounts.milestone;
        require!(milestone.total_deposits == 0 || milestone.deposit_count == 0, TfnError::MilestoneHasActiveDeposits);

        // Decrement milestone count on profile
        let profile = &mut ctx.accounts.child_profile;
        if profile.milestone_count > 0 {
            profile.milestone_count -= 1;
        }

        msg!("Milestone #{} closed. Rent reclaimed.", milestone.milestone_index);
        Ok(())
    }

    /// Close a deposit account and reclaim rent.
    /// Only callable after the deposit has been claimed or refunded (amount_lamports == 0).
    /// Rent is returned to the guardian's wallet.
    pub fn close_deposit(ctx: Context<CloseDeposit>) -> Result<()> {
        let deposit = &ctx.accounts.deposit_account;
        require!(deposit.claimed || deposit.amount_lamports == 0, TfnError::DepositStillActive);

        msg!("Deposit #{} closed. Rent reclaimed.", deposit.deposit_index);
        Ok(())
    }
}

// ============================================================================
// LOCK PERIODS
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, InitSpace)]
pub enum LockPeriod {
    Immediate,         // Available for claim right away
    ThreeYears,        // Locked for 3 years
    FiveYears,         // Locked for 5 years
    SevenYears,        // Locked for 7 years
    TenYears,          // Locked for 10 years
    FifteenYears,      // Locked for 15 years
    UntilTimestamp { lock_until: i64 }, // Custom timestamp — e.g. child's 18th birthday
}

// ============================================================================
// ACCOUNT STRUCTS
// ============================================================================

/// Global config — emergency pause and platform settings.
/// PDA: ["config"] (global singleton)
#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,      // Who can pause/unpause
    pub paused: bool,           // Emergency freeze flag
    pub bump: u8,               // PDA bump seed
}

/// Child profile — tracks milestones and deposits for one child.
/// V2 CHANGE: PDA seeded by child_wallet only (not guardian).
/// PDA: ["child_profile", child_wallet]
#[account]
#[derive(InitSpace)]
pub struct ChildProfile {
    pub guardian: Pubkey,       // Parent who controls this profile (mutable via transfer)
    pub child_wallet: Pubkey,   // Child's wallet (receives SOL on claim)
    #[max_len(32)]
    pub child_name: String,     // Display name
    pub milestone_count: u8,    // Number of milestones logged (max 20)
    pub total_deposited: u64,   // Total lamports deposited across all milestones
    pub total_claimed: u64,     // Total lamports claimed
    pub deposit_count: u32,     // Total number of deposits across all milestones
    pub status: u8,             // 0=active, 1=staking, 2=frozen (future use)
    pub bump: u8,               // PDA bump seed
}

#[account]
#[derive(InitSpace)]
pub struct Milestone {
    pub child_profile: Pubkey,  // Reference to parent ChildProfile
    pub tooth_type: ToothType,  // Which tooth
    #[max_len(200)]
    pub metadata_uri: String,   // Arweave URI to metadata JSON
    pub deposit_lamports: u64,  // SOL deposited by guardian at creation (legacy)
    pub total_deposits: u64,    // Total SOL deposited (all depositors combined)
    pub deposit_count: u32,     // Number of individual deposits
    pub claimed: bool,          // Has the guardian's initial deposit been claimed?
    pub created_at: i64,        // Unix timestamp of milestone creation
    pub claimed_at: Option<i64>,// Unix timestamp of claim (None if unclaimed)
    pub milestone_index: u8,    // Index within the child's milestones
    pub bump: u8,               // PDA bump seed
}

/// Individual deposit — one per depositor per milestone.
/// The deposit PDA itself holds the escrowed SOL.
#[account]
#[derive(InitSpace)]
pub struct Deposit {
    pub milestone: Pubkey,      // Which milestone this deposit is for
    pub depositor: Pubkey,      // Who deposited (wallet address)
    #[max_len(32)]
    pub depositor_name: String, // Display name ("Dad", "Grandma", "Uncle Jay")
    pub amount_lamports: u64,   // SOL amount escrowed
    pub lock_until: i64,        // Unix timestamp — 0 = immediate, >0 = time-locked
    pub claimed: bool,          // Has this deposit been claimed?
    pub created_at: i64,        // When deposited
    pub claimed_at: Option<i64>,// When claimed (None if unclaimed)
    pub deposit_index: u32,     // Sequential index within the milestone
    pub bump: u8,               // PDA bump seed
}

/// Platform treasury — collects 2% deposit fees + 10% early withdrawal penalties.
/// Single global PDA seeded by ["treasury"].
#[account]
#[derive(InitSpace)]
pub struct Treasury {
    pub authority: Pubkey,      // Who can withdraw fees (platform admin)
    pub total_collected: u64,   // Running total of all fees collected (lamports)
    pub bump: u8,               // PDA bump seed
}

// ============================================================================
// TOOTH TYPES (20 baby teeth)
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, InitSpace)]
pub enum ToothType {
    // Incisors (8 teeth)
    UpperRightCentralIncisor,
    UpperLeftCentralIncisor,
    LowerRightCentralIncisor,
    LowerLeftCentralIncisor,
    UpperRightLateralIncisor,
    UpperLeftLateralIncisor,
    LowerRightLateralIncisor,
    LowerLeftLateralIncisor,
    // Canines (4 teeth)
    UpperRightCanine,
    UpperLeftCanine,
    LowerRightCanine,
    LowerLeftCanine,
    // First Molars (4 teeth)
    UpperRightFirstMolar,
    UpperLeftFirstMolar,
    LowerRightFirstMolar,
    LowerLeftFirstMolar,
    // Second Molars (4 teeth)
    UpperRightSecondMolar,
    UpperLeftSecondMolar,
    LowerRightSecondMolar,
    LowerLeftSecondMolar,
}

// ============================================================================
// INSTRUCTION ACCOUNT CONTEXTS
// ============================================================================

/// Initialize global config PDA. Called once.
#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

/// Admin action (pause/unpause). Config authority must sign.
#[derive(Accounts)]
pub struct AdminAction<'info> {
    #[account(
        mut,
        constraint = authority.key() == config.authority @ TfnError::NotConfigAuthority,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
}

/// Initialize child profile.
/// V2 CHANGE: PDA seeded by ["child_profile", child_wallet] — guardian removed from seeds.
#[derive(Accounts)]
#[instruction(child_name: String)]
pub struct InitializeChild<'info> {
    #[account(mut)]
    pub guardian: Signer<'info>,

    /// CHECK: This is the child's wallet address — no signing required
    pub child_wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = guardian,
        space = 8 + ChildProfile::INIT_SPACE,
        seeds = [b"child_profile", child_wallet.key().as_ref()],
        bump
    )]
    pub child_profile: Account<'info, ChildProfile>,

    pub system_program: Program<'info, System>,
}

/// Create a milestone (cNFTs minted separately via Bubblegum).
/// V2 CHANGE: PDA seeds updated — no guardian in child_profile seeds.
#[derive(Accounts)]
#[instruction(tooth_type: ToothType, metadata_uri: String)]
pub struct CreateMilestone<'info> {
    #[account(mut)]
    pub guardian: Signer<'info>,

    #[account(
        mut,
        has_one = guardian,
        seeds = [b"child_profile", child_profile.child_wallet.as_ref()],
        bump = child_profile.bump
    )]
    pub child_profile: Account<'info, ChildProfile>,

    #[account(
        init,
        payer = guardian,
        space = 8 + Milestone::INIT_SPACE,
        seeds = [b"milestone", child_profile.key().as_ref(), &[child_profile.milestone_count]],
        bump
    )]
    pub milestone: Account<'info, Milestone>,

    pub system_program: Program<'info, System>,
}

/// Anyone can deposit SOL into an existing milestone.
/// The depositor pays for account creation + the deposit amount.
/// A 2% platform fee is sent to the treasury PDA.
#[derive(Accounts)]
#[instruction(amount_lamports: u64, lock_period: LockPeriod, depositor_name: String)]
pub struct MakeDeposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(mut)]
    pub child_profile: Account<'info, ChildProfile>,

    #[account(
        mut,
        constraint = milestone.child_profile == child_profile.key() @ TfnError::MilestoneMismatch,
    )]
    pub milestone: Account<'info, Milestone>,

    #[account(
        init,
        payer = depositor,
        space = 8 + Deposit::INIT_SPACE,
        seeds = [
            b"deposit",
            milestone.key().as_ref(),
            &milestone.deposit_count.to_le_bytes()
        ],
        bump
    )]
    pub deposit_account: Account<'info, Deposit>,

    /// Platform treasury — receives the 2% fee
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,

    /// Global config — checked for pause state
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

/// Only the guardian can claim a deposit — sends SOL to child's wallet.
/// Enforces time-lock: deposit.lock_until must be in the past.
#[derive(Accounts)]
pub struct ClaimDeposit<'info> {
    #[account(mut)]
    pub guardian: Signer<'info>,

    #[account(
        mut,
        has_one = guardian,
    )]
    pub child_profile: Account<'info, ChildProfile>,

    #[account(
        constraint = milestone.child_profile == child_profile.key() @ TfnError::MilestoneMismatch,
    )]
    pub milestone: Account<'info, Milestone>,

    #[account(
        mut,
        constraint = deposit_account.milestone == milestone.key() @ TfnError::DepositMismatch,
        constraint = !deposit_account.claimed @ TfnError::AlreadyClaimed,
    )]
    pub deposit_account: Account<'info, Deposit>,

    /// CHECK: Must match the child_wallet stored in child_profile
    #[account(
        mut,
        constraint = child_wallet.key() == child_profile.child_wallet @ TfnError::WrongChildWallet,
    )]
    pub child_wallet: UncheckedAccount<'info>,

    /// Global config — checked for pause state
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

/// Early withdrawal — guardian withdraws before maturity with 10% penalty.
#[derive(Accounts)]
pub struct EarlyWithdraw<'info> {
    #[account(mut)]
    pub guardian: Signer<'info>,

    #[account(
        mut,
        has_one = guardian,
    )]
    pub child_profile: Account<'info, ChildProfile>,

    #[account(
        constraint = milestone.child_profile == child_profile.key() @ TfnError::MilestoneMismatch,
    )]
    pub milestone: Account<'info, Milestone>,

    #[account(
        mut,
        constraint = deposit_account.milestone == milestone.key() @ TfnError::DepositMismatch,
        constraint = !deposit_account.claimed @ TfnError::AlreadyClaimed,
    )]
    pub deposit_account: Account<'info, Deposit>,

    /// CHECK: Must match the child_wallet stored in child_profile
    #[account(
        mut,
        constraint = child_wallet.key() == child_profile.child_wallet @ TfnError::WrongChildWallet,
    )]
    pub child_wallet: UncheckedAccount<'info>,

    /// Platform treasury — receives the 10% penalty
    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,

    /// Global config — checked for pause state
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>,
}

/// Refund: only the original depositor can reclaim, within 7-day grace period.
#[derive(Accounts)]
pub struct RefundDeposit<'info> {
    #[account(
        mut,
        constraint = depositor.key() == deposit_account.depositor @ TfnError::NotOriginalDepositor,
    )]
    pub depositor: Signer<'info>,

    #[account(mut)]
    pub child_profile: Account<'info, ChildProfile>,

    #[account(
        mut,
        constraint = milestone.child_profile == child_profile.key() @ TfnError::MilestoneMismatch,
    )]
    pub milestone: Account<'info, Milestone>,

    #[account(
        mut,
        constraint = deposit_account.milestone == milestone.key() @ TfnError::DepositMismatch,
        constraint = !deposit_account.claimed @ TfnError::AlreadyClaimed,
    )]
    pub deposit_account: Account<'info, Deposit>,

    pub system_program: Program<'info, System>,
}

/// Transfer guardianship to a new wallet. Current guardian must sign.
#[derive(Accounts)]
pub struct TransferGuardianship<'info> {
    #[account(
        mut,
        constraint = guardian.key() == child_profile.guardian @ TfnError::NotGuardian,
    )]
    pub guardian: Signer<'info>,

    #[account(mut)]
    pub child_profile: Account<'info, ChildProfile>,

    /// CHECK: The new guardian's wallet — no signing required (they accept by default)
    pub new_guardian: UncheckedAccount<'info>,

    /// Global config — checked for pause state
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
}

/// Update child's destination wallet. Guardian must sign.
#[derive(Accounts)]
pub struct UpdateChildWallet<'info> {
    #[account(
        constraint = guardian.key() == child_profile.guardian @ TfnError::NotGuardian,
    )]
    pub guardian: Signer<'info>,

    #[account(mut)]
    pub child_profile: Account<'info, ChildProfile>,

    /// CHECK: The new child wallet address
    pub new_child_wallet: UncheckedAccount<'info>,
}

/// Initialize the global treasury PDA. Called once.
#[derive(Accounts)]
pub struct InitializeTreasury<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Treasury::INIT_SPACE,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: Account<'info, Treasury>,

    pub system_program: Program<'info, System>,
}

/// Withdraw accumulated fees. Only the treasury authority can call this.
#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    #[account(
        mut,
        constraint = authority.key() == treasury.authority @ TfnError::NotTreasuryAuthority,
    )]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"treasury"],
        bump = treasury.bump,
    )]
    pub treasury: Account<'info, Treasury>,
}

#[derive(Accounts)]
pub struct GetMilestones<'info> {
    pub child_profile: Account<'info, ChildProfile>,
}

/// Close a child profile — guardian only, returns rent to guardian.
#[derive(Accounts)]
pub struct CloseProfile<'info> {
    #[account(
        mut,
        constraint = guardian.key() == child_profile.guardian @ TfnError::NotGuardian,
    )]
    pub guardian: Signer<'info>,

    #[account(
        mut,
        close = guardian,
    )]
    pub child_profile: Account<'info, ChildProfile>,
}

/// Close a milestone — guardian only, returns rent to guardian.
#[derive(Accounts)]
pub struct CloseMilestone<'info> {
    #[account(
        mut,
        constraint = guardian.key() == child_profile.guardian @ TfnError::NotGuardian,
    )]
    pub guardian: Signer<'info>,

    #[account(mut)]
    pub child_profile: Account<'info, ChildProfile>,

    #[account(
        mut,
        close = guardian,
        constraint = milestone.child_profile == child_profile.key() @ TfnError::MilestoneMismatch,
    )]
    pub milestone: Account<'info, Milestone>,
}

/// Close a deposit — guardian only, returns rent to guardian.
#[derive(Accounts)]
pub struct CloseDeposit<'info> {
    #[account(
        mut,
        constraint = guardian.key() == child_profile.guardian @ TfnError::NotGuardian,
    )]
    pub guardian: Signer<'info>,

    pub child_profile: Account<'info, ChildProfile>,

    #[account(
        constraint = milestone.child_profile == child_profile.key() @ TfnError::MilestoneMismatch,
    )]
    pub milestone: Account<'info, Milestone>,

    #[account(
        mut,
        close = guardian,
        constraint = deposit_account.milestone == milestone.key() @ TfnError::DepositMismatch,
    )]
    pub deposit_account: Account<'info, Deposit>,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum TfnError {
    #[msg("Child name must be 32 characters or fewer")]
    NameTooLong,
    #[msg("Maximum of 20 milestones per child")]
    MaxMilestonesReached,
    #[msg("This milestone has already been claimed")]
    AlreadyClaimed,
    #[msg("No deposit to claim")]
    NothingToClaim,
    #[msg("Child wallet does not match profile")]
    WrongChildWallet,
    #[msg("This tooth type has already been recorded")]
    DuplicateToothType,
    #[msg("Deposit amount must be greater than zero")]
    NothingToDeposit,
    #[msg("This deposit is still time-locked")]
    DepositStillLocked,
    #[msg("Milestone does not belong to this child profile")]
    MilestoneMismatch,
    #[msg("Deposit does not belong to this milestone")]
    DepositMismatch,
    #[msg("Deposit must be at least 10,000 lamports (0.00001 SOL)")]
    DepositTooSmall,
    #[msg("Refund period has expired (7 days from deposit)")]
    RefundPeriodExpired,
    #[msg("Only the original depositor can request a refund")]
    NotOriginalDepositor,
    #[msg("Only the guardian can perform this action")]
    NotGuardian,
    #[msg("Lock timestamp must be in the future")]
    InvalidLockTimestamp,
    #[msg("Insufficient treasury balance for withdrawal")]
    InsufficientTreasuryBalance,
    #[msg("Only the treasury authority can perform this action")]
    NotTreasuryAuthority,
    #[msg("Deposit is not time-locked or has already matured — use claim_deposit instead")]
    DepositNotLocked,
    #[msg("Profile has active deposits — claim or refund all deposits before closing")]
    ProfileHasActiveDeposits,
    #[msg("Milestone has active deposits — claim or refund all before closing")]
    MilestoneHasActiveDeposits,
    #[msg("Deposit is still active — must be claimed or refunded before closing")]
    DepositStillActive,
    #[msg("Contract is paused — no operations allowed")]
    ContractPaused,
    #[msg("Only the config authority can perform this action")]
    NotConfigAuthority,
}
