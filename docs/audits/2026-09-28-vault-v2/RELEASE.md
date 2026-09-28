# Vault 2.0: the one mainnet upgrade (candidate)

Date: 2026-09-28 · Branch `claude/asset-rails` (on top of the Sept 25 asset rails, `eea10cb`) · Status: **local candidate only.** Not on devnet or mainnet. The multi-model review is still to run; it isn't independently audited.

## What this upgrade carries
1. **The asset rails** (Sept 25, see `../2026-09-25-asset-rails/RELEASE.md`): per-coin allowlist, so Dollars (USDC), Bitcoin (cbBTC), Solana (wrapped SOL) and any later "Grow it" coin are **admin settings, not upgrades**.
2. **Rent recovery, new:** `close_settled_asset_deposit`.
   - The original depositor signs.
   - The deposit must be settled (claimed, refunded or released early) and its vault must be empty.
   - Both rents (the record plus the vault, ~0.0045 SOL) go back to that depositor.
   - Deposit indexes only increase, so a closed address is never reused.
3. **Safety fix to two existing instructions (pre-existing on mainnet):**
   - **`close_profile`** used to check only the SOL totals. For a Dollars-only child those are 0 = 0, so a guardian could close a profile that still held USDC. **Anyone** could then call `initialize_child` with the same child wallet, re-create the profile as its guardian, repoint payouts and early-withdraw everything.
     - **Now** it closes only a profile with no milestones, which can hold no deposits.
   - **`close_milestone`** had the same blind spot. Every USDC and asset release needs the milestone account, so closing one could strand money for good.
     - **Now** it's refused.
   - **Exposure:** only a guardian mistake could trigger it (the app never calls these). **Impact:** total loss of that child's tokens.
4. **No layout, seed or discriminator changes.** One error code, `AssetVaultNotEmpty`, is appended last.

**Not in the program (settings after the upgrade):**
- USDC onto the rails at 0%: `initialize_asset_config(USDC, 10_000, 0)`.
- cbBTC at 0%, min 1,000 sats.
- wSOL at 0%, min 0.001 SOL.
- The legacy `["token_config"]` rail keeps its hard-coded 2% for the old deposits. The app stops using it for new ones.

## Evidence (WSL, Anchor 0.30.1, nightly-2025-04-14)
- `cargo test --lib`: **27/27**, including **7 property tests at 4,096 random cases each**:
  - fees conserve every unit and never exceed 2%
  - a 0% rail locks the whole amount
  - accepted deposits always lock value into the future
  - claim vs early release split exactly at the opening date
  - settled deposits never pay twice
  - refunds are depositor-only for exactly 7 days
  - the asset-config bounds
- `anchor test`: **58 passing**. The 49 existing are unchanged, plus 9 in `tests/y2-vault-v2.ts`:
  - Dollars at 0%
  - wSOL deposit + guardian early release
  - "Grow it" (release early, then re-lock under "Mum · grown" to a new date)
  - rent recovery: refuses an active deposit and a non-depositor, returns both rents, refuses when stray tokens sit in the vault
  - `close_milestone` refused
  - the takeover path blocked
  - an empty profile still closes
- Node release/layout/Squads checks: **29/29**.
- **Release artifact** (`no-idl,no-log-ix-name`): **548,464 bytes**, SHA-256 `bfda63a9c58ee4e5972180f7e8e111f44725fc6f5da4728a33f3df15e57dbb97`. The IDL is saved beside this file.

## Costs, read from mainnet 2026-09-28
- **ProgramData** `5ZUXyjYZaXAbSAC4EQk2Xu5HhEcogamn7gsG4Mnr7zkM`: 437,813 bytes. Its authority is the Squads vault `Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko`.
- **Extend:** 548,464 + 45 − 437,813 = **110,696 bytes = 0.563 SOL** (permanent rent, `getMinimumBalanceForRentExemption`).
- **Upload buffer:** 548,501 bytes = **2.787 SOL**, temporary, refunded to the spill address on upgrade.
- **Total peak need: ~3.36 SOL + fees.** The deploy wallet held 3.93 SOL at last check; re-read it before execution.

## Owner decisions before mainnet
1. **The 7-day upgrade delay.** One Squads multisig (`1P8a…uz5`, 2-of-3) holds the upgrade, config and treasury authority today. A Squads time lock applies to **every** transaction of that multisig, so an emergency **pause** would also wait 7 days.
   - **Recommendation:** create a second Squads multisig with the same three members and a 7-day time lock, and move **only the program upgrade authority** to its vault. Config (pause, coin settings) stays on the current multisig.
   - **Cost:** the multisig's rent plus Squads' creation fee, if any; read it at execution.
   - **Honest limit:** coin settings stay instant. That includes a fee of up to 2% on *new* deposits, so the public line should read "any change to the contract's rules is announced 7 days before it happens".
2. **Pushing this branch:** the repo is public. Recommended: push after the multi-model review is answered.
3. **Order on mainnet:**
   1. extend
   2. upload the buffer
   3. Squads upgrade (2 signatures)
   4. verify the bytes and the existing deposits
   5. the coin settings (Squads)
   6. canary per coin
   7. the time-locked multisig handoff last, so the canary fixes aren't delayed 7 days

## Known limits (disclosed, accepted)
- **cbBTC:** Coinbase holds a freeze authority on the mint. A frozen vault would stop that coin's release.
- **Griefing:** stray tokens sent into a settled vault block only that deposit's rent recovery (~0.0045 SOL), never a family's money.
- **Legacy USDC deposits** (`["token_deposit"]`) still have no close instruction; there are only a few.
