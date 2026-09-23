#!/usr/bin/env bash

set -euo pipefail

test_file="${1:-}"
case "$test_file" in
  tests/toothfairy-escrow.ts|tests/usdc-escrow-v2.ts) ;;
  *)
    echo "Usage: $0 tests/toothfairy-escrow.ts|tests/usdc-escrow-v2.ts" >&2
    exit 2
    ;;
esac

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

solana_bin="${SOLANA_BIN_DIR:-$HOME/.local/share/solana/install/active_release/bin}"
wallet="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"
program_id="FqCSNerRsjdxamLyiyTvqiGKZ4vnfYngLUuTKtSi7RTC"
authority="5piptchcKR5qbJKqVJCjTo2rq1TouvpeAeH3XQuEYsXq"
ledger="$(mktemp -d /tmp/tfn-integration-ledger-XXXXXX)"
validator_log="$(mktemp /tmp/tfn-integration-validator-XXXXXX.log)"

"$solana_bin/solana-test-validator" \
  --ledger "$ledger" \
  --bind-address 127.0.0.1 \
  --rpc-port 8899 \
  --reset \
  --mint "$authority" \
  --bpf-program "$program_id" target/deploy/toothfairy_escrow.so \
  >"$validator_log" 2>&1 &
validator_pid=$!

cleanup() {
  kill "$validator_pid" 2>/dev/null || true
  wait "$validator_pid" 2>/dev/null || true
}
trap cleanup EXIT

ready=0
for _attempt in $(seq 1 30); do
  if "$solana_bin/solana" cluster-version --url http://127.0.0.1:8899 >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  tail -100 "$validator_log"
  exit 1
fi

ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
ANCHOR_WALLET="$wallet" \
  ./node_modules/.bin/ts-mocha -p ./tsconfig.json -t 180000 "$test_file"
