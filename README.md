# Tooth Fairy Network — Solana Escrow Contract

A multi-depositor escrow program for preserving separate SOL and canonical-USDC gifts with Toothlights.

## Release status

- **Mainnet today:** the deployed program supports native SOL only.
- **This branch:** USDC deposit, lock, claim, refund, early release, and fee withdrawal pass isolated local-validator tests.
- **Not yet deployed:** USDC remains off devnet and mainnet until the complete regression and security gates pass.
- **Compatibility rule:** existing `Config`, `ChildProfile`, `Milestone`, `Deposit`, and `Treasury` layouts and SOL instructions remain unchanged.

## Deployed SOL program on Mainnet

| | |
|---|---|
| **Program ID** | `FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC` |
| **Network** | Solana Mainnet-Beta |
| **Framework** | Anchor 0.30+ |
| **Explorer** | [View on Solscan](https://solscan.io/account/FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC) |

The table identifies the live SOL program. It is not evidence that this branch's USDC instructions are deployed.

## Legacy SOL architecture overview

```
┌─────────────────────────────────────────────────┐
│                  ESCROW CONTRACT                 │
│          FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC         │
├─────────────────────────────────────────────────┤
│                                                 │
│  Instructions (8):                              │
│  ├── initialize_treasury    (admin)             │
│  ├── create_child_profile   (guardian/server)   │
│  ├── deposit                (any depositor)     │
│  ├── withdraw               (guardian, time-locked) │
│  ├── close_child_profile    (guardian)          │
│  ├── close_child_profile_server (server auth)   │
│  ├── update_guardian        (current guardian)   │
│  └── emergency_withdraw     (admin, safety)     │
│                                                 │
│  Accounts:                                      │
│  ├── Treasury PDA       — platform fee receiver │
│  ├── ChildProfile PDA   — per-child escrow      │
│  └── DepositRecord PDA  — per-deposit tracking  │
│                                                 │
│  Features:                                      │
│  ├── Multi-depositor (family/friends)           │
│  ├── Time-locked withdrawals                    │
│  ├── Guardian transfer                          │
│  ├── Server-assisted profile creation           │
│  └── Emergency admin controls                   │
│                                                 │
└─────────────────────────────────────────────────┘
```

## How It Works

1. **A parent creates a child profile and milestone.**
2. **Family and friends may fund that milestone with SOL, and V2 adds canonical USDC as a separate rail.**
3. **Each deposit receives its own amount, depositor, vault, and opening date.**
4. **The guardian can release matured funds to the child's wallet.**
5. **Refund and early-release rules are enforced on-chain.**
6. **SOL and USDC remain separate balances and separate receipts.**

## Build & Test

### Prerequisites
- [Rust](https://rustup.rs/) + Solana CLI
- [Anchor CLI](https://www.anchor-lang.com/docs/installation) >= 0.30
- Node.js >= 18

### Build
```bash
anchor build
```

### Test (local validator)
```bash
node tests/account-layout-compatibility.test.mjs
cargo test -p toothfairy-escrow --lib
# Both lifecycle suites run against fresh isolated local validators. The helper
# binds to loopback explicitly for compatibility with current Agave releases.
bash scripts/run-isolated-integration.sh tests/toothfairy-escrow.ts
bash scripts/run-isolated-integration.sh tests/usdc-escrow-v2.ts
```

### Deploy
```bash
# Set your keypair and cluster
solana config set --keypair ~/.config/solana/id.json
solana config set --url <your-rpc-url>

anchor deploy
```

## Project Structure

```
├── programs/
│   └── toothfairy-escrow/
│       └── src/
│           └── lib.rs          # Contract source (all 8 instructions)
├── tests/
│   ├── toothfairy-escrow.ts    # Legacy SOL integration suite; pending repair
│   └── usdc-escrow-v2.ts       # Focused USDC lifecycle suite
├── scripts/                     # Mainnet utility scripts
├── Anchor.toml                  # Anchor config
└── Cargo.toml
```

## Security

- Time-locked withdrawals prevent premature access
- Guardian-only withdrawal authorization
- Emergency admin controls for edge cases
- Multi-depositor support with individual deposit tracking
- Canonical six-decimal mint allowlist; arbitrary tokens are rejected
- Checked token transfers and checked integer arithmetic
- Deterministic program-controlled deposit and treasury vaults
- All secrets loaded from environment variables (see `.env.example`)

## Part of Tooth Fairy Network

[toothfairy.network](https://toothfairy.network) — A platform for gifting SOL to the next generation.

Built by [Sathian S.](https://sathian.ai)
