#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
anchor_cli="${TFN_ANCHOR_CLI:-$HOME/.avm/versions/0.30.1/bin/anchor}"
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
export RUSTUP_TOOLCHAIN="nightly-2025-04-14"

if [[ ! -x "$anchor_cli" ]]; then
  echo "Anchor 0.30.1 is required at $anchor_cli" >&2
  exit 1
fi

cd "$repo_root"
export RUSTFLAGS="${RUSTFLAGS:-} --cfg procmacro2_semver_exempt"
exec "$anchor_cli" test
