# Cost Estimation

## Purpose

The cost estimator gives NGO staff a configurable planning estimate for
reforestation candidate areas before experts travel onsite.

It supports the project principle:

```text
Scoring Engine decides.
Bedrock/LLM explains.
Experts validate.
```

The deterministic backend calculates cost estimates. The LLM may explain the
provided numbers and assumptions, but it must not invent new scores or costs.

## What It Does

- Estimates plantable hectares from total area and plantable fraction.
- Estimates seedlings required and expected surviving trees.
- Estimates base planting, maintenance, logistics, replanting buffer,
  field-validation, MRV setup, carbon-project development, contingency, and
  total cost.
- Calculates cost per plantable hectare, surviving tree, and expected tCO2e.
- Flags cost drivers and caveats.
- Supports a simple greedy budget planner for validation/investigation
  shortlists.

## What It Does Not Do

- It is not a final budget.
- It is not procurement guidance.
- It is not carbon-credit certification.
- It does not perform real raster/vector GIS extraction yet.
- It does not replace onsite expert validation.

## Default Assumptions

Defaults live in:

```text
services/api/cost_assumptions.json
```

They are placeholders and should be replaced with local Menschen fuer Menschen
or project-specific assumptions, including local seedling prices, labor rates,
transport costs, maintenance norms, MRV setup costs, and contingency policy.

## Indicator Inputs

The estimator accepts indicators such as:

```json
{
  "areaId": "ET-001",
  "totalAreaHa": 1800,
  "plantableFraction": 0.7,
  "distanceToRoadKm": 8,
  "meanSlopeDeg": 9,
  "rainfallReliability": "medium",
  "soilSuitability": "medium",
  "protectedAreaConcern": "low",
  "recentDeforestationRisk": "low",
  "expectedSurvivalRate": 0.72,
  "expectedTCO2ePerHa": 68
}
```

Missing inputs use safe defaults where possible and add warnings. If a
denominator is zero or missing, ratio fields return `null` instead of throwing.

## Formulas

```text
eligible_area_ha = total_area_ha * plantable_fraction

seedlings_required = eligible_area_ha * planting_density_per_ha

expected_surviving_trees = seedlings_required * expected_survival_rate

base_planting_cost =
  eligible_area_ha * site_preparation_cost_per_ha
  + seedlings_required * seedling_unit_cost
  + seedlings_required * planting_labor_cost_per_seedling

maintenance_cost =
  eligible_area_ha
  * annual_maintenance_cost_per_ha
  * maintenance_years
  * rainfall_or_survival_multiplier
  * soil_multiplier

logistics_cost =
  eligible_area_ha
  * base_logistics_cost_per_ha
  * access_multiplier
  * slope_multiplier

replanting_buffer =
  seedlings_required
  * (1 - expected_survival_rate)
  * replacement_share
  * (seedling_unit_cost + planting_labor_cost_per_seedling)

total_before_contingency =
  base_planting_cost
  + maintenance_cost
  + logistics_cost
  + replanting_buffer
  + field_validation_cost
  + mrv_setup_cost
  + carbon_project_development_fixed_cost

contingency = total_before_contingency * contingency_rate

estimated_total_cost = total_before_contingency + contingency

estimated_net_tCO2e =
  eligible_area_ha
  * expected_tCO2e_per_ha
  * expected_survival_rate
  * uncertainty_discount
```

The implementation treats component costs as additive. Multiplication is used
inside component formulas and multipliers.

## Multipliers

Access multiplier from road distance:

- `< 5 km`: `1.0`
- `5-15 km`: `1.2`
- `15-30 km`: `1.5`
- `> 30 km`: `2.0`
- unknown: `1.3`

Slope multiplier:

- `< 5 degrees`: `1.0`
- `5-15 degrees`: `1.15`
- `15-25 degrees`: `1.4`
- `> 25 degrees`: `1.8`
- unknown: `1.25`

Rainfall/survival multiplier:

- high reliability: `1.0`
- medium reliability: `1.25`
- low reliability: `1.6`
- unknown: `1.3`

Soil multiplier:

- high suitability: `1.0`
- medium suitability: `1.15`
- low suitability: `1.4`
- unknown: `1.2`

Safeguard/legal complexity multiplier:

- no protected-area or conflict signal: `1.0`
- partial overlap or unclear status: `1.2`
- high concern: `1.5`

Recent deforestation does not simply increase cost. It adds a carbon integrity
warning and reduces carbon confidence through the uncertainty discount.

## Data Source Mapping

- Admin boundaries: area size, aggregation by woreda/zone/region.
- ESA WorldCover: plantable fraction and land-cover suitability.
- Sentinel-2/Landsat: degradation and restoration opportunity.
- Global Forest Watch/UMD: recent deforestation and carbon-credit integrity risk.
- CHIRPS rainfall: rainfall reliability, drought risk, survival probability.
- SRTM DEM: slope, terrain difficulty, erosion risk.
- SoilGrids/ISRIC: soil suitability and site-preparation multiplier.
- WDPA: protected-area overlap and safeguard/legal complexity.
- WorldPop/GHSL/OSM: communities, labor access, road distance, transport proxy.
- CIFOR-ICRAF species atlas: tree-species suitability and survival confidence.

## Budget Planner

The MVP planner is intentionally simple. It estimates each mock area, filters by
risk tolerance and minimum carbon-credit readiness, sorts by a deterministic
carbon ROI score, then selects areas until the validation/investigation budget
is exhausted.

It is a shortlist helper, not an optimizer.
