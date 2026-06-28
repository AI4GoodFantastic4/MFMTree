# Real GeoJSON Flow

The frontend map geometry and backend scores are separate.

## S3 Objects

Real geometry should live at:

```text
s3://<processed-bucket>/geometry/areas.geojson
```

Semi-static GIS indicators should live at:

```text
s3://<processed-bucket>/indicators/latest.json
```

Dynamic/default scores are calculated by the backend. A future batch job may
also persist default scores at:

```text
s3://<processed-bucket>/scores/default_scores.json
```

The data-source catalog lives at:

```text
s3://<processed-bucket>/metadata/data_sources.json
```

`GET /data-sources` returns that S3 manifest when present. If it is missing,
the API returns the built-in list extracted from
`services/gee-processor/references/restoreai_gee_data_only_message.js`,
including Sentinel-2, Landsat 5/7/8/9, Sentinel-1, ESA WorldCover, Hansen GFC,
biomass carbon, CHIRPS, SoilGrids, SRTM, WDPA, GHSL population, the OCHA/HDX
admin placeholder, FAO GAUL fallback, and the planned CIFOR-ICRAF / MEFCC-WRI
species suitability source.

The manifest entries include:

- `geeAssetId`: Earth Engine asset or collection ID when available
- `s3Prefix` or `s3Key`: where externally supplied source files should be staged
- `scriptSection`: the matching section in the provided GEE data-only script
- `indicatorFields`: output fields the backend expects or can normalize
- `pipelineOutputs`: the stable S3 keys consumed by the app

## GeoJSON Contract

`areas.geojson` must be a `FeatureCollection`. Every feature must have a stable
`properties.areaId`.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "areaId": "ET-001",
        "name": "Example Woreda",
        "region": "Southwest Ethiopia"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": []
      }
    }
  ]
}
```

## Upload Sample Geometry

The repo includes a small test file at `data/sample/areas.geojson`.

Upload it to the processed bucket:

```bash
export AWS_DEFAULT_REGION=us-west-2
export PROCESSED_BUCKET="$(terraform -chdir=infra output -raw processed_data_bucket_name)"
./scripts/upload_sample_geojson.sh
```

The script uploads:

```text
data/sample/areas.geojson
  -> s3://$PROCESSED_BUCKET/geometry/areas.geojson
```

Upload a data-source manifest:

```bash
export PROCESSED_BUCKET="$(terraform -chdir=infra output -raw processed_data_bucket_name)"
./scripts/upload_data_sources.sh
```

By default, the script uploads the complete built-in catalog extracted from the
Earth Engine script.

Override the input file if you provide your own full catalog:

```bash
DATA_SOURCES_PATH=/path/to/data_sources.json ./scripts/upload_data_sources.sh
```

## Backend Behavior

`GET /areas` returns:

- `geojson`: the GeoJSON `FeatureCollection`
- `areas`: dashboard-friendly area objects with backend-calculated scores
- `source`: `s3`, `local`, or `mock`

The Lambda reads these environment variables:

- `PROCESSED_BUCKET` or `PROCESSED_DATA_BUCKET`
- `GEOMETRY_KEY`, default `geometry/areas.geojson`
- `INDICATORS_KEY`, default `indicators/latest.json`
- `LOCAL_GEOJSON_PATH`, for local development
- `ALLOW_MOCK_DATA`, default `true`

Set this for production-style checks:

```bash
export ALLOW_MOCK_DATA=false
```

For Terraform deployments:

```bash
terraform -chdir=infra apply -var='allow_mock_data=false'
```

If mock fallback is disabled and no GeoJSON can be loaded, `GET /areas` returns
a clear error instead of silently serving mock geometry.

## Earth Engine Export Fields

The provided data-only GEE script exports grid/table properties such as:

- `grid_id`, `area_ha`, `target_project_area_ha`
- `restoration_score`, `roi_class`, `candidate_ok`, `eligibility_status`
- `current_ndvi`, `current_ndmi`, `ndvi_decline_proxy`,
  `sentinel1_vh_structure_proxy`
- `restorable_land_share`, `valid_restoration_land`,
  `no_plant_empty_land_share`, `built_up_share`,
  `water_wetland_mangrove_share`
- `annual_rain_mm`, `rainfall_fit`, `soil_pawc_0_30cm_cm3cm3`,
  `water_soil_proxy`, `soil_water_fit`
- `elevation_m`, `slope_deg`, `terrain_access_fit`
- `protected_area_share`, `near_protected_area`,
  `population_local_mean_5km`, `settlement_pressure_1km_pct`
- `carbon_tonnes_per_ha_2010`, `carbon_proxy`, `plant_fit`

The backend treats these as indicators/evidence. It derives app-facing fields
such as `plantableFraction`, `meanSlopeDeg`, `rainfallReliability`,
`soilSuitability`, `protectedAreaConcern`, `recentDeforestationRisk`,
`expectedSurvivalRate`, and `expectedTCO2ePerHa` from those indicators when
explicit values are missing.

## Frontend Behavior

The frontend loads geometry once from `GET /areas`, then loads scores from
`GET /scores`.

When a scenario changes:

```text
POST /scenario
  -> returns scoresByArea
  -> frontend merges scores by feature.properties.areaId
  -> polygon colors update
  -> geometry is not reloaded or regenerated
```

The map displays a badge showing whether it is rendering API/S3 GeoJSON, local
GeoJSON, or mock fallback data.
