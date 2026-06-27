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
