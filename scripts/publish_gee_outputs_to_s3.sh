#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INPUT_PATH="${GEE_EXPORT_PATH:-$ROOT_DIR/scripts/output/restoreai_ethiopia_15km_500m_low_compute_inputs.geojson}"
GEOMETRY_PATH="${GEOMETRY_OUTPUT_PATH:-$ROOT_DIR/data/processed/areas.geojson}"
INDICATORS_PATH="${INDICATORS_OUTPUT_PATH:-$ROOT_DIR/data/processed/area_indicators.json}"
FULL_GIS_PATH="${FULL_GIS_OUTPUT_PATH:-$ROOT_DIR/data/processed/final_gis_data.geojson}"
BUCKET="${PROCESSED_BUCKET:-${PROCESSED_DATA_BUCKET:-}}"
RUN_DATE="${RUN_DATE:-$(date -u +%Y-%m-%d)}"

if [[ -z "$BUCKET" ]]; then
  if command -v terraform >/dev/null 2>&1 && [[ -d "$ROOT_DIR/infra/.terraform" ]]; then
    BUCKET="$(terraform -chdir="$ROOT_DIR/infra" output -raw processed_data_bucket_name 2>/dev/null || true)"
  fi
fi

if [[ -z "$BUCKET" ]]; then
  echo "PROCESSED_BUCKET is not set and Terraform output processed_data_bucket_name was unavailable." >&2
  exit 1
fi

if [[ ! -f "$INPUT_PATH" ]]; then
  echo "GEE export not found: $INPUT_PATH" >&2
  echo "Download the Earth Engine Drive export there, or set GEE_EXPORT_PATH=/path/to/export.geojson." >&2
  exit 1
fi

python3 "$ROOT_DIR/scripts/normalize_gee_output.py" \
  --input "$INPUT_PATH" \
  --geometry-output "$GEOMETRY_PATH" \
  --indicators-output "$INDICATORS_PATH" \
  --full-gis-output "$FULL_GIS_PATH"

aws s3 cp "$GEOMETRY_PATH" "s3://$BUCKET/geometry/areas.geojson" --content-type application/geo+json
aws s3 cp "$INDICATORS_PATH" "s3://$BUCKET/indicators/latest.json" --content-type application/json
aws s3 cp "$INDICATORS_PATH" "s3://$BUCKET/indicators/area_indicators_${RUN_DATE}.json" --content-type application/json
aws s3 cp "$FULL_GIS_PATH" "s3://$BUCKET/gis/final_gis_data.geojson" --content-type application/geo+json
aws s3 cp "$INPUT_PATH" "s3://$BUCKET/metadata/gee_exports/restoreai_ethiopia_low_compute_${RUN_DATE}.geojson" --content-type application/geo+json

echo "Published GEE outputs to s3://$BUCKET"
echo "  geometry/areas.geojson"
echo "  indicators/latest.json"
echo "  indicators/area_indicators_${RUN_DATE}.json"
echo "  gis/final_gis_data.geojson"
echo "  metadata/gee_exports/restoreai_ethiopia_low_compute_${RUN_DATE}.geojson"
