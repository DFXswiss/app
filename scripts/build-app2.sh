#!/bin/bash
# DFX App 2.0 build script (React build target, mirrors build-widget.sh)
# Usage: ./scripts/build-app2.sh [dev|prod|loc]
# Default: prod

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
ENV_SAMPLE="$PROJECT_DIR/.env.sample"
SRC_DIR="$PROJECT_DIR/src"

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

echo "Building app2 for: $ENV"
echo "API: $API_URL"

# Backup files
cp "$ENV_FILE" "$ENV_FILE.backup"
cp "$SRC_DIR/index.tsx" "$SRC_DIR/index.bak.tsx"

# Cleanup function - restore files on exit (success or failure)
cleanup() {
    mv "$ENV_FILE.backup" "$ENV_FILE"
    mv "$SRC_DIR/index.bak.tsx" "$SRC_DIR/index.tsx"
}
trap cleanup EXIT

# Swap index for app2
cp "$SRC_DIR/index-app2.tsx" "$SRC_DIR/index.tsx"

# Modify .env for build (portable sed for macOS and Linux)
if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^REACT_APP_API_URL=.*|REACT_APP_API_URL=$API_URL|" "$ENV_FILE"
    sed -i '' "s|^REACT_APP_PUBLIC_URL=.*|REACT_APP_PUBLIC_URL=$PUBLIC_URL|" "$ENV_FILE"
else
    sed -i "s|^REACT_APP_API_URL=.*|REACT_APP_API_URL=$API_URL|" "$ENV_FILE"
    sed -i "s|^REACT_APP_PUBLIC_URL=.*|REACT_APP_PUBLIC_URL=$PUBLIC_URL|" "$ENV_FILE"
fi

# Add app2-specific config: document-relative assets so the build works
# unchanged at <host>/app2/ (hash routing keeps the document URL stable)
echo "BUILD_PATH=./app2-dist" >> "$ENV_FILE"
echo "GENERATE_SOURCEMAP=false" >> "$ENV_FILE"
echo "PUBLIC_URL=." >> "$ENV_FILE"

# Build
react-app-rewired build
