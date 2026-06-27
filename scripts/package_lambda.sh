#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/services/api"
BUILD_DIR="$API_DIR/build"
DIST_DIR="$API_DIR/dist"
ZIP_PATH="$DIST_DIR/lambda.zip"

rm -rf "$BUILD_DIR" "$DIST_DIR"
mkdir -p "$BUILD_DIR" "$DIST_DIR"

cp "$API_DIR"/app.py "$API_DIR"/bedrock.py "$API_DIR"/cost_estimator.py "$API_DIR"/data.py "$API_DIR"/scoring_engine.py "$BUILD_DIR"/
cp "$API_DIR"/cost_assumptions.json "$BUILD_DIR"/

if [[ -s "$API_DIR/requirements.txt" ]] && grep -Ev '^\s*(#|$)' "$API_DIR/requirements.txt" >/dev/null; then
  python3 -m pip install -r "$API_DIR/requirements.txt" -t "$BUILD_DIR"
fi

(cd "$BUILD_DIR" && zip -qr "$ZIP_PATH" .)
echo "Built $ZIP_PATH"
