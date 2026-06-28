# RestoreEthopia

Reforestation Priority Platform: a 3D GIS decision-support tool for prioritising
reforestation validation sites in Ethiopia.

RestoreEthopia is an AI for Good hackathon project for the Menschen fuer
Menschen challenge. It helps NGO staff pre-screen candidate reforestation areas
before sending experts onsite. The product is designed to make limited field
validation time and limited investment money go to the areas with the strongest
evidence, best risk-adjusted impact, and clearest next validation questions.

```text
Scoring Engine decides.
AI explains.
Experts validate.
```

The app is a planning and pre-screening tool. It does not approve projects, make
final budgets, or certify carbon credits.

## Problem

Menschen fuer Menschen needs to decide where reforestation and tree-planting
projects should be validated first. Today, expert onsite validation is expensive
and slow. Poor site selection can waste money, reduce tree survival, weaken
community benefit, and create carbon-credit integrity risk.

RestoreEthopia narrows the search space. It combines remote-sensing evidence,
deterministic scoring, configurable cost assumptions, and concise AI
explanations so staff can compare candidate areas and decide where experts
should go first.

## Product Vision

The demo lets users:

- view candidate areas on a 3D/GIS-style Ethiopia map
- select an area and inspect its score breakdown
- compare two areas side by side
- adjust scoring weights with sliders and see scores update dynamically
- inspect planning cost estimates
- review carbon-credit readiness and risk signals
- ask for concise AI explanations and comparison summaries
- use read-aloud narration for the comparison advisor
- export ranked candidate cells for offline review

## Architecture

```text
Google Earth Engine / GIS scripts
  -> area-level indicators and geometry
  -> normalized processed files
  -> S3 processed-data bucket
  -> Python Lambda backend
  -> deterministic scoring, cost, and readiness logic
  -> API Gateway HTTP API
  -> React / TanStack / Mapbox frontend
  -> Bedrock explanations and ElevenLabs read-aloud on demand
```

The key separation is intentional:

- Geometry is stable map data.
- Indicators are semi-static GIS evidence.
- Scores are dynamic backend calculations.
- Explanations are generated on demand from structured data.

The frontend should not regenerate GeoJSON when a user changes scoring sliders.
It updates scores and styles by joining data through stable `areaId` values.

## Current Implementation Status

The repo is no longer only a skeleton. It currently includes:

- AWS Terraform for S3, API Gateway, Lambda, IAM, CloudFront/S3 hosting, ECR,
  ECS/Fargate task skeleton, and Step Functions skeleton
- a Python Lambda API in `services/api/`
- a deterministic scoring engine in `services/api/scoring_engine.py`
- a configurable planning cost estimator in `services/api/cost_estimator.py`
- Bedrock explanation wrapper with deterministic fallback in
  `services/api/bedrock.py`
- ElevenLabs timestamped voice wrapper with browser/no-audio fallback in
  `services/api/voice.py`
- the canonical frontend in `frontend/`
- a low-compute Google Earth Engine Code Editor script in `scripts/`
- a normalizer that splits GEE output into geometry, indicators, and full GIS
  data
- scripts for publishing normalized GEE outputs to S3

Some AWS resource names still use the internal `mfmtree` project prefix. The
visible product name in the frontend is `RestoreEthopia`.

## Repository Structure

```text
infra/                         Terraform infrastructure
frontend/                      Canonical TanStack Start / Vite / React frontend
services/api/                  Python Lambda backend
services/gis-processor/        Docker GIS processor mock/skeleton
services/gee-processor/        Earth Engine Python processor package for future Fargate use
scripts/                       GEE script, data normalization, deploy helpers
data/sample/                   Local sample geometry and data-source catalog
docs/                          Architecture, API, local-dev, and data-flow notes
tests/                         Backend and data-flow unit tests
.env.example                   Root env template
Makefile                       Common local/dev/deploy commands
```

If older frontend folders such as `ai4goodhackathonmfmtree/` or
`ai4goodhackathonmfmtree-5195c495/` exist in a local checkout, treat them as
archive/import artifacts. The deploy scripts and current app use `frontend/`.

## GIS / Google Earth Engine Current State

There are two GEE-related tracks in this repository.

### Active low-compute Code Editor script

The active data-producing script is:

```text
scripts/restoreai_ethiopia_low_compute_gee.js
```

It is designed for the Google Earth Engine Code Editor and currently exports a
single GeoJSON feature collection to Google Drive:

```text
restoreai_ethiopia_15km_500m_low_compute_inputs.geojson
```

The script builds an Ethiopia-wide grid and calculates semi-static indicators.
It does not calculate final user-adjustable investment scores.

Datasets used in the active script:

- `FAO/GAUL/2015/level0` for Ethiopia AOI fallback
- `COPERNICUS/S2_SR_HARMONIZED` for current vegetation and moisture proxies
- `ESA/WorldCover/v200` for land-cover shares and plantable/restorable proxies
- `UMD/hansen/global_forest_change_2025_v1_13` for forest-loss history
- `UCSB-CHG/CHIRPS/DAILY` for rainfall
- `ISRIC/SoilGrids250m/v2_0/wv0033` and `wv1500` for soil-water proxies
- `USGS/SRTMGL1_003` for elevation and slope
- `WCMC/biomass_carbon_density/v1_0/2010` for existing carbon proxy
- `JRC/GHSL/P2023A/GHS_POP/2025` for settlement/population pressure

Indicators produced or derived include:

- total area hectares
- plantable/restorable fraction
- current NDVI and NDMI
- vegetation gain/degradation proxies
- forest-loss and recent deforestation risk proxies
- annual rainfall and rainfall reliability
- slope and terrain suitability
- soil-water suitability
- land-cover shares
- settlement pressure and population proximity proxy
- existing biomass carbon proxy
- monitoring feasibility / MRV readiness proxy
- restoration system fit and review flags
- remote-sensing uncertainty and data completeness

Known gaps in the active GEE script:

- road distance is not yet calculated from OSM/HOTOSM
- WDPA protected-area overlap is represented in the data-source catalog and
  future pipeline, but not fully integrated in this low-compute script
- CIFOR-ICRAF species suitability is still a future external dataset
- the export is still manually started/downloaded from Earth Engine Drive

### Python Earth Engine processor

The Python package in `services/gee-processor/` is the containerization path for
future automated runs. It supports local/default/service-account authentication,
dry-run export planning, Docker execution, and future Fargate operation.

That package still needs authenticated Earth Engine verification before it
replaces the active Code Editor export flow. It should export to Google Cloud
Storage first, then a future bridge can sync outputs into AWS S3.

## GEE Output Normalization

The active script exports geometry and indicator properties together. The app
splits those into the expected data model with:

```text
scripts/normalize_gee_output.py
```

Default input:

```text
scripts/output/restoreai_ethiopia_15km_500m_low_compute_inputs.geojson
```

Default normalized outputs:

```text
data/processed/areas.geojson
data/processed/area_indicators.json
data/processed/final_gis_data.geojson
```

The output split is:

- `areas.geojson`: stable feature geometry plus `areaId`, name, region, grid id
- `area_indicators.json`: semi-static indicator records keyed by `areaId`
- `final_gis_data.geojson`: GIS-friendly geometry plus all normalized metrics

Publish normalized outputs to the processed S3 bucket with:

```bash
PROCESSED_BUCKET="$(terraform -chdir=infra output -raw processed_data_bucket_name)" \
./scripts/publish_gee_outputs_to_s3.sh
```

That uploads:

```text
s3://<processed-bucket>/geometry/areas.geojson
s3://<processed-bucket>/indicators/latest.json
s3://<processed-bucket>/indicators/area_indicators_YYYY-MM-DD.json
s3://<processed-bucket>/gis/final_gis_data.geojson
s3://<processed-bucket>/metadata/gee_exports/restoreai_ethiopia_low_compute_YYYY-MM-DD.geojson
```

## Backend Data Flow

The Lambda backend reads processed data in `services/api/data.py`.

Primary S3 keys:

```text
geometry/areas.geojson
indicators/latest.json
metadata/data_sources.json
```

Environment variables:

```text
PROCESSED_BUCKET
GEOMETRY_KEY=geometry/areas.geojson
INDICATORS_KEY=indicators/latest.json
ALLOW_MOCK_DATA=true|false
```

When S3 data is available, `/areas` returns:

```json
{
  "geojson": { "type": "FeatureCollection", "features": [] },
  "areas": [],
  "source": "s3"
}
```

The backend normalizes field names from the GEE export into app-facing
camel-case fields. Stable `areaId` values come from `areaId`, `area_id`, `id`,
or are generated as `ET-GRID-<grid_id>`.

Area naming is intentionally split:

- `areaId` is the stable join key used by S3, the backend, frontend state,
  scoring, and comparisons.
- `technicalName` preserves traceability to the raw source, for example
  `Grid cell 4360000079`.
- `displayName` is the human-facing label shown to NGO users, for example
  `Southwest Ethiopia · Candidate Area 01`.
- `regionName`, `zoneName`, and `woredaName` are added by the post-GEE admin
  enrichment step when Ethiopia Admin 3 boundaries are available. If that source
  is unavailable, the normalizer/backend fall back to a broad Ethiopia region
  inferred from geometry and generated `Candidate Area NN` labels.

Fallback behavior:

- local development can read `data/sample/areas.geojson`
- if `ALLOW_MOCK_DATA=true`, the API can fall back to built-in mock areas
- if `ALLOW_MOCK_DATA=false`, missing geometry fails loudly instead of silently
  showing demo data

## Data Model

### Geometry

Stable map layer:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "areaId": "ET-GRID-...",
        "name": "Southwest Ethiopia · Candidate Area 01",
        "displayName": "Southwest Ethiopia · Candidate Area 01",
        "technicalName": "Grid cell ...",
      "region": "Oromia",
      "regionName": "Oromia",
      "zoneName": "Bale",
      "woredaName": "Goba",
      "adminLevel": "admin3",
      "candidateLabel": "Candidate Area 01"
      },
      "geometry": {}
    }
  ]
}
```

### Indicators

Semi-static GIS/GEE evidence:

```json
{
  "areas": [
    {
      "areaId": "ET-GRID-...",
      "totalAreaHa": 1800,
      "plantableFraction": 0.7,
      "meanNdvi": 0.42,
      "vegetationTrend": -0.08,
      "rainfallReliability": "medium",
      "meanSlopeDeg": 9,
      "soilSuitability": "medium",
      "recentDeforestationRisk": "low",
      "monitoringFeasibility": "medium"
    }
  ]
}
```

### Scores

Dynamic backend calculations:

```json
{
  "scoresByArea": {
    "ET-GRID-...": {
      "priorityScore": 86,
      "carbonScore": 82,
      "treeSurvivalScore": 78,
      "costEfficiencyScore": 74,
      "carbonCreditReadiness": "medium",
      "riskScore": 22
    }
  }
}
```

Scores are not baked into the map geometry. They are recalculated by the
backend and joined by `areaId`.

## Dynamic Scoring

Scoring logic lives in:

```text
services/api/scoring_engine.py
frontend/src/hooks/useScoring.ts
frontend/src/lib/cells.ts
```

The backend calculates:

- priority score
- carbon score
- tree survival/ecological suitability score
- cost efficiency score
- carbon-credit readiness
- livelihood score
- biodiversity score
- risk score and risk flags

The frontend loads geometry once, then updates score values and map colors when
sliders change. It applies an immediate local fallback score for responsive UI,
then calls:

```text
POST /scenario
```

The scenario response is merged into existing frontend cells by stable `areaId`.
This keeps map geometry static while rankings, score bars, and colors update.

## Cost Estimation

Cost logic lives in:

```text
services/api/cost_estimator.py
services/api/cost_assumptions.json
```

The cost estimate is a configurable planning estimate, not a financial
commitment. It uses indicators and assumptions such as:

- total area hectares
- plantable fraction
- planting density
- expected survival rate
- seedling and labor costs
- maintenance years
- rainfall and soil multipliers
- slope and logistics multipliers
- field-validation, MRV, carbon-project, and contingency assumptions

Endpoints:

```text
GET  /areas/{areaId}/cost-estimate
POST /cost-estimate
POST /budget-plan
```

Recent deforestation risk does not simply increase cost. It creates integrity
warnings and lowers carbon-credit confidence.

## Carbon-Credit Readiness

Carbon-credit readiness is a preliminary signal only. It is not certification.

The backend considers:

- recent deforestation / forest-loss signal
- plantable area size
- monitoring feasibility
- land-tenure uncertainty
- protected-area/safeguard concern
- carbon potential

Endpoint:

```text
POST /areas/{areaId}/carbon-readiness
```

The UI and AI copy should always frame this as a pre-screening signal requiring
onsite expert validation and legal review.

## AI Explanation Flow

The LLM explains structured outputs; it does not calculate scores.

Backend files:

```text
services/api/bedrock.py
services/api/voice.py
```

Endpoints:

```text
POST /areas/{areaId}/explain
POST /compare-areas
POST /areas/{areaId}/field-brief
POST /field-brief
POST /voice
POST /tts
```

Bedrock prompt rules:

- do not invent scores or cost numbers
- use only provided evidence
- explain uncertainty
- frame the result as pre-screening, not final approval
- mention onsite expert validation
- do not claim carbon-credit certification
- keep language concise and NGO-friendly

If `BEDROCK_ENABLED=false` or Bedrock fails, the backend returns deterministic
fallback explanations.

ElevenLabs read-aloud is optional. The frontend calls the backend, never
ElevenLabs directly, so the API key is not exposed in the browser. If TTS is
disabled or unavailable, the app falls back to estimated text alignment and/or
browser speech without breaking the demo.

## Frontend

The canonical frontend is:

```text
frontend/
```

Framework and libraries:

- TanStack Start / Router
- Vite
- React + TypeScript
- Mapbox GL
- Radix UI components
- custom CSS variables for dark/light mode

Important frontend files:

```text
frontend/src/lib/api.ts
frontend/src/hooks/useScoring.ts
frontend/src/lib/cells.ts
frontend/src/components/mfm/MapView.tsx
frontend/src/components/mfm/DetailPanel.tsx
frontend/src/components/mfm/CompareTab.tsx
frontend/src/components/mfm/AIComparisonAdvisor.tsx
frontend/src/components/mfm/ScoreBar.tsx
```

Frontend environment:

```text
VITE_API_BASE_URL=https://...
VITE_MAPBOX_TOKEN=...
```

If `VITE_API_BASE_URL` is empty or the backend fails, the frontend uses bundled
fallback cells from `frontend/src/data/cells.geojson.json`.

## API Endpoints

Common endpoints:

```text
GET  /health
GET  /areas
GET  /areas/{areaId}
GET  /scores
GET  /data-sources
GET  /data-sources/{sourceId}
GET  /areas/{areaId}/cost-estimate
POST /scenario
POST /budget-plan
POST /cost-estimate
POST /compare-areas
POST /areas/{areaId}/explain
POST /areas/{areaId}/field-brief
POST /field-brief
POST /areas/{areaId}/carbon-readiness
POST /voice
POST /tts
```

See `docs/api-contract.md` for example request/response shapes.

## Local Development

Prerequisites:

- Python 3.11+
- Node.js and npm
- Terraform 1.6+
- AWS CLI configured outside the repo
- Docker, if building processor containers

Copy env templates:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Run backend tests and smoke checks:

```bash
make test
make api-smoke
```

Run the frontend locally:

```bash
make frontend-install
make frontend-dev
```

Build the frontend:

```bash
make frontend-build
```

Package Lambda:

```bash
make lambda-package
```

## Updating GIS Data

Current manual flow:

1. Open `scripts/restoreai_ethiopia_low_compute_gee.js` in the Earth Engine
   Code Editor.
2. Run the export task to Google Drive.
3. Download the exported GeoJSON to:

   ```text
   scripts/output/restoreai_ethiopia_15km_500m_low_compute_inputs.geojson
   ```

4. Normalize, enrich with Ethiopia Admin 3 boundaries, and publish to S3:

   ```bash
   PROCESSED_BUCKET="$(terraform -chdir=infra output -raw processed_data_bucket_name)" \
   ./scripts/publish_gee_outputs_to_s3.sh
   ```

   The publish helper calls `scripts/enrich_admin_boundaries.py` by default. It
   joins each candidate area's centroid to Ethiopia Admin 3 boundaries from the
   public ICPAC GeoServer and writes `regionName`,
   `zoneName`, `woredaName`, `adminLevel`, and a human-facing `displayName`.
   For audited/offline runs, set `ADMIN_BOUNDARIES_PATH=/path/to/admin3.geojson`.

5. Smoke-test the API:

   ```bash
   API_BASE_URL="$(terraform -chdir=infra output -raw api_base_url)"
   curl "$API_BASE_URL/areas"
   curl -X POST "$API_BASE_URL/scenario" \
     -H "content-type: application/json" \
     -d '{"weights":{"carbon":0.4,"costEfficiency":0.2}}'
   ```

## Deployment

Terraform deploys the backend and hosting infrastructure:

```bash
make lambda-package
make tf-init
make tf-plan
make tf-apply
```

Frontend deployment:

```bash
make frontend-deploy
```

The frontend deploy script:

- builds `frontend/`
- prepares static output
- reads `frontend_bucket_name` and `cloudfront_distribution_id` from Terraform
- syncs static assets to S3
- creates a CloudFront invalidation

Useful Terraform outputs:

```text
raw_data_bucket_name
processed_data_bucket_name
api_base_url
frontend_url
cloudfront_distribution_id
ecr_repository_url
step_function_arn
```

## Environment Variables

Backend / Terraform:

```text
PROJECT_NAME
ENVIRONMENT
AWS_REGION
FRONTEND_ORIGIN
PROCESSED_BUCKET
GEOMETRY_KEY
INDICATORS_KEY
ALLOW_MOCK_DATA
BEDROCK_ENABLED
BEDROCK_MODEL_ID
TTS_ENABLED
ELEVENLABS_SECRET_NAME
ELEVENLABS_VOICE_NAME
ELEVENLABS_VOICE_ID
ELEVENLABS_MODEL_ID
```

Frontend:

```text
VITE_API_BASE_URL
VITE_MAPBOX_TOKEN
```

Google Earth Engine processor:

```text
GEE_AUTH_MODE=local|service_account|default
GEE_PROJECT
GEE_SERVICE_ACCOUNT_EMAIL
GOOGLE_APPLICATION_CREDENTIALS
GEE_OUTPUT_BUCKET
GEE_OUTPUT_PREFIX
```

Do not commit AWS credentials, Google service-account keys, or ElevenLabs API
keys. Terraform expects ElevenLabs to be injected through AWS Secrets Manager
when real TTS is enabled.

## What Is Real vs Mocked

Currently real or wired:

- Terraform-managed AWS API, Lambda, S3, and CloudFront hosting
- S3-backed `/areas` flow when processed geometry exists
- deterministic backend scoring and scenario recalculation
- deterministic cost estimation
- carbon-readiness signal
- Bedrock call path with fallback
- ElevenLabs call path with fallback
- frontend Mapbox geometry rendering and dynamic score styling
- normalized GEE output publishing to S3

Still mocked, placeholder, or manual:

- Earth Engine export is manually run/downloaded from the Code Editor
- Python GEE processor is a Fargate-ready path but still needs live GEE
  verification
- road distance, WDPA overlap, and species suitability need real integration
- cost assumptions are placeholders and must be replaced with local NGO values
- carbon-credit readiness is a screening heuristic, not certification
- Step Functions and ECS/Fargate orchestration are skeletons
- no RDS/PostGIS is deployed

## Known Limitations / TODOs

- Automate Earth Engine exports through the Python processor and Google Cloud
  Storage.
- Add a GCS-to-S3 bridge for processed GEE outputs.
- Replace low-compute grid cells with NGO-approved project boundaries or
  woreda/zone polygons where needed.
- Integrate OSM/HOTOSM roads for access-cost distance.
- Integrate WDPA protected-area overlap in the active low-compute pipeline.
- Integrate CIFOR-ICRAF / MEFCC-WRI species suitability data.
- Replace placeholder cost assumptions with project-specific local values.
- Add stronger production auth, observability, and data validation.
- Add optional RDS/PostGIS only when the project needs spatial queries beyond
  static S3 files.

## More Documentation

- `docs/data-flow.md`: detailed GEE-to-S3-to-frontend data flow
- `docs/api-contract.md`: API endpoint examples
- `docs/cost-estimation.md`: cost formulas and assumptions
- `docs/frontend-cloudfront.md`: frontend hosting details
- `docs/local-dev.md`: local commands and smoke checks
- `services/gee-processor/README.md`: Python Earth Engine processor and Fargate plan
