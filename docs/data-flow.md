# Data Flow

## Google Earth Engine source

The current Earth Engine export script lives at:

`scripts/restoreai_ethiopia_low_compute_gee.js`

It is a Google Earth Engine Code Editor script for an Ethiopia-wide, low-compute 15 km grid analysis at 500 m scale. It exports a single GeoJSON file through `Export.table.toDrive`:

`restoreai_ethiopia_15km_500m_low_compute_inputs.geojson`

The script does not calculate final investment scores. It produces semi-static evidence/indicator fields that the backend scoring engine can use dynamically.

## Datasets used

- FAO GAUL Ethiopia boundary
- Sentinel-2 surface reflectance and SCL cloud mask
- ESA WorldCover land-cover classes
- Hansen Global Forest Change
- CHIRPS rainfall
- SoilGrids water-retention proxies
- SRTM elevation and slope
- WCMC biomass carbon density
- GHSL population

This low-compute script does not yet include road-network distance, WDPA protected-area polygons, or species suitability from the CIFOR-ICRAF atlas. Those remain future GEE/GIS inputs.

## Indicators produced

The script exports fields such as:

- `grid_id`, `area_ha`
- `ndvi_current`, `ndmi_current`
- `valid_candidate_10y_cleared_pct`, `valid_candidate_10y_cleared_area_ha`
- `rainfall_fit_pct`, `soil_water_fit_pct`, `terrain_fit_pct`
- `restoration_gain_pct`, `carbon_gain_pct`, `habitat_recovery_gain_pct`
- `forest_loss_10y_plus_pct`, `forest_regrowth_probability_pct`
- `settlement_pressure_pct`
- `open_ecosystem_conversion_risk_pct`
- `restoration_system_code`, `restoration_system_fit_pct`
- `mrv_readiness_pct`, `remote_sensing_uncertainty_pct`
- `hard_exclusion`, `ecological_review_required`, `social_review_required`, `land_history_review_required`, `mrv_review_required`

## Normalized split

Run the normalizer after downloading the GEE GeoJSON export:

```bash
python3 scripts/normalize_gee_output.py \
  --input scripts/output/restoreai_ethiopia_15km_500m_low_compute_inputs.geojson \
  --geometry-output data/processed/areas.geojson \
  --indicators-output data/processed/area_indicators.json \
  --full-gis-output data/processed/final_gis_data.geojson
```

The normalizer writes:

- `data/processed/areas.geojson`: stable geometry and metadata only.
- `data/processed/area_indicators.json`: semi-static indicators keyed by stable `areaId`.
- `data/processed/final_gis_data.geojson`: geometry plus all normalized GEE indicator metrics for GIS inspection/export.

For GEE grid cells, `grid_id` becomes `areaId` in the form `ET-GRID-{grid_id}`. Final scores are not written to the GeoJSON.

## Upload to S3

The backend defaults expect:

```bash
aws s3 cp data/processed/areas.geojson "s3://$PROCESSED_BUCKET/geometry/areas.geojson"
aws s3 cp data/processed/area_indicators.json "s3://$PROCESSED_BUCKET/indicators/latest.json"
```

Or run the combined publish helper:

```bash
GEE_EXPORT_PATH=scripts/output/restoreai_ethiopia_15km_500m_low_compute_inputs.geojson \
  scripts/publish_gee_outputs_to_s3.sh
```

The helper normalizes the export and uploads:

- `geometry/areas.geojson`
- `indicators/latest.json`
- `indicators/area_indicators_YYYY-MM-DD.json`
- `gis/final_gis_data.geojson`
- `metadata/gee_exports/restoreai_ethiopia_low_compute_YYYY-MM-DD.geojson`

For local development, set:

```bash
export LOCAL_GEOJSON_PATH=data/processed/areas.geojson
export LOCAL_INDICATORS_PATH=data/processed/area_indicators.json
export ALLOW_MOCK_DATA=true
```

Mock data remains a fallback only. Set `ALLOW_MOCK_DATA=false` for production/demo checks where missing S3 data should fail clearly.

## Backend use

`services/api/data.py` loads geometry from `geometry/areas.geojson` and indicators from `indicators/latest.json`, then normalizes raw GEE field names into app fields such as:

- `totalAreaHa`
- `plantableFraction`
- `meanNdvi`
- `rainfallReliability`
- `soilSuitability`
- `recentDeforestationRisk`
- `monitoringFeasibility`

`services/api/scoring_engine.py` calculates dynamic scores from those indicators. `/scenario` recalculates scores from user weights and returns `scoresByArea`; it does not regenerate geometry.

Cost estimation uses the same normalized indicator set where available. Carbon-readiness uses recent forest-loss, monitoring feasibility, plantable area, safeguard signals, and cost/carbon potential.

## Frontend use

The frontend calls:

- `GET /areas` for geometry and area metadata.
- `GET /scores` for default dynamic scores.
- `POST /scenario` when sliders change.

It joins data by `areaId` and recolors/updates score bars without reloading or regenerating geometry. New GEE evidence fields such as restoration system, candidate area share, MRV readiness, and remote-sensing uncertainty are displayed in the area detail panel when present.

## Remaining gaps

- The current GEE script exports to Google Drive; the AWS upload step is manual.
- Road-distance and WDPA protected-area overlap are not in the low-compute script yet.
- Species suitability is still handled as frontend placeholder guidance, not a GEE indicator.
- Final field-validation decisions must still be made by onsite experts.
