# Mainnet USDC release gate

## Current state (July 30, 2026)

- The additive program upgrade is deployed on Mainnet at slot `436210094`.
- The live ProgramData bytes are 437,768 bytes and exactly match SHA-256
  `04cc06a3f9b6795b472a3de6e8a2c5b15b0f8d71135f1a5f4034f735e743d1e0`.
- The program is paused while the controlled Mainnet canaries are prepared.
- The additive USDC rail passes the combined local SOL + USDC regression suite.
- The audited release build at contract commit `afe639e` is 437,768 bytes with
  SHA-256 `04cc06a3f9b6795b472a3de6e8a2c5b15b0f8d71135f1a5f4034f735e743d1e0`.
  It builds for size and excludes Anchor's unused on-chain IDL management and
  instruction-name logging. The separate 54,181-byte client IDL is unchanged.
- The read-only preflight confirms the live program, current admin accounts, and Circle's canonical six-decimal mainnet USDC mint.
- The Squads account at `1P8a83j4SK28JCSTMpv5w7HS92ko5Ki5xGcyfy68uz5`
  is independently decoded on chain as an exact 2-of-3 of Signers A, B, and C.
  Its vault is `Eu4B39JRKpFs4uHuXYd79tLeQpKdhbkeW3ErPDDLuYko`.
- Program upgrade, config, and SOL treasury authority are verified as that
  Squads vault.
- The 82-byte token-config PDA is initialized with only canonical Circle
  Mainnet USDC `EPjFWdd5...Dt1v`, six decimals, and the Squads vault as
  authority. The finalized execution receipt is
  `4nawDqbxwhPQXshW4PtPaB7hTeGb9Vz2UZbtHKnQfGGdjVLqQmE6Em5KttMcyN2QHiZHNGL57nWGeyBci5sWW7K9`.
- Mainnet USDC is not enabled and must remain hidden in the public product until the canary receipt is verified.

## Exact upgrade liquidity

The July 30 Mainnet rent quote for the audited 437,768-byte artifact is:

- 437,805-byte temporary loader buffer: 3.04801368 SOL;
- ProgramData target length 437,813 bytes: 3.04806936 SOL total rent;
- existing ProgramData rent: 2.69227416 SOL;
- permanent ProgramData top-up: 0.35579520 SOL;
- total liquidity during the upgrade: 3.40380888 SOL before transaction fees.

The buffer is temporary and should be closed after a verified upgrade so its
rent can be recovered. Only the ProgramData top-up and network fees are
permanent. This replaces the obsolete 5.33501400 SOL estimate for the earlier
576,504-byte build.

## Why control moves first

The current program upgrade authority, emergency config, and SOL-fee treasury are controlled by one system wallet. Before a new asset rail is deployed, those controls move to a 2-of-3 Squads multisig. One lost or compromised key can then neither strand the program nor change it alone.

Use three independent adult/operator signers. Do not use a child's recipient wallet as an administrative signer. Keep at least one signer on a separate device or hardware wallet.

## Release sequence

1. Run the exact release regression:

   ```bash
   bash scripts/install-release-toolchain.sh
   bash scripts/run-release-regression.sh
   ```

2. Run the read-only live-chain preflight:

   ```bash
   npm run preflight:mainnet-usdc
   ```

3. [Done] Create and independently verify the 2-of-3 Squads multisig.
4. [Done] Pause through the existing config authority, then deploy and hash-verify
   the audited additive program upgrade using the existing upgrade authority.
5. [Done] In the same controlled release window, transfer:
   - program upgrade authority to the Squads vault;
   - config authority to the Squads vault;
   - SOL treasury authority to the Squads vault.
6. [Done] Through Squads, initialize the token config with only Circle mainnet USDC:
   `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6 decimals).
7. [Done] Keep the program paused while verifying all three authorities and the token allowlist.
8. Unpause through Squads for a tightly controlled canary window.
9. Run one canary Toothlight with a `0.01 SOL` deposit and a `1.00 USDC`
   deposit. Verify exact fees and protected amounts:
   - SOL: `0.0002 SOL` fee and `0.0098 SOL` protected;
   - USDC: `0.02 USDC` fee and `0.98 USDC` protected.
10. If either canary fails, pause immediately through Squads and keep the
    application feature gate off.
11. Enable USDC in the public interface only after both canary receipts and
    displayed balances are independently verified.

## Stop conditions

Do not deploy or initialize if any preflight blocker appears, if the build is not produced by the pinned release regression, if fewer than two multisig signers are available, or if the canonical mint/decimals differ.

If the canary differs from the expected balances or receipt state, keep the token rail paused and do not expose USDC to users.
