#!/bin/bash
# Local partner-dashboard dev server (fixture mode by default)
# Usage: ./scripts/start-partner.sh
# Optional: REACT_APP_PARTNER_FIXTURE=false ./scripts/start-partner.sh  (needs API + auth)
#
# Note: CRA copies REACT_APP_* from .env literally — inline comments after the value
# (as in .env.sample: `REACT_APP_API_URL=http://localhost:3000  # Local API`) become
# part of the URL and break fetch. This script strips trailing `# …` from the value
# before starting. Fixture mode never calls the API; a dummy URL is set as a safety net.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
ENV_SAMPLE="$PROJECT_DIR/.env.sample"
SRC_DIR="$PROJECT_DIR/src"

if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env from .env.sample..."
    cp "$ENV_SAMPLE" "$ENV_FILE"
fi

# Backup index
cp "$SRC_DIR/index.tsx" "$SRC_DIR/index.bak.tsx"

cleanup() {
    if [ -f "$SRC_DIR/index.bak.tsx" ]; then
        mv "$SRC_DIR/index.bak.tsx" "$SRC_DIR/index.tsx"
        echo "Restored index.tsx"
    fi
}
trap cleanup EXIT

cp "$SRC_DIR/index-partner.tsx" "$SRC_DIR/index.tsx"

export PORT="${PORT:-3010}"
export REACT_APP_PARTNER_FIXTURE="${REACT_APP_PARTNER_FIXTURE:-true}"
export REACT_APP_PARTNER_KEY="${REACT_APP_PARTNER_KEY:-cake}"
export BROWSER="${BROWSER:-none}"

# Clean REACT_APP_API_URL: prefer already-exported value, else read from .env, strip inline comments
if [ -z "${REACT_APP_API_URL:-}" ] && [ -f "$ENV_FILE" ]; then
    raw_line="$(grep -E '^REACT_APP_API_URL=' "$ENV_FILE" | head -1 || true)"
    if [ -n "$raw_line" ]; then
        raw_val="${raw_line#REACT_APP_API_URL=}"
        export REACT_APP_API_URL="$(printf '%s' "$raw_val" | sed -E 's/[[:space:]]+#.*$//' | tr -d '"' | xargs)"
    fi
elif [ -n "${REACT_APP_API_URL:-}" ]; then
    export REACT_APP_API_URL="$(printf '%s' "$REACT_APP_API_URL" | sed -E 's/[[:space:]]+#.*$//' | xargs)"
fi

if [ "$REACT_APP_PARTNER_FIXTURE" = "true" ]; then
    # Unreachable placeholder — partner hook never fetches in fixture mode
    export REACT_APP_API_URL="${REACT_APP_API_URL:-http://127.0.0.1:9}"
    echo "Fixture mode: dashboard uses local demodaten only — no API requests are made."
    echo "  (Inline comments on REACT_APP_API_URL in .env are stripped; .env.sample is left unchanged.)"
fi

echo "Starting partner dashboard"
echo "  PORT=$PORT"
echo "  REACT_APP_PARTNER_FIXTURE=$REACT_APP_PARTNER_FIXTURE"
echo "  REACT_APP_PARTNER_KEY=$REACT_APP_PARTNER_KEY"
echo "  REACT_APP_API_URL=$REACT_APP_API_URL"

cd "$PROJECT_DIR"
npx react-app-rewired start
