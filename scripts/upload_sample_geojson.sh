#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAMPLE_PATH="${SAMPLE_GEOJSON_PATH:-$ROOT_DIR/data/sample/areas.geojson}"
GEOMETRY_KEY="${GEOMETRY_KEY:-geometry/areas.geojson}"
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

if [[ ! -f "$SAMPLE_PATH" ]]; then
  echo "Sample GeoJSON not found: $SAMPLE_PATH" >&2
  exit 1
fi

aws s3 cp "$SAMPLE_PATH" "s3://$BUCKET/$GEOMETRY_KEY" --content-type application/geo+json
echo "Uploaded $SAMPLE_PATH to s3://$BUCKET/$GEOMETRY_KEY"
