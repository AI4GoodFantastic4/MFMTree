# Frontend and CloudFront Hosting

## What It Is

The `frontend/` app is a lightweight Vite + React + TypeScript hackathon demo
for the reforestation prioritisation platform. It connects to the API Gateway
backend when available and falls back to local mock data when API calls fail.

The UI shows:

- mock GIS-style Ethiopia candidate map
- clickable candidate areas
- score dashboard
- cost estimate and carbon-credit readiness
- field brief and AI advisor text
- two-area comparison workflow
- lightweight SVG/CSS AI advisor avatar

## API Connection

Create `frontend/.env`:

```bash
cp frontend/.env.example frontend/.env
```

Set:

```bash
VITE_API_BASE_URL=https://k79zw48ktl.execute-api.us-west-2.amazonaws.com
```

After a fresh Terraform apply, use:

```bash
terraform -chdir=infra output -raw api_base_url
```

and copy that value into `VITE_API_BASE_URL`.

## Run Locally

```bash
make frontend-install
make frontend-dev
```

Open the Vite URL printed by the dev server.

## Build

```bash
make frontend-build
```

The static output is written to:

```text
frontend/dist/
```

## Terraform Hosting Resources

Terraform adds:

- private S3 bucket for frontend static assets
- S3 public access block
- CloudFront Origin Access Control
- CloudFront distribution
- bucket policy allowing CloudFront read access
- SPA fallback to `index.html` for `403` and `404`

Outputs:

- `frontend_bucket_name`
- `cloudfront_distribution_id`
- `cloudfront_domain_name`
- `frontend_url`

Apply:

```bash
terraform -chdir=infra init
terraform -chdir=infra apply -var="aws_region=us-west-2"
```

## Deploy To CloudFront

```bash
make frontend-deploy
```

The script:

1. installs frontend dependencies if needed
2. builds `frontend/dist`
3. reads S3 bucket and CloudFront distribution id from Terraform outputs
4. syncs files to S3
5. creates a CloudFront invalidation

You can override output lookup with:

```bash
FRONTEND_BUCKET_NAME=... CLOUDFRONT_DISTRIBUTION_ID=... ./scripts/deploy_frontend.sh
```

## What Is Mocked

- The map is a stylized mock GIS panel, not CesiumJS.
- Candidate geometry is mocked as positioned polygon buttons when API geometry
  is unavailable.
- API failures fall back to local mock area data.
- Comparison reasoning falls back to deterministic mock text.

## Next Replacements

- Replace the mock map with CesiumJS or MapLibre/Cesium once real GeoJSON or 3D
  tiles are available.
- Render real `geometry/areas.geojson` polygons from the processed S3 bucket/API.
- Join `/scores` and `/scenario` responses by stable `areaId` so map colors
  update without regenerating GeoJSON.
- Add authentication before exposing non-demo project data.
- Add CloudFront custom domain and ACM certificate for production.
