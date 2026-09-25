# Asset rails: per-mint allowlist (cbBTC and future SPL assets)

Date: 2026-09-25 · Branch `claude/asset-rails` (from `codex/usdc-escrow-v2` @ `9cd3b29`) · Status: **local candidate only**. Not on devnet or mainnet, and not independently reviewed.
Authority: owner superseded D9 ("no contract change") on 2026-09-25: "drop the no-contract change … free to edit it and make sure you can test it … make sure it's rigid."

## What changed (additive only)
- **New accounts:**
  - `AssetConfig` `["asset_config", mint]`: the mint's decimals, minimum deposit, fee (≤ 200 bps) and a new-deposit switch. Its ATA is that asset's fee treasury.
  - `AssetMilestone` `["asset_milestone", milestone, mint]`: per-asset totals, so BTC never sums with dollars.
- **Asset deposits** reuse the `TokenDeposit` layout at `["asset_deposit", milestone, mint, index]`, with the deposit's ATA as the vault.
- **New instructions:** `initialize_asset_config`, `update_asset_config`, `deposit_asset`, `claim_asset_deposit`, `refund_asset_deposit`, `early_withdraw_asset_deposit`, `withdraw_asset_treasury`.
- **Unchanged:** every existing account layout, seed and instruction (the SOL rail, the `["token_config"]` USDC rail, guardian transfer and child-wallet update). Six new error codes are added **after** the existing ones, so existing codes (e.g. 6025/6026) don't shift.

## Rules the tests prove (`tests/y-asset-rails.ts`, 17 cases)
- Only the config authority can allowlist or change an asset. Fees above 2% are refused. Token-2022 mints are refused by type.
- $10 of BTC (11,911 sats at 8 decimals): the exact 2% fee goes to the asset treasury and the net is locked in a per-deposit vault.
- Two assets in one tooth keep separate totals.
- Refused: a mint that isn't allowlisted; one asset's rules applied to another mint; deposits below the minimum; a non-canonical vault; any deposit while the global pause is on.
- Release is guardian-only. It goes only into the child-wallet token account, and not before the opening date unless it's a guardian early release.
- **Switching an asset off stops new deposits but never traps existing ones:** claims still work. Double claims are refused.
- Refunds are original-depositor-only, inside 7 days.
- After a guardian handover, only the new guardian can release, and only to the new wallet.
- Only the config authority can withdraw fees.

## Evidence (WSL, Anchor 0.30.1, nightly-2025-04-14, local validator)
- `cargo test --lib`: **19/19** (5 new).
- `anchor test`: **49 passing**. The 30 pre-existing SOL/USDC/continuity tests are unchanged, plus 17 new asset-rail tests and 2 continuity tests.
- Release config, layout compatibility and suite isolation: **7/7**.
- Release artifact (`no-idl,no-log-ix-name`): 536,912 bytes, SHA-256 `46fa97a140464bd032e3af34ec1c33e5d1867c5d6a2fe1c0fd986510196ff14d`. The IDL is saved beside this file as `idl.json`.

## Before mainnet (none of this is authorized yet)
1. **Program extend.** Mainnet ProgramData holds 437,813 bytes; this build needs 536,912 + 45. Extend by about 99.2 KB, which costs ~0.69 SOL permanent rent. The upload buffer needs ~3.74 SOL temporarily, refunded to the spill address, as on Sept 17. Check whether ExtendProgram needs the upgrade-authority (Squads) signature on current mainnet.
2. **Independent review** of the new instructions.
3. **Devnet:** deploy, allowlist a mock 8-decimal mint, run the flows.
4. **Squads 2-of-3 upgrade** using the Sept 17 path (`scripts/*continuity*` as the template). Verify bytes, then verify the Mei/Anaya/Miles/Maya deposits are unchanged.
5. **Allowlist real cbBTC:** `cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij`. Read on-chain 2026-09-25: classic SPL Token, 8 decimals, **Coinbase holds a freeze authority**. Proposed minimum 1,000 sats; fee per the owner's 2% decision. The config authority signs, so this is a Squads transaction if the config authority is the multisig.
6. Tiny mainnet canary deposit, then turn on the "Bitcoin" badge (S8 claims gate).

## Known follow-ups
- Token deposits (legacy and asset) have no close instruction, so ~0.0045 SOL of rent per deposit stays locked forever. A `close_settled_asset_deposit` that returns rent to the payer would recover it. It's worth adding before volume.
- App integration: S1 picker, S3 quote/inventory, and ledger reads of `AssetMilestone`. The client IDL lives in `tooth-fairy-network` `src/lib/solana/escrow-idl.json`.
