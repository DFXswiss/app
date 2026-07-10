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

# ---------------------------------------------------------------------------
# Post-build: give app2 its own favicon/manifest identity, not the main app's (verified finding
# #3). public/index.html is shared with the main app (not ours to edit) and resolves its favicon/
# apple-touch-icon/manifest tags against %REACT_APP_PUBLIC_URL%, which for this build is the
# *main* app's origin ($PUBLIC_URL above, e.g. https://app.dfx.swiss) — left as-is, those tags
# under /app2/ would point at the root app's PWA identity (wrong icon, wrong name, "Add to Home
# Screen" would install the main app). Rewrite the built output instead of the template, and copy
# in app2's own icons + manifest — the same ones public/app2/'s static preview already ships.
# ---------------------------------------------------------------------------
APP2_DIST="$PROJECT_DIR/app2-dist"
APP2_HTML="$APP2_DIST/index.html"
APP2_STATIC_DIR="$PROJECT_DIR/public/app2"

if [ -f "$APP2_HTML" ]; then
    echo "Rewriting app2-dist/index.html favicon/manifest tags to app2's own identity..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' -E 's#<link rel="icon" href="[^"]*/favicon\.ico" */?>#<link rel="icon" href="./favicon.svg" type="image/svg+xml"/><link rel="icon" href="./favicon-32.png" sizes="32x32" type="image/png"/>#' "$APP2_HTML"
        sed -i '' -E 's#<link rel="apple-touch-icon" href="[^"]*/logo\.png" */?>#<link rel="apple-touch-icon" href="./apple-touch-icon.png"/>#' "$APP2_HTML"
        sed -i '' -E 's#<link rel="manifest" href="[^"]*/manifest\.json" */?>#<link rel="manifest" href="./manifest.webmanifest"/>#' "$APP2_HTML"
    else
        sed -i -E 's#<link rel="icon" href="[^"]*/favicon\.ico" */?>#<link rel="icon" href="./favicon.svg" type="image/svg+xml"/><link rel="icon" href="./favicon-32.png" sizes="32x32" type="image/png"/>#' "$APP2_HTML"
        sed -i -E 's#<link rel="apple-touch-icon" href="[^"]*/logo\.png" */?>#<link rel="apple-touch-icon" href="./apple-touch-icon.png"/>#' "$APP2_HTML"
        sed -i -E 's#<link rel="manifest" href="[^"]*/manifest\.json" */?>#<link rel="manifest" href="./manifest.webmanifest"/>#' "$APP2_HTML"
    fi

    echo "Copying app2 favicons + manifest into app2-dist..."
    cp "$APP2_STATIC_DIR/favicon.svg" "$APP2_DIST/favicon.svg"
    cp "$APP2_STATIC_DIR/favicon-32.png" "$APP2_DIST/favicon-32.png"
    cp "$APP2_STATIC_DIR/apple-touch-icon.png" "$APP2_DIST/apple-touch-icon.png"
    cp "$APP2_STATIC_DIR/manifest.webmanifest" "$APP2_DIST/manifest.webmanifest"
    mkdir -p "$APP2_DIST/icons"
    cp "$APP2_STATIC_DIR"/icons/*.png "$APP2_DIST/icons/"
else
    echo "Warning: $APP2_HTML not found — skipping favicon/manifest rewrite" >&2
fi
