# Vault 2.0 mainnet receipt (2026-09-28)

| Step | Evidence |
|---|---|
| Extend (+109,912 bytes, 0.558 SOL) | `mainnet-extend.json`, tx `2uzypHCZ…hsvW` |
| Buffer = candidate, handed to Squads | `mainnet-buffer.json` (sha256 `6a494ecd…eae6`) |
| Squads tx #4, upgrade: proposal verified from chain, 2/2, executed | `mainnet-upgrade.json`, tx `323uioU8…CqNk` |
| Live code = candidate byte for byte; authority unchanged; buffer closed, 2.78 SOL refunded | `mainnet-upgrade.json` |
| All 289 pre-existing accounts unchanged | `mainnet-state-before.json` / `mainnet-state-after.json` |
| Squads tx #5, coin settings: Dollars, Bitcoin, Solana at 0% | `mainnet-coins-on.json` |

**Notes:**
- **Tx #5 verification:** Squads compressed it with the frozen lookup table `DZboAojT…xTfR`, whose entries 18/5/17 resolved to the USDC mint, System Program and wSOL mint. Instruction data matched exactly (minimums 10,000 / 1,000 / 1,000,000; fee 0). `mainnet-squads-verify-coins.mjs` does not resolve lookup tables yet, so it reported a false mismatch; it was checked by hand.
- **Executing from Squads:** the Phantom request opens in the window that pressed Execute. The phone's Execute did not send.
- **Still to do:**
  - Release v31 with `TFN_ESCROW_FEE_BPS=0` (until then a legacy deposit lands 10.204081, which the worker accepts)
  - A canary per coin
  - The time-locked upgrade multisig
