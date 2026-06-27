# Geometry, Indicators, Scores

The MVP separates map shape, GIS evidence, backend decisions, and LLM text.

## Intended Data Flow

```text
Google Earth Engine / GIS processing
  -> stable geometry + semi-static indicators
  -> S3 processed bucket
  -> Lambda scoring engine
  -> API score maps keyed by areaId
  -> frontend recolors existing map entities
  -> Bedrock explains supplied scores/evidence on demand
```

Core rule: GEE generates evidence. The backend scoring engine decides. The
frontend styles dynamically. Bedrock explains. Experts validate onsite.

## S3 Layout

```text
s3://<processed-bucket>/
  geometry/
    areas.geojson
  indicators/
    latest.json
    area_indicators_YYYY-MM-DD.json
  scores/
    default_scores.json
  metadata/
    data_sources.json
    processing_run_YYYY-MM-DD.json
  reports/
    area_ET-001_prefeasibility.pdf
```

The current Lambda reads `geometry/areas.geojson` and joins
`indicators/latest.json` when present. In local development it can read
`data/sample/areas.geojson`; if enabled, mock data remains a final fallback for
hackathon demos. See
[`real-geojson-flow.md`](real-geojson-flow.md) for the upload and runtime
fallback controls.

## File Responsibilities

- `areas.geojson`: stable polygons and metadata such as `areaId`, name, region,
  and geometry.
- `indicators/latest.json`: semi-static GEE/GIS evidence such as NDVI,
  plantable fraction, rainfall reliability, mean slope, soil suitability,
  forest-loss signal, protected-area concern, and road/access proxies.
- backend scores: dynamic outputs such as priority score, carbon score,
  survival score, cost efficiency, carbon-credit readiness, risk score,
  scenario-weighted rankings, and budget plans.

## Dynamic Scenario Flow

```text
User changes scenario weights
  -> POST /scenario
  -> Lambda reads indicators
  -> scoring_engine.py recalculates scores
  -> API returns scoresByArea keyed by areaId
  -> frontend merges scores into existing areas
  -> map colors update without regenerating GeoJSON
```

The frontend should not need a new GeoJSON file when weights, budgets, cost
assumptions, or risk tolerance change.

## Current Gaps

- The legacy GIS processor still writes `processed/scored_areas.json`.
- The Earth Engine processor still exports `restoration_score` artifacts from
  the original Code Editor logic. Treat those as QA/prototype layers, not final
  dynamic investment decisions.
- Real geometry and indicator exports still need to be wired into the expected
  S3 layout.
- `scores/default_scores.json` is documented for future versioned score runs;
  the MVP calculates scores at request time.
