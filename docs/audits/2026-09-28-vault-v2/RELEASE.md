# Vault 2.0: the one mainnet upgrade (candidate)

Date: 2026-09-28 · Branch `claude/asset-rails` (on top of the Sept 25 asset rails, `eea10cb`) · Status: **candidate `07c625c`, reviewed by three AI models, deployed and walked on devnet.** Not on mainnet. Not a human audit.

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
   - **Exposure:** only a guardian mistake could trigger it (the app never calls these). **Impact:** total loss of that child's tokens. A mainnet scan found 0 deposits on a closed milestone today.
4. **All fees removed (owner, 2026-09-28).**
   - `PLATFORM_FEE_BPS` goes from 200 to 0 on the legacy SOL and USDC rails.
   - `MAX_ASSET_FEE_BPS` goes from 200 to 0, so no coin can carry a fee without a code upgrade.
   - Fees collected before the upgrade stay withdrawable.
   - The app's deposit worker becomes fee-aware first (product `fc4597be`). **It must be live in production before the upgrade executes.**
5. **No layout, seed or discriminator changes.** One error code, `AssetVaultNotEmpty`, is appended last.

**Not in the program (settings after the upgrade, Squads):**
- USDC onto the rails: `initialize_asset_config(USDC, 10_000, 0)`.
- cbBTC: min 1,000 sats.
- wSOL: min 0.001 SOL.
- The legacy `["token_config"]` USDC rail also becomes fee-free with the upgrade.

## Evidence (WSL, Anchor 0.30.1, nightly-2025-04-14)
- `cargo test --lib`: **27/27**, including **7 property tests at 4,096 random cases each**:
  - fees conserve every unit
  - a 0% rail locks the whole amount
  - accepted deposits always lock value into the future
  - claim vs early release split exactly at the opening date
  - settled deposits never pay twice
  - refunds are depositor-only for exactly 7 days
  - the asset config accepts only a 0 fee
- `anchor test`: **58 passing**. The 49 existing now expect whole amounts (no fee); the pre-upgrade fees stay withdrawable. Plus 9 in `tests/y2-vault-v2.ts`:
  - Dollars at 0%
  - wSOL deposit + guardian early release
  - "Grow it" (release early, re-lock as "Mum · grown")
  - rent recovery (refusals, both rents returned, stray-token refusal)
  - `close_milestone` refused
  - the takeover path blocked
  - an empty profile still closes
- Node release/layout/Squads checks: **29/29**.
- **Release artifact** (`no-idl,no-log-ix-name`): **547,680 bytes**, SHA-256 `6a494ecd047dd64b8fff8ce3443b94ad13161b2ff3895482ec7fc92cb50beae6`. The IDL is saved beside this file.
- **Devnet:** the program runs these exact bytes (dumped and hashed). The walk passed for all three coins (`devnet-walk.json`): deposit → release early → re-lock as grown → rent back.
- **AI review:** Sonnet 5, DeepSeek v4 and Qwen3 Coder, US$0.49 of the US$5 cap. No code change was required; every finding is answered in `tooth-fairy-network/docs/receipts/2026-09-28-vault-v2-contract-review/README.md`.

## Costs, read from mainnet 2026-09-28
- **ProgramData** `5ZUXyjYZaXAbSAC4EQk2Xu5HhEcogamn7gsG4Mnr7zkM`: 437,813 bytes. Its authority is the Squads vault `Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko`.
- **Extend:** 547,680 + 45 − 437,813 = **109,912 bytes = 0.559 SOL** (permanent rent). Mainnet has plain `ExtendProgram` active (`ExtendProgramChecked` inactive), so the deploy wallet can pay without Squads.
- **Upload buffer:** 547,717 bytes = **2.783 SOL**, temporary, refunded to the spill address on upgrade.
- **Total peak need: 3.342 SOL + fees.** The deploy wallet `5pip…YsXq` holds **3.928 SOL** (read 2026-09-28).

## Owner decisions (all answered 2026-09-28)
1. **The 7-day upgrade delay: yes, as a second multisig.**
   - **Why:** one Squads multisig (`1P8a…uz5`, 2-of-3) holds the upgrade, config and treasury authority. A Squads time lock applies to **every** transaction of that multisig, so an emergency **pause** would also wait 7 days.
   - **The setup:** a second Squads multisig with the same three members and a 7-day time lock holds **only the program upgrade authority**. Config (pause, coin settings) stays on the current one.
   - **Public line:** "any change to the contract's code is announced 7 days before it happens". Coin settings can't add a fee (the maximum is now 0 in code).
2. **Publishing this branch:** done after the review.
3. **The 2% fee:** removed (item 4).

## Mainnet order
1. **Production release AU** (product `fc4597be`): the deposit worker accepts fee-free landings. Owner OK required.
2. Extend the program (deploy wallet, 0.559 SOL).
3. Upload the buffer and hand its authority to the Squads vault.
4. **Squads upgrade:** the owner creates it and 2 of 3 sign.
5. Verify the deployed bytes and the unchanged existing deposits.
6. Set `TFN_ESCROW_FEE_BPS=0` in the next release.
7. **Coin settings** (Squads): USDC, cbBTC and wSOL at 0.
8. A canary per coin.
9. Create the time-locked second multisig and move the upgrade authority to it, last, so canary fixes aren't delayed 7 days.

## Known limits (disclosed, accepted)
- **cbBTC:** Coinbase holds a freeze authority on the mint. A frozen vault would stop that coin's release.
- **Griefing:** stray tokens sent into a settled vault block only that deposit's rent recovery (~0.0045 SOL), never a family's money.
- **Pause:** it stops refunds too (as the live USDC rail already does). Money stays locked for the child, never lost.
- **Legacy USDC deposits** (`["token_deposit"]`) still have no close instruction; there are only 17.
