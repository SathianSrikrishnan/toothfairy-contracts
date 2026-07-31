#!/usr/bin/env bash
set -euo pipefail

export PATH="$HOME/.cargo/bin:$PATH"
rustup toolchain install nightly-2025-04-14 --profile minimal
