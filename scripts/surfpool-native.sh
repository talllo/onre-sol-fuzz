#!/usr/bin/env bash
#
# Run surfpool locally WITHOUT docker.
#
# Forks mainnet, upgrades the on-fork program to the freshly built bytes, and
# overrides on-fork governance (State.boss / redemption_admin / upgrade
# authority) to a local keypair so you can drive the program with a key you
# control. This is the native equivalent of scripts/docker/surfpool-entrypoint.sh
# plus `pnpm surfpool:setup`.
#
# The heavy lifting lives in `pnpm surfpool:setup`
# (scripts/surfpool-regression/setup-upgrade.ts), which assumes surfpool is
# already running. This script just resolves the boss key, builds, boots the
# fork in the background, and runs that setup.
#
# Env overrides:
#   SURFPOOL_DATASOURCE_RPC_URL   datasource RPC to fork from
#                                 (defaults to $SOL_MAINNET_RPC_URL, else --network mainnet)
#   SURFPOOL_UPGRADE_AUTHORITY_KEYPAIR   path to the local boss/upgrade key
#                                 (default: ~/.config/solana/69YoSiSLEAJrTbZGy7Ry3p4jvJBjJpwn8g8HKcXcCguJ.json)
#   SURFPOOL_NATIVE_DIR           state dir for logs/pid (default: <repo>/.surfpool-native)
#   SURFPOOL_RPC_PORT / _WS_PORT / _STUDIO_PORT / _RPC_HOST
#   SURFPOOL_REGRESSION_SKIP_DEPLOY=1   skip the program upgrade (governance override only)
#
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

STATE_DIR="${SURFPOOL_NATIVE_DIR:-$REPO_ROOT/.surfpool-native}"
WALLET_PATH="${SURFPOOL_UPGRADE_AUTHORITY_KEYPAIR:-$HOME/.config/solana/69YoSiSLEAJrTbZGy7Ry3p4jvJBjJpwn8g8HKcXcCguJ.json}"
LOG_FILE="$STATE_DIR/surfpool.log"
PID_FILE="$STATE_DIR/surfpool.pid"

RPC_HOST="${SURFPOOL_RPC_HOST:-127.0.0.1}"
RPC_PORT="${SURFPOOL_RPC_PORT:-8899}"
WS_PORT="${SURFPOOL_WS_PORT:-8900}"
STUDIO_PORT="${SURFPOOL_STUDIO_PORT:-18488}"
AIRDROP_LAMPORTS="${SURFPOOL_AIRDROP_LAMPORTS:-10000000000000}"
LOCAL_RPC="http://127.0.0.1:${RPC_PORT}"
LOCAL_STUDIO="http://127.0.0.1:${STUDIO_PORT}"
DATASOURCE="${SURFPOOL_DATASOURCE_RPC_URL:-${SOL_MAINNET_RPC_URL:-}}"

mkdir -p "$STATE_DIR"

# 1. Resolve the local boss / upgrade-authority key (must already exist).
if [ ! -f "$WALLET_PATH" ]; then
    echo "ERROR: boss keypair not found: $WALLET_PATH" >&2
    echo "Set SURFPOOL_UPGRADE_AUTHORITY_KEYPAIR to an existing keypair path." >&2
    exit 1
fi
AUTHORITY_PUBKEY="$(solana-keygen pubkey "$WALLET_PATH")"
echo "Local boss / upgrade authority: $AUTHORITY_PUBKEY"

# 2. Stop any previous native surfpool and WAIT until the RPC port is actually
#    released. A lingering orphan holding port 8899 makes the new surfpool exit
#    ("RPC port already in use") while the setup below then connects to the
#    half-dead orphan (whose Studio is gone) and hangs on waitForStudio forever.
port_listener() { lsof -ti "TCP:${RPC_PORT}" -sTCP:LISTEN 2>/dev/null || true; }

# Tracked pid from a previous run.
if [ -f "$PID_FILE" ]; then
    OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    [ -n "$OLD_PID" ] && kill "$OLD_PID" 2>/dev/null || true
fi
# Anything owning the RPC listener socket (only the listener, so we never kill
# unrelated clients that merely hold a connection to it) plus stray surfpools.
LISTENER="$(port_listener)"
[ -n "$LISTENER" ] && kill $LISTENER 2>/dev/null || true
pkill -f "surfpool start" 2>/dev/null || true

if [ -n "${OLD_PID:-}${LISTENER}" ]; then
    echo "Waiting for previous surfpool to release port ${RPC_PORT}..."
    for _ in $(seq 1 30); do
        [ -z "$(port_listener)" ] && break
        sleep 0.5
    done
    REMAINING="$(port_listener)"
    if [ -n "$REMAINING" ]; then
        echo "Port ${RPC_PORT} still held; sending SIGKILL to $REMAINING"
        kill -9 $REMAINING 2>/dev/null || true
        sleep 1
    fi
fi

# 3. Build the current program so the fork gets today's code.
echo "Building program (anchor build)..."
anchor build

# 4. Choose the datasource to fork from.
if [ -n "$DATASOURCE" ]; then
    FORK_ARGS=(--rpc-url "$DATASOURCE")
    echo "Forking from datasource RPC (SURFPOOL_DATASOURCE_RPC_URL/SOL_MAINNET_RPC_URL)"
else
    FORK_ARGS=(--network mainnet)
    echo "Forking from --network mainnet (public RPC). Set SOL_MAINNET_RPC_URL for a faster endpoint."
fi

# 5. Boot surfpool in the background. Note: --skip-blockhash-check (used by the
#    docker image) is not available in surfpool 1.0.0, so it is intentionally omitted.
echo "Starting surfpool (logs: $LOG_FILE)"
nohup surfpool start \
    --host "$RPC_HOST" \
    --port "$RPC_PORT" \
    --ws-port "$WS_PORT" \
    --studio-port "$STUDIO_PORT" \
    --no-tui \
    --no-deploy \
    --airdrop-keypair-path "$WALLET_PATH" \
    --airdrop-amount "$AIRDROP_LAMPORTS" \
    "${FORK_ARGS[@]}" >"$LOG_FILE" 2>&1 &
SURFPOOL_PID=$!
echo "$SURFPOOL_PID" >"$PID_FILE"
echo "surfpool pid $SURFPOOL_PID"

# 5b. Fail fast: make sure THIS surfpool actually came up and bound the RPC port.
#     If it died (e.g. port conflict), abort loudly instead of letting the setup
#     connect to a stale instance and hang on the Studio check.
echo "Waiting for surfpool RPC on ${LOCAL_RPC}..."
RPC_UP=""
for _ in $(seq 1 60); do
    if ! kill -0 "$SURFPOOL_PID" 2>/dev/null; then
        echo "ERROR: surfpool exited during startup. Last log lines:" >&2
        tail -n 20 "$LOG_FILE" >&2
        rm -f "$PID_FILE"
        exit 1
    fi
    if curl -s -m 2 "$LOCAL_RPC" -X POST -H 'content-type: application/json' \
        -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' 2>/dev/null | grep -q '"result"'; then
        RPC_UP=1
        break
    fi
    sleep 1
done
if [ -z "$RPC_UP" ]; then
    echo "ERROR: surfpool RPC did not become ready at ${LOCAL_RPC}. Last log lines:" >&2
    tail -n 20 "$LOG_FILE" >&2
    kill "$SURFPOOL_PID" 2>/dev/null || true
    rm -f "$PID_FILE"
    exit 1
fi
echo "surfpool RPC is up."

# 6. Upgrade the on-fork program bytes and override governance to the local key.
export SURFPOOL_RPC_URL="$LOCAL_RPC"
export SURFPOOL_STUDIO_URL="$LOCAL_STUDIO"
export SURFPOOL_REGRESSION_UPGRADE_AUTHORITY_KEYPAIR="$WALLET_PATH"
export SURFPOOL_REGRESSION_SKIP_BUILD=1 # already built in step 3
export SURFPOOL_REGRESSION_WAIT_MS="${SURFPOOL_REGRESSION_WAIT_MS:-120000}"

pnpm surfpool:setup

cat <<EOF

=== Surfpool fork ready (native, no docker) ===
RPC:     $LOCAL_RPC
WS:      ws://127.0.0.1:$WS_PORT
Studio:  $LOCAL_STUDIO
Boss / upgrade authority: $AUTHORITY_PUBKEY
Keypair: $WALLET_PATH
Logs:    $LOG_FILE
Stop:    make surf-native-down   (or: kill \$(cat $PID_FILE))
EOF
