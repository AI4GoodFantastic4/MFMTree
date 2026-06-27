#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_SOURCES_KEY="${DATA_SOURCES_KEY:-metadata/data_sources.json}"
BUCKET="${PROCESSED_BUCKET:-${PROCESSED_DATA_BUCKET:-}}"

if [[ -z "$BUCKET" ]]; then
  if command -v terraform >/dev/null 2>&1 && [[ -d "$ROOT_DIR/infra/.terraform" ]]; then
    BUCKET="$(terraform -chdir="$ROOT_DIR/infra" output -raw processed_data_bucket_name 2>/dev/null || true)"
  fi
fi

if [[ -z "$BUCKET" ]]; then
  echo "PROCESSED_BUCKET is not set and Terraform output processed_data_bucket_name was unavailable." >&2
  exit 1
fi

if [[ -n "${DATA_SOURCES_PATH:-}" ]]; then
  if [[ ! -f "$DATA_SOURCES_PATH" ]]; then
    echo "Data source manifest not found: $DATA_SOURCES_PATH" >&2
    exit 1
  fi
  UPLOAD_PATH="$DATA_SOURCES_PATH"
else
  UPLOAD_PATH="$(mktemp)"
  PYTHONPATH="$ROOT_DIR/services/api" python3 - <<'PY' > "$UPLOAD_PATH"
import json
from data_sources import DEFAULT_DATA_SOURCES

print(json.dumps({"schemaVersion": "0.1.0", "dataSources": DEFAULT_DATA_SOURCES}, ensure_ascii=True, indent=2))
PY
fi

aws s3 cp "$UPLOAD_PATH" "s3://$BUCKET/$DATA_SOURCES_KEY" --content-type application/json
echo "Uploaded data source manifest to s3://$BUCKET/$DATA_SOURCES_KEY"
