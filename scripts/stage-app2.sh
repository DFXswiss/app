#!/bin/bash
# Copy App 2.0 output into build/app2 so one deploy of build/ includes it.
# Usage: ./scripts/stage-app2.sh
# Requires app2-dist/ from a prior ./scripts/build-app2.sh run.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC="$PROJECT_DIR/app2-dist"
DEST="$PROJECT_DIR/build/app2"

if [ ! -d "$SRC" ]; then
    echo "Missing App 2.0 dist: $SRC" >&2
    exit 1
fi

echo "Staging App 2.0 into build/app2"
mkdir -p "$DEST"
cp -R "$SRC/." "$DEST/"
