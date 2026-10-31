#!/bin/bash
# Build script
# Usage: ./scripts/build.sh [dev|prod|loc]
# Default: prod

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
ENV_SAMPLE="$PROJECT_DIR/.env.sample"

# Create .env from sample if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating .env from .env.sample..."
    cp "$ENV_SAMPLE" "$ENV_FILE"
fi

ENV="${1:-prod}"

case $ENV in
  dev)
    API_URL="https://dev.api.dfx.swiss"
    PUBLIC_URL="https://dev.app.dfx.swiss"
    ;;
  loc)
    API_URL="http://localhost:3000"
    PUBLIC_URL="http://localhost:3001"
    ;;
  prod|*)
    API_URL="https://api.dfx.swiss"
    PUBLIC_URL="https://app.dfx.swiss"
    ;;
esac

echo "Building for: $ENV"
echo "API: $API_URL"

# Backup original .env
cp "$ENV_FILE" "$ENV_FILE.backup"

# Cleanup function - restore .env on exit (success or failure)
cleanup() {
    mv "$ENV_FILE.backup" "$ENV_FILE"
}
trap cleanup EXIT

# Modify .env for build (portable sed for macOS and Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^REACT_APP_API_URL=.*|REACT_APP_API_URL=$API_URL|" "$ENV_FILE"
    sed -i '' "s|^REACT_APP_PUBLIC_URL=.*|REACT_APP_PUBLIC_URL=$PUBLIC_URL|" "$ENV_FILE"
else
    sed -i "s|^REACT_APP_API_URL=.*|REACT_APP_API_URL=$API_URL|" "$ENV_FILE"
    sed -i "s|^REACT_APP_PUBLIC_URL=.*|REACT_APP_PUBLIC_URL=$PUBLIC_URL|" "$ENV_FILE"
fi

# Build. INLINE_RUNTIME_CHUNK=false makes the webpack runtime a file under static/js instead of an
# inline <script> in index.html, so the Content Security Policy in public/_headers can allow
# scripts from 'self' only.
INLINE_RUNTIME_CHUNK=false CI=false react-app-rewired build
