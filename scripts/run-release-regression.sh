#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
anchor_cli="${TFN_ANCHOR_CLI:-$HOME/.avm/versions/0.30.1/bin/anchor}"
# Keep Windows PATH entries with spaces out of Anchor's spawned test commands.
# Every executable required by this release regression is in these WSL paths.
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export RUSTUP_TOOLCHAIN="nightly-2025-04-14"

if [[ ! -x "$anchor_cli" ]]; then
  echo "Anchor 0.30.1 is required at $anchor_cli" >&2
  exit 1
fi

cd "$repo_root"
export RUSTFLAGS="${RUSTFLAGS:-} --cfg procmacro2_semver_exempt"
"$anchor_cli" test

# Anchor's test build includes on-chain IDL management and instruction-name
# logging. Neither is needed by the deployable program: the client IDL remains
# a separate JSON artifact. Rebuild last with the audited release features so
# target/deploy always contains the rent-efficient Mainnet candidate.
cargo build-sbf \
  --manifest-path programs/toothfairy-escrow/Cargo.toml \
  --features no-idl,no-log-ix-name \
  --sbf-out-dir target/deploy

node --test tests/release-config.test.mjs
