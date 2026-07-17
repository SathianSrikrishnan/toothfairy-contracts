# Mainnet USDC release gate

## Current state

- The existing mainnet program and SOL rail remain live.
- The additive USDC rail passes the combined local SOL + USDC regression suite.
- The read-only preflight confirms the live program, current admin accounts, and Circle's canonical six-decimal mainnet USDC mint.
- Mainnet USDC is not enabled and must remain hidden in the public product until the canary receipt is verified.

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

3. Create a 2-of-3 Squads multisig and record its vault address in the release receipt.
4. Pause through the existing config authority, then deploy the audited additive program upgrade using the existing upgrade authority.
5. In the same controlled release window, transfer:
   - program upgrade authority to the Squads vault;
   - config authority to the Squads vault;
   - SOL treasury authority to the Squads vault.
6. Through Squads, initialize the token config with only Circle mainnet USDC:
   `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (6 decimals).
7. Keep the program paused while verifying all three authorities and the token allowlist.
8. Run one canary Toothlight with a tiny SOL deposit and a 1.00 USDC deposit. Verify the 2% fee, two independent receipt accounts, lock date, and displayed balances.
9. Unpause through Squads. Enable USDC in the public interface only after the canary receipt is inspectable.

## Stop conditions

Do not deploy or initialize if any preflight blocker appears, if the build is not produced by the pinned release regression, if fewer than two multisig signers are available, or if the canonical mint/decimals differ.

If the canary differs from the expected balances or receipt state, keep the token rail paused and do not expose USDC to users.
