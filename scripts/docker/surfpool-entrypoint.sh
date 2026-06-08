#!/usr/bin/env bash
set -Eeuo pipefail

WALLET_DIR="${SURFPOOL_WALLET_DIR:-/workspace/.docker-surfpool}"
WALLET_PATH="${SURFPOOL_UPGRADE_AUTHORITY_KEYPAIR:-$WALLET_DIR/upgrade-authority.json}"
SURFPOOL_RPC_HOST="${SURFPOOL_RPC_HOST:-0.0.0.0}"
SURFPOOL_RPC_PORT="${SURFPOOL_RPC_PORT:-8899}"
SURFPOOL_WS_PORT="${SURFPOOL_WS_PORT:-8900}"
SURFPOOL_STUDIO_PORT="${SURFPOOL_STUDIO_PORT:-18488}"
SURFPOOL_AIRDROP_LAMPORTS="${SURFPOOL_AIRDROP_LAMPORTS:-10000000000000}"
LOCAL_RPC="http://127.0.0.1:${SURFPOOL_RPC_PORT}"
LOCAL_STUDIO="http://127.0.0.1:${SURFPOOL_STUDIO_PORT}"

mkdir -p "$WALLET_DIR" scripts/ui/public

if [ ! -f "$WALLET_PATH" ]; then
    solana-keygen new --no-bip39-passphrase --silent --force -o "$WALLET_PATH"
fi

AUTHORITY_PUBKEY="$(solana-keygen pubkey "$WALLET_PATH")"
echo "Surfpool upgrade authority: ${AUTHORITY_PUBKEY}"

if [ -n "${SURFPOOL_DATASOURCE_RPC_URL:-}" ]; then
    FORK_ARGS=(--rpc-url "$SURFPOOL_DATASOURCE_RPC_URL")
else
    unset SURFPOOL_DATASOURCE_RPC_URL
    FORK_ARGS=(--network mainnet)
fi

surfpool start \
    --host "$SURFPOOL_RPC_HOST" \
    --port "$SURFPOOL_RPC_PORT" \
    --ws-port "$SURFPOOL_WS_PORT" \
    --studio-port "$SURFPOOL_STUDIO_PORT" \
    --no-tui \
    --no-deploy \
    --skip-blockhash-check \
    --airdrop-keypair-path "$WALLET_PATH" \
    --airdrop-amount "$SURFPOOL_AIRDROP_LAMPORTS" \
    "${FORK_ARGS[@]}" &

SURFPOOL_PID=$!
cleanup() {
    kill "$SURFPOOL_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

export SURFPOOL_RPC_URL="$LOCAL_RPC"
export SURFPOOL_STUDIO_URL="$LOCAL_STUDIO"
export SURFPOOL_REGRESSION_UPGRADE_AUTHORITY_KEYPAIR="$WALLET_PATH"
export SURFPOOL_REGRESSION_SKIP_BUILD="${SURFPOOL_REGRESSION_SKIP_BUILD:-1}"

pnpm surfpool:setup

cat > scripts/ui/public/surfpool-env.json <<EOF
{
  "rpcUrl": "/rpc",
  "studioUrl": "http://127.0.0.1:${SURFPOOL_STUDIO_PORT}",
  "upgradeAuthority": "${AUTHORITY_PUBKEY}",
  "disclaimer": "Local Surfpool only. These cheatcodes patch the running fork and do not work against the production mainnet program."
}
EOF

export UI_HOST="${UI_HOST:-0.0.0.0}"
export UI_PORT="${UI_PORT:-5173}"
export UI_RPC_PROXY_TARGET="$LOCAL_RPC"

pnpm exec vite --config scripts/ui/vite.config.ts --host "$UI_HOST" --port "$UI_PORT"
