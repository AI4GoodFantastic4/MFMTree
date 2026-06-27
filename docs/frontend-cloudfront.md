# Frontend and CloudFront Hosting

## What It Is

The `ai4goodhackathonmfmtree/` app is the real Vite + React + TypeScript
frontend for the reforestation prioritisation platform. It connects to the API
Gateway backend when `VITE_API_BASE_URL` is configured and falls back to local
demo data when API calls fail.

The UI shows:

- Mapbox GIS-style Ethiopia candidate map
- clickable candidate areas
- score dashboard
- cost estimate and carbon-credit readiness
- field brief and AI advisor text
- two-area comparison workflow
- dynamic score recoloring without refetching geometry

## API Connection

Create `ai4goodhackathonmfmtree/.env`:

```bash
cp ai4goodhackathonmfmtree/.env.example ai4goodhackathonmfmtree/.env
```

Set:

```bash
VITE_API_BASE_URL=https://k79zw48ktl.execute-api.us-west-2.amazonaws.com
VITE_MAPBOX_TOKEN=your-mapbox-token
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
ai4goodhackathonmfmtree/.output/public/
```

The app uses TanStack Start/Nitro. For S3 hosting, `scripts/prepare_frontend_static.sh`
renders the built server once and writes `.output/public/index.html` before sync.

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
2. builds `ai4goodhackathonmfmtree/.output`
3. renders `.output/public/index.html` for static S3 hosting
4. reads S3 bucket and CloudFront distribution id from Terraform outputs
5. syncs `.output/public` to S3
6. creates a CloudFront invalidation

You can override output lookup with:

```bash
FRONTEND_BUCKET_NAME=... CLOUDFRONT_DISTRIBUTION_ID=... ./scripts/deploy_frontend.sh
```

## What Is Mocked

- The map is Mapbox-based, not CesiumJS yet.
- Candidate geometry is loaded from `GET /areas` when available and normalized
  by stable `feature.properties.areaId`.
- API failures fall back to local mock area data.
- Comparison reasoning falls back to deterministic mock text.
- Cost values are configurable planning estimates, not final budgets.

## Next Replacements

- Replace Mapbox with CesiumJS or 3D tiles if full 3D terrain visualization is
  needed.
- Expand real `geometry/areas.geojson` from sample polygons to production
  admin/restoration candidate geometries.
- Add richer UI for `/budget-plan` and carbon-readiness details.
- Add authentication before exposing non-demo project data.
- Add CloudFront custom domain and ACM certificate for production.
