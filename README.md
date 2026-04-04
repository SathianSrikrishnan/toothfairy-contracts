# Tooth Fairy Network — Solana Escrow Contract

A multi-depositor escrow smart contract for gifting SOL to children, built with Anchor on Solana.

## Deployed on Mainnet

| | |
|---|---|
| **Program ID** | `FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC` |
| **Network** | Solana Mainnet-Beta |
| **Framework** | Anchor 0.30+ |
| **Explorer** | [View on Solscan](https://solscan.io/account/FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC) |

## Architecture

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

1. **Parent creates a child profile** — Sets guardian, child name, and optional time-lock
2. **Family & friends deposit SOL** — Multiple depositors can contribute to one child's escrow
3. **Time-lock protects funds** — Withdrawals blocked until the configured date (e.g., child's 18th birthday)
4. **Guardian withdraws** — Only the designated guardian can withdraw after the time-lock expires
5. **Platform fee** — Small fee collected in treasury PDA on deposit

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
anchor test
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
│   └── toothfairy-escrow.ts    # Integration tests
├── scripts/                     # Mainnet utility scripts
├── Anchor.toml                  # Anchor config
└── Cargo.toml
```

## Security

- Time-locked withdrawals prevent premature access
- Guardian-only withdrawal authorization
- Emergency admin controls for edge cases
- Multi-depositor support with individual deposit tracking
- All secrets loaded from environment variables (see `.env.example`)

## Part of Tooth Fairy Network

[toothfairy.network](https://toothfairy.network) — A platform for gifting SOL to the next generation.

Built by [Sathian S.](https://sathian.ai)
