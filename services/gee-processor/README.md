# GEE Processor

Containerized Google Earth Engine processing pipeline for the RestoreAI /
MFMTree reforestation prioritisation prototype.

This refactors the original Google Earth Engine Code Editor JavaScript into a
Python package that can run locally first and later as an AWS Fargate task.

The original script is preserved at:

```text
services/gee-processor/references/restoreai_gee_code_editor_original.js
```

## What It Does

- Authenticates with Google Earth Engine.
- Builds an AOI for Ethiopia or a supplied Earth Engine asset.
- Constructs the same broad computation graph as the Code Editor script:
  Sentinel-2 NDVI/NDMI, Landsat NDVI decline, Sentinel-1 VH structure,
  ESA WorldCover restoration masks, Hansen forest loss, biomass carbon,
  CHIRPS rainfall, SoilGrids water-holding proxy, SRTM terrain, WDPA
  safeguards, and GHSL population/livelihood proxies.
- Produces deterministic restoration score components.
- Builds 10 km grid-cell zonal statistics.
- Creates export tasks for CSV, GeoJSON, KML, and GeoTIFF outputs.
- Writes metadata describing datasets, AOI, date range, outputs, task IDs, and
  score version.

## How This Differs From The Code Editor Script

The original script includes map layers, UI panels, checkboxes, a click
inspector, and an export button. Those are Code Editor visualization features.
This package keeps the computation and export logic, while moving visualization
metadata out of the core pipeline.

No browser automation is used.

## Local Authentication

Use existing `gcloud` / Earth Engine credentials:

```bash
export GEE_AUTH_MODE=default
export GEE_PROJECT=my-google-cloud-project
```

Or allow interactive local Earth Engine auth:

```bash
export GEE_AUTH_MODE=local
export GEE_PROJECT=my-google-cloud-project
```

The CLI calls `ee.Authenticate()` only in `local` mode if initialization fails.

## Service Account Authentication

For containers or Fargate-style execution:

```bash
export GEE_AUTH_MODE=service_account
export GEE_SERVICE_ACCOUNT_EMAIL=gee-runner@my-project.iam.gserviceaccount.com
export GOOGLE_APPLICATION_CREDENTIALS=/secrets/gee-service-account.json
export GEE_PROJECT=my-google-cloud-project
```

Do not commit service account keys. Mount or inject them securely.

## Dry Run

Dry-run builds the Earth Engine graph and prints the export plan, but does not
start export tasks:

```bash
PYTHONPATH=services/gee-processor/src \
python -m gee_processor.main \
  --target-region ethiopia \
  --aoi-asset users/example/aoi \
  --output-bucket my-gee-output-bucket \
  --output-prefix reforestation/processed \
  --start-date 2020-01-01 \
  --end-date 2025-12-31 \
  --dry-run
```

If no `--aoi-asset` is supplied, the pipeline uses FAO GAUL Ethiopia Admin 0 as
the fallback AOI. For exact South Ethiopia and South West Ethiopia Peoples'
Region boundaries, upload HDX/OCHA Admin boundaries as an Earth Engine asset and
pass that asset with `--aoi-asset`.

## Docker

Build:

```bash
docker build -t gee-processor services/gee-processor
```

Run dry-run with service account credentials mounted from the host:

```bash
docker run --rm \
  -e GEE_AUTH_MODE=service_account \
  -e GOOGLE_APPLICATION_CREDENTIALS=/secrets/gee-service-account.json \
  -e GEE_SERVICE_ACCOUNT_EMAIL=gee-runner@my-project.iam.gserviceaccount.com \
  -e GEE_PROJECT=my-project \
  -v "$(pwd)/secrets:/secrets:ro" \
  gee-processor \
  python -m gee_processor.main \
  --target-region ethiopia \
  --output-bucket my-gee-output-bucket \
  --output-prefix reforestation/processed \
  --dry-run
```

The image does not contain credentials.

## Outputs

Planned Google Cloud Storage outputs:

- `scored_areas.csv`
- `scored_areas.geojson`
- `top_candidate_cells.kml`
- `restoration_score_raster.tif`
- local task metadata at `/tmp/gee_processor_metadata.json`

The future bridge is:

```text
Google Cloud Storage export output
  -> sync/copy to AWS S3 processed-data bucket
  -> API reads scored outputs from S3
```

Cross-cloud sync is intentionally not implemented yet.

## Fargate Plan

The same container can run on AWS Fargate later:

- pass runtime config through environment variables
- inject Google credentials through AWS Secrets Manager or another secure secret
  mount, never baked into the image
- export first to Google Cloud Storage because Earth Engine supports native GCS
  batch exports
- write task metadata to a known path or future S3 location
- run with a conservative `GEE_MAX_CONCURRENT_TASKS` to avoid Earth Engine quota
  issues

## Known TODOs

- Verify all translated Earth Engine method calls against a real authenticated
  Earth Engine project.
- Replace FAO GAUL fallback with uploaded HDX/OCHA Admin boundaries for exact
  target regions.
- Replace plant profiles with CIFOR-ICRAF / MEFCC-WRI species suitability
  rasters when available.
- Add road-distance/access indicators from OSM/HOTOSM.
- Add GCS-to-S3 sync for the AWS processed-data bucket.
- Add optional integration tests that require real Earth Engine credentials.
