# Metrics and Data Calculations

This document explains which data is used by RestoreEthiopia and how the app turns
that data into the metrics shown in the frontend.

Core rule:

```text
Google Earth Engine / GIS generates evidence.
The backend scoring engine calculates decisions.
The frontend displays and updates scores dynamically.
AI explains structured outputs only.
Experts validate onsite.
```

The app is a pre-screening and planning tool. It does not approve projects,
create final budgets, or certify carbon credits.

## Current Data Flow

```text
scripts/restoreai_ethiopia_low_compute_gee.js
  -> Google Earth Engine GeoJSON export
  -> scripts/output/restoreai_ethiopia_15km_500m_low_compute_inputs.geojson
  -> scripts/normalize_gee_output.py
  -> data/processed/areas.geojson
  -> data/processed/area_indicators.json
  -> data/processed/final_gis_data.geojson
  -> scripts/enrich_admin_boundaries.py
  -> scripts/publish_gee_outputs_to_s3.sh
  -> s3://processed/geometry/areas.geojson
  -> s3://processed/indicators/latest.json
  -> s3://processed/gis/final_gis_data.geojson
  -> services/api/data.py
  -> services/api/scoring_engine.py
  -> API Gateway / Lambda
  -> frontend/src/lib/api.ts
  -> frontend map, rankings, comparison, dashboard
```

The frontend joins geometry, indicators, and scores by stable `areaId`. Changing
scoring sliders updates score values and map/card styling; it does not regenerate
or reload the GeoJSON geometry.

## Data Files

### `areas.geojson`

Stable map geometry and display metadata.

Important fields:

- `areaId`: stable join key, derived from the GEE `grid_id` when no project ID is available.
- `displayName`: human-readable label used in the UI.
- `technicalName`: traceable grid-cell name.
- `regionName`, `zoneName`, `woredaName`: administrative context when available.
- `candidateLabel`: fallback label such as `Candidate Area 08`.
- `geometry`: GeoJSON polygon.

### `area_indicators.json`

Semi-static GIS evidence from GEE/GIS processing. These fields are not final
investment decisions.

Important fields:

- `totalAreaHa`
- `plantableFraction`
- `meanNdvi`
- `meanNdmi`
- `annualRainMm`
- `rainfallReliability`
- `meanSlopeDeg`
- `soilSuitability`
- `validCandidate10yClearedPct`
- `restorationGainPct`
- `carbonGainPct`
- `soilWaterGainPct`
- `habitatRecoveryGainPct`
- `restorationAdditionalityPct`
- `forestLoss10yPlusPct`
- `longTermClearedConfidencePct`
- `openEcosystemConversionRiskPct`
- `settlementPressurePct`
- `mrvReadinessPct`
- `remoteSensingUncertaintyPct`
- `recentDeforestationRisk`
- `monitoringFeasibility`
- `protectedAreaConcern`

### `final_gis_data.geojson`

GIS-friendly file combining geometry plus all normalized indicators. It is useful
for inspection, handoff, and map tooling. Dynamic user-adjustable scores should
still be calculated by the backend/frontend scoring logic, not baked into this
file.

## Source Datasets

The active low-compute Earth Engine script is:

```text
scripts/restoreai_ethiopia_low_compute_gee.js
```

It currently uses:

| Dataset | Earth Engine ID | Used for |
| --- | --- | --- |
| Ethiopia AOI | `FAO/GAUL/2015/level0` | Country boundary for clipping and grid generation |
| Sentinel-2 Surface Reflectance | `COPERNICUS/S2_SR_HARMONIZED` | NDVI, NDMI, current vegetation and moisture evidence |
| ESA WorldCover | `ESA/WorldCover/v200` | land-cover shares, restorable land, water/wetland, built-up, cropland, open ecosystem masks |
| Hansen Global Forest Change | `UMD/hansen/global_forest_change_2025_v1_13` | forest-loss history and long-term cleared land evidence |
| CHIRPS Daily Rainfall | `UCSB-CHG/CHIRPS/DAILY` | 5-year average annual rainfall and rainfall fit |
| SoilGrids field capacity | `ISRIC/SoilGrids250m/v2_0/wv0033` | soil-water proxy |
| SoilGrids wilting point | `ISRIC/SoilGrids250m/v2_0/wv1500` | soil-water proxy |
| SRTM DEM | `USGS/SRTMGL1_003` | elevation and slope |
| Biomass carbon density | `WCMC/biomass_carbon_density/v1_0/2010` | existing biomass carbon proxy |
| GHSL population | `JRC/GHSL/P2023A/GHS_POP/2025` | settlement/population pressure proxy |

Not yet fully integrated in the active low-compute script:

- OSM/HOTOSM road-distance calculation.
- WDPA protected-area polygon overlap.
- CIFOR-ICRAF / MEFCC-WRI species suitability.
- NGO-approved field boundaries or exact project parcels.

Those are represented as future integration points. The backend already accepts
normalized fields such as `distanceToRoadKm`, `protectedAreaConcern`, and
species/site suitability proxies when the data becomes available.

## GEE Indicator Calculations

### Candidate Grid

The script creates an Ethiopia-wide grid:

- grid size: 15 km
- analysis scale: 500 m
- projection: EPSG:3857

Each grid cell gets a `grid_id`. The normalizer turns it into:

```text
areaId = ET-GRID-{grid_id}
technicalName = Grid cell {grid_id}
displayName = region/admin context + Candidate Area XX
```

### NDVI

Source: Sentinel-2.

Formula:

```text
NDVI = (B8 - B4) / (B8 + B4)
```

Use:

- current vegetation condition
- non-forest evidence
- vegetation gain proxy
- restoration system fit

### NDMI

Source: Sentinel-2.

Formula:

```text
NDMI = (B8 - B11) / (B8 + B11)
```

Use:

- moisture proxy
- moist/riparian restoration system flags
- restoration system fit

### Land-Cover Shares

Source: ESA WorldCover.

The script calculates percentage shares for:

- tree cover
- shrubland
- grassland
- bare/sparse land
- cropland
- built-up land
- water/wetland
- open ecosystem
- ecological restorable land

Use:

- plantable/restorable fraction
- hard exclusion flags
- ecological review flags
- open ecosystem conversion risk

### Forest-Loss History

Source: Hansen Global Forest Change.

The script detects forest loss that happened at least 10 years before the
current analysis year and checks whether the area still appears non-forest.

Important outputs:

- `forestLoss10yPlusPct`
- `currentNonForestEvidencePct`
- `longTermClearedPct`
- `longTermClearedConfidencePct`
- `forestRegrowthProbabilityPct`

Use:

- land-history risk
- additionality proxy
- recent deforestation/integrity risk
- carbon-credit readiness signal

### Rainfall Fit

Source: CHIRPS daily rainfall, 2020-2025 mean annual precipitation.

The script uses a fuzzy suitability range:

```text
poor below 250 mm
better around 600-1600 mm
poor above 2600 mm
```

Output:

- `annualRainMm`
- `rainfallFitPct`
- normalized `rainfallReliability`: `low`, `medium`, or `high`

Use:

- tree survival score
- maintenance multiplier
- restoration system fit
- risk flags

### Soil-Water Fit

Source: SoilGrids field capacity and wilting point, 0-30 cm.

Formula:

```text
soil_pawc_0_30cm = mean(field_capacity) - mean(wilting_point)
soilWaterFitPct = normalized plant-available water capacity
```

Use:

- tree survival score
- maintenance multiplier
- restoration system fit

### Terrain Fit and Slope

Source: SRTM DEM.

Formula:

```text
slope_deg = Terrain.slope(elevation)
terrainFit = 1 - normalized slope penalty between 8 and 30 degrees
```

Use:

- tree survival score
- cost efficiency score
- logistics multiplier
- hard exclusion and erosion-control review

### Carbon Potential Proxy

Source: WCMC biomass carbon density and restoration gain logic.

The script estimates where existing biomass carbon is low enough for potential
restoration gain and combines that with long-term cleared land evidence.

Important outputs:

- `carbonGainPct`
- `lowExistingCarbonPct`
- `carbon_tonnes_per_ha_2010`
- normalized `expectedTCO2ePerHa`

Use:

- carbon score
- cost per expected tCO2e
- carbon-credit readiness signal

### Settlement Pressure

Source: GHSL population 2025.

The script normalizes population count into `settlementPressurePct`.

Use:

- livelihood/access proxy
- social review flag
- habitat recovery penalty where settlement pressure is high

### Restoration System Fit

The script combines:

```text
rainfallFit * 0.35
soilWaterFit * 0.25
terrainFit * 0.20
NDMI moisture fit * 0.10
longTermClearedConfidence * 0.10
```

Output:

- `restorationSystemFitPct`
- `restorationSystemCode`

Possible system codes:

- `DRYLAND_RESTORATION`
- `HIGHLAND_RESTORATION`
- `MOIST_RESTORATION`
- `RIPARIAN_WATER_SENSITIVE`
- `EROSION_CONTROL_ANR`
- `AGROFORESTRY_REVIEW`
- `MIXED_REVIEW`

Use:

- tree survival score
- field-validation guidance
- site-type explanation

### Restoration Gain

The script combines five semi-static restoration evidence layers:

```text
restorationGain =
  average(
    vegetationGain,
    carbonGain,
    soilWaterGain,
    degradationRecovery,
    habitatRecoveryGain
  )
```

It also calculates:

```text
restorationAdditionality =
  restorationGain
  * longTermClearedConfidence
  * (1 - forestRegrowthProbability)
```

Use:

- carbon score
- biodiversity score
- risk and additionality context

### MRV Readiness and Uncertainty

The script estimates remote-sensing confidence with:

```text
dataCompleteness = normalized Sentinel-2 observation count
remoteSensingUncertainty =
  1
  - dataCompleteness * 0.60
  + openEcosystemRisk * 0.20
  + croplandUncertainty * 0.20
mrvReadiness = dataCompleteness * (1 - remoteSensingUncertainty)
```

Use:

- risk score
- carbon-credit readiness
- field-validation caveats

## Backend Dynamic Scores

Backend scoring lives in:

```text
services/api/scoring_engine.py
```

The default scenario weights are:

```text
carbon: 0.28
survival: 0.22
costEfficiency: 0.18
livelihood: 0.12
biodiversity: 0.12
riskPenalty: 0.08
```

The positive weights are normalized. Risk is applied as a penalty.

### Priority Score

Formula:

```text
gross =
  carbonScore * carbonWeight
  + treeSurvivalScore * survivalWeight
  + costEfficiencyScore * costEfficiencyWeight
  + livelihoodScore * livelihoodWeight
  + biodiversityScore * biodiversityWeight

priorityScore =
  clamp(gross - riskScore * riskPenaltyWeight, 0, 100)
```

The frontend can also run a lightweight local fallback when the backend scenario
endpoint is unavailable. That fallback uses the same principle: a weighted score
joined by `areaId`.

### Carbon Score

Preferred inputs:

- `carbonGainPct`
- `restorationAdditionalityPct`
- `expectedTCO2ePerHa`
- `plantableFraction`
- `recentDeforestationRisk`

When `carbonGainPct` exists:

```text
carbonScore =
  carbonGainPct * 0.75
  + restorationAdditionalityPct * 0.25
```

If recent deforestation risk is high, the score is discounted. If GEE carbon
gain fields are missing, the fallback uses expected tCO2e per hectare and
plantable fraction.

### Tree Survival Score

Preferred inputs:

- `restorationSystemFitPct`
- `soilWaterFitPct`
- `terrainFitPct`

Formula:

```text
treeSurvivalScore =
  restorationSystemFitPct * 0.55
  + soilWaterFitPct * 0.25
  + terrainFitPct * 0.20
```

Fallback inputs:

- `expectedSurvivalRate`
- `rainfallReliability`
- `soilSuitability`
- `meanSlopeDeg`

### Cost Efficiency Score

Preferred inputs:

- `terrainFitPct`
- `settlementPressurePct`
- `hardExclusion`

Fallback inputs:

- `distanceToRoadKm`
- `meanSlopeDeg`

Fallback formula:

```text
costEfficiencyScore =
  clamp(100 - distanceToRoadKm * 1.7 - max(0, meanSlopeDeg - 5) * 1.8, 0, 100)
```

Road distance is not yet produced by the active low-compute GEE script. When it
is missing, terrain and settlement pressure are used as proxies.

### Livelihood Score

Inputs:

- `populationNearby`
- `distanceToRoadKm`

Formula:

```text
access = clamp(100 - distanceToRoadKm * 2, 0, 100)
community = clamp(populationNearby / 15000 * 100, 20, 100)
livelihoodScore = access * 0.45 + community * 0.55
```

When road distance is missing, backend defaults are used. This is a planning
proxy and should be replaced with OSM/HOTOSM access data.

### Biodiversity Score

Preferred inputs:

- `habitatRecoveryGainPct`
- `openEcosystemConversionRiskPct`

Formula:

```text
biodiversityScore =
  clamp(habitatRecoveryGainPct - openEcosystemConversionRiskPct * 0.25, 0, 100)
```

Fallback inputs:

- `plantableFraction`
- `protectedAreaConcern`

### Risk Score

Inputs:

- `hardExclusion`
- `ecologicalReviewRequired`
- `socialReviewRequired`
- `landHistoryReviewRequired`
- `mrvReviewRequired`
- `remoteSensingUncertaintyPct`
- `recentDeforestationRisk`
- `rainfallReliability`
- `soilSuitability`
- `protectedAreaConcern`
- `meanSlopeDeg`
- area uncertainty text such as land tenure unknown

The risk score starts from a base risk and adds deterministic penalties for
safeguard, data-confidence, land-history, ecological, social, and biophysical
concerns. Lower risk is better.

## Cost Estimate Calculations

Cost estimation lives in:

```text
services/api/cost_estimator.py
services/api/cost_assumptions.json
```

All cost values are configurable planning assumptions. They are not budget
commitments.

Key default assumptions include:

- currency
- planting density per hectare
- seedling unit cost
- planting labor per seedling
- site preparation cost per hectare
- annual maintenance cost per hectare
- maintenance years
- base logistics cost per hectare
- field validation base cost
- MRV setup cost
- carbon project development setup cost
- contingency rate
- default expected tCO2e per hectare

### Plantable Area

```text
estimatedPlantableHa = totalAreaHa * plantableFraction
```

### Seedlings Required

```text
estimatedSeedlingsRequired =
  estimatedPlantableHa * plantingDensityPerHa
```

### Surviving Trees

```text
expectedSurvivingTrees =
  estimatedSeedlingsRequired * expectedSurvivalRate
```

### Base Planting Cost

```text
estimatedBasePlantingCost =
  estimatedPlantableHa * sitePreparationCostPerHa
  + estimatedSeedlingsRequired * seedlingUnitCost
  + estimatedSeedlingsRequired * plantingLaborCostPerSeedling
```

### Maintenance Cost

```text
estimatedMaintenanceCost =
  estimatedPlantableHa
  * annualMaintenanceCostPerHa
  * maintenanceYears
  * rainfallOrSurvivalMultiplier
  * soilMultiplier
```

### Logistics Cost

```text
estimatedLogisticsCost =
  estimatedPlantableHa
  * baseLogisticsCostPerHa
  * accessMultiplier
  * slopeMultiplier
```

### Mortality / Replanting Buffer

```text
estimatedReplantingMortalityBuffer =
  estimatedSeedlingsRequired
  * (1 - expectedSurvivalRate)
  * replacementShare
  * (seedlingUnitCost + plantingLaborCostPerSeedling)
```

### Total Cost

```text
totalBeforeContingency =
  basePlantingCost
  + maintenanceCost
  + logisticsCost
  + replantingBuffer
  + fieldValidationCost
  + mrvSetupCost
  + carbonProjectDevelopmentFixedCost

contingency = totalBeforeContingency * contingencyRate
estimatedTotalCost = totalBeforeContingency + contingency
```

### Unit Costs

```text
estimatedCostPerHa =
  estimatedTotalCost / estimatedPlantableHa

estimatedCostPerSurvivingTree =
  estimatedTotalCost / expectedSurvivingTrees

estimatedNetTCO2e =
  estimatedPlantableHa
  * expectedTCO2ePerHa
  * expectedSurvivalRate
  * uncertaintyDiscount

estimatedCostPerTCO2e =
  estimatedTotalCost / estimatedNetTCO2e
```

If a denominator is zero or missing, the backend returns `null` for that ratio
and adds a warning instead of crashing.

### Multipliers

Access multiplier:

| Distance to road | Multiplier |
| --- | ---: |
| `< 5 km` | 1.0 |
| `5-15 km` | 1.2 |
| `15-30 km` | 1.5 |
| `> 30 km` | 2.0 |
| unknown | 1.3 |

Slope multiplier:

| Mean slope | Multiplier |
| --- | ---: |
| `< 5 deg` | 1.0 |
| `5-15 deg` | 1.15 |
| `15-25 deg` | 1.4 |
| `> 25 deg` | 1.8 |
| unknown | 1.25 |

Rainfall/survival multiplier:

| Rainfall reliability | Multiplier |
| --- | ---: |
| high | 1.0 |
| medium | 1.25 |
| low | 1.6 |
| unknown | 1.3 |

Soil multiplier:

| Soil suitability | Multiplier |
| --- | ---: |
| high | 1.0 |
| medium | 1.15 |
| low | 1.4 |
| unknown | 1.2 |

Safeguard/legal multiplier:

| Concern | Multiplier |
| --- | ---: |
| low / none | 1.0 |
| partial / unclear / medium | 1.2 |
| high | 1.5 |

## Carbon-Credit Readiness

Carbon-credit readiness is a preliminary signal only. It is not a certification.

Backend readiness uses:

- recent deforestation / forest-loss risk
- risk score
- monitoring feasibility / MRV readiness
- protected-area or safeguard concern
- carbon potential
- uncertainty flags

High recent deforestation risk lowers readiness and adds a warning:

```text
Recent forest loss signal detected. Carbon-credit eligibility and integrity
require expert review before investment.
```

## AI Explanation Metrics

AI explanation is handled by:

```text
services/api/bedrock.py
```

The LLM receives structured area data:

- scores
- cost estimate
- carbon-credit readiness
- risk flags
- evidence
- uncertainties
- field-validation questions

The LLM is instructed to:

- not invent scores
- use only provided evidence
- explain uncertainty
- frame output as pre-screening
- mention onsite expert validation
- avoid claiming carbon-credit certification

If Bedrock is disabled or fails, the backend returns deterministic fallback text.

## ElevenLabs Read-Aloud

Read-aloud is handled by:

```text
services/api/voice.py
```

The frontend sends already-generated explanation text to the backend. The
backend calls ElevenLabs only when TTS is enabled and the API key is configured.
The backend returns audio plus word/segment timing where possible. The frontend
uses those timings to glow the currently spoken text and put the avatar into a
speaking state.

TTS does not create or change any score, recommendation, or evidence.

## Removed User-Facing ROI Metric

The previous frontend displayed an `environmental_roi` field in rankings,
details, comparison, and CSV export. That visible ROI metric has been removed
for the demo because it was too easy to misread as a financial return metric.

The app now emphasizes:

- priority score
- score breakdown
- estimated total cost
- cost per hectare
- cost per expected tCO2e
- carbon-credit readiness
- risk score and caveats
- field-validation recommendation

Some legacy data files may still contain `environmental_roi` for backward
compatibility, but it should not be presented as a user-facing decision metric.

## What Is Still Mocked or Approximate

- Road distance is currently a default/proxy unless real OSM/HOTOSM-derived
  distance is provided.
- Protected-area overlap is not fully calculated in the active low-compute GEE
  script.
- Species suitability is still a guidance/TODO area, not a real CIFOR-ICRAF
  integration.
- Cost assumptions are placeholders and must be replaced with local NGO project
  values.
- GEE export is still manually started and downloaded from the Code Editor
  before normalization/publishing.
- Field validation remains mandatory before any real investment decision.

## How to Update the Metrics Data

1. Run the Earth Engine export task from:

   ```text
   scripts/restoreai_ethiopia_low_compute_gee.js
   ```

2. Download the exported GeoJSON to:

   ```text
   scripts/output/restoreai_ethiopia_15km_500m_low_compute_inputs.geojson
   ```

3. Normalize locally:

   ```bash
   python3 scripts/normalize_gee_output.py
   ```

4. Optionally enrich admin names:

   ```bash
   python3 scripts/enrich_admin_boundaries.py \
     --areas-input data/processed/areas.geojson \
     --areas-output data/processed/areas.geojson
   ```

5. Publish to S3:

   ```bash
   PROCESSED_BUCKET="$(terraform -chdir=infra output -raw processed_data_bucket_name)" \
   ./scripts/publish_gee_outputs_to_s3.sh
   ```

6. Verify backend output:

   ```bash
   curl "$API_BASE_URL/areas" | jq '.features | length'
   curl -X POST "$API_BASE_URL/scenario" \
     -H 'content-type: application/json' \
     -d '{"weights":{"carbon":0.3,"survival":0.2,"costEfficiency":0.2,"livelihood":0.15,"biodiversity":0.1,"riskPenalty":0.05}}'
   ```
