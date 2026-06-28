#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="${FRONTEND_DIR:-$ROOT_DIR/frontend}"
INFRA_DIR="$ROOT_DIR/infra"

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  npm --prefix "$FRONTEND_DIR" install
fi

npm --prefix "$FRONTEND_DIR" run build
"$ROOT_DIR/scripts/prepare_frontend_static.sh" "$FRONTEND_DIR"

FRONTEND_BUILD_DIR="${FRONTEND_BUILD_DIR:-$FRONTEND_DIR/.output/public}"

BUCKET_NAME="${FRONTEND_BUCKET_NAME:-$(terraform -chdir="$INFRA_DIR" output -raw frontend_bucket_name)}"
DISTRIBUTION_ID="${CLOUDFRONT_DISTRIBUTION_ID:-$(terraform -chdir="$INFRA_DIR" output -raw cloudfront_distribution_id)}"

aws s3 sync "$FRONTEND_BUILD_DIR/" "s3://$BUCKET_NAME/" --delete
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*" >/dev/null

FRONTEND_URL="$(terraform -chdir="$INFRA_DIR" output -raw frontend_url 2>/dev/null || true)"
echo "Frontend deployed to ${FRONTEND_URL:-CloudFront distribution $DISTRIBUTION_ID}"
