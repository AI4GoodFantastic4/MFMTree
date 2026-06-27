#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
export PYTHONPATH="$PWD/src:${PYTHONPATH:-}"

python -m gee_processor.main \
  --target-region "${TARGET_REGION:-ethiopia}" \
  --output-bucket "${GEE_OUTPUT_BUCKET:-dry-run-output-bucket}" \
  --output-prefix "${GEE_OUTPUT_PREFIX:-reforestation/processed}" \
  --start-date "${GEE_START_DATE:-2020-01-01}" \
  --end-date "${GEE_END_DATE:-2025-12-31}" \
  --dry-run
