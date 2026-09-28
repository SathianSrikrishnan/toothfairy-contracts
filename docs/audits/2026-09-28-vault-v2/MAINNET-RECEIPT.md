# Vault 2.0 mainnet receipt (2026-09-28)

| Step | Evidence |
|---|---|
| Extend (+109,912 bytes, 0.558 SOL) | `mainnet-extend.json`, tx `2uzypHCZ…hsvW` |
| Buffer = candidate, handed to Squads | `mainnet-buffer.json` (sha256 `6a494ecd…eae6`) |
| Squads tx #4, upgrade: proposal verified from chain, 2/2, executed | `mainnet-upgrade.json`, tx `323uioU8…CqNk` |
| Live code = candidate byte for byte; authority unchanged; buffer closed, 2.78 SOL refunded | `mainnet-upgrade.json` |
| All 289 pre-existing accounts unchanged | `mainnet-state-before.json` / `mainnet-state-after.json` |
| Squads tx #5, coin settings: Dollars, Bitcoin, Solana at 0% | `mainnet-coins-on.json` |
| **Canary on real money, all 3 coins passed:** US$1.01 USDC, 1,709 sats cbBTC and 0.0085 SOL each deposited (5-year lock), 0 fee taken, released early by the guardian in full, both rents recovered (3,205,560 lamports each), coins returned | `mainnet-canary.json` |
| **7-day upgrade delay live:** new Squads multisig `DqPU…xNbo` (same 3 members, 2 of 3, time lock 604,800 s, autonomous) holds the program upgrade authority via vault `73ug…z4LE` (Squads tx #6 on the current safe, verified from chain before approvals). Pause and coin settings stay with `Eu4B…uYko` (instant) | `mainnet-timelock-safe.json`, `mainnet-upgrade-authority-handoff.json` |
| Production v31 (`dpl_vZaxoBVvN2JKarxtPLFiPXzF4EcA`): `TFN_ESCROW_FEE_BPS=0`, 37/37, worker 200s, print-QR 3/3 | product repo |

**Notes:**
- **Tx #5 verification:** Squads compressed it with the frozen lookup table `DZboAojT…xTfR`, whose entries 18/5/17 resolved to the USDC mint, System Program and wSOL mint. Instruction data matched exactly (minimums 10,000 / 1,000 / 1,000,000; fee 0). `mainnet-squads-verify-coins.mjs` does not resolve lookup tables yet, so it reported a false mismatch; it was checked by hand.
- **Executing from Squads:** the Phantom request opens in the window that pressed Execute. The phone's Execute did not send.
- **Still to do:**
  - **The first swap attempt timed out and was proven dead before the retry** (a busy network; the script now pays a capped priority fee and waits for the validity window)
