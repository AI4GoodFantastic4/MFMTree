from __future__ import annotations

from dataclasses import dataclass
from typing import Any


W_CARBON = 0.25
W_WATER_SOIL = 0.25
W_BIODIVERSITY = 0.25
W_LIVELIHOOD = 0.15
W_DEGRADATION = 0.10
HIGH_PRIORITY_THRESHOLD = 70
MEDIUM_PRIORITY_THRESHOLD = 45
MAX_SETTLEMENT_PRESSURE_MEAN = 0.70
MAX_BUILTUP_SHARE = 0.20
MAX_WATER_WETLAND_SHARE = 0.20
MIN_VALID_RESTORATION_SHARE = 0.05
PROTECTED_AREA_REVIEW_SHARE = 0.05
MAX_PROJECT_AREA_HA = 10000
PLACEHOLDER_COST_EUR_PER_HA = 450


@dataclass(frozen=True)
class ScoreComponents:
    carbon_potential: float
    tree_survival_ecological_suitability: float
    cost_efficiency_accessibility: float
    carbon_credit_readiness: float
    livelihood_benefit: float
    biodiversity_cobenefit: float
    risk_penalty: float


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def weighted_priority_score(components: ScoreComponents) -> float:
    gross = (
        components.carbon_potential * 0.25
        + components.tree_survival_ecological_suitability * 0.20
        + components.cost_efficiency_accessibility * 0.15
        + components.carbon_credit_readiness * 0.15
        + components.livelihood_benefit * 0.10
        + components.biodiversity_cobenefit * 0.15
    )
    return round(clamp01(gross * (1 - components.risk_penalty)) * 100, 2)


def score_category(score: float) -> str:
    if score >= HIGH_PRIORITY_THRESHOLD:
        return "High priority / good candidate"
    if score >= MEDIUM_PRIORITY_THRESHOLD:
        return "Medium priority / review candidate"
    return "Lower priority / weak candidate"


def recommendation_text(score: float, candidate_ok: bool) -> str:
    if not candidate_ok:
        return "Not recommended for first-pass investment without expert review"
    if score >= HIGH_PRIORITY_THRESHOLD:
        return "High-priority restoration candidate for expert validation and investment screening"
    if score >= MEDIUM_PRIORITY_THRESHOLD:
        return "Medium-priority candidate; review locally before investment"
    return "Lower-priority candidate; monitor or deprioritize for first-pass investment"


def roi_class(score: float) -> str:
    if score >= HIGH_PRIORITY_THRESHOLD:
        return "Green"
    if score >= MEDIUM_PRIORITY_THRESHOLD:
        return "Yellow"
    return "Red"


def build_score_stack(inputs: dict[str, Any]):
    base_score = (
        inputs["carbon_proxy"]
        .multiply(W_CARBON)
        .add(inputs["water_soil_proxy"].multiply(W_WATER_SOIL))
        .add(inputs["biodiversity_proxy"].multiply(W_BIODIVERSITY))
        .add(inputs["livelihood_proxy"].multiply(W_LIVELIHOOD))
        .add(inputs["degradation_proxy"].multiply(W_DEGRADATION))
        .clamp(0, 1)
        .rename("base_score")
    )
    restoration_score = base_score.multiply(inputs["plant_fit"]).updateMask(inputs["valid_restoration_mask"]).rename(
        "restoration_score"
    )
    restoration_score_100 = restoration_score.multiply(100).rename("restoration_score")

    return (
        restoration_score_100.addBands(inputs["carbon_proxy"].multiply(100).rename("carbon_proxy"))
        .addBands(inputs["water_soil_proxy"].multiply(100).rename("water_soil_proxy"))
        .addBands(inputs["biodiversity_proxy"].multiply(100).rename("biodiversity_proxy"))
        .addBands(inputs["livelihood_proxy"].multiply(100).rename("livelihood_proxy"))
        .addBands(inputs["degradation_proxy"].multiply(100).rename("degradation_proxy"))
        .addBands(inputs["plant_fit"].multiply(100).rename("plant_fit"))
        .addBands(inputs["annual_rain"].rename("annual_rain_mm"))
        .addBands(inputs["ndvi_current"].rename("current_ndvi"))
        .addBands(inputs["ndmi_current"].rename("current_ndmi"))
        .addBands(inputs["ndvi_decline"].multiply(100).rename("ndvi_decline_proxy"))
        .addBands(inputs["s1_vh_structure"].multiply(100).rename("sentinel1_vh_structure_proxy"))
        .addBands(inputs["slope"].rename("slope_deg"))
        .addBands(inputs["elevation"].rename("elevation_m"))
        .addBands(inputs["carbon_2010"].rename("carbon_tonnes_per_ha_2010"))
        .addBands(inputs["plant_available_water"].rename("soil_pawc_0_30cm_cm3cm3"))
        .addBands(inputs["pop_local_mean_5km"].rename("population_local_mean_5km"))
        .addBands(inputs["settlement_pressure"].multiply(100).rename("settlement_pressure_1km_pct"))
        .addBands(inputs["protected_area_share"].rename("protected_area_share"))
        .addBands(inputs["near_protected_area"].rename("near_protected_area"))
        .addBands(inputs["existing_tree_share"].rename("existing_tree_cover_share"))
        .addBands(inputs["near_existing_tree_cover"].rename("near_existing_tree_cover"))
        .addBands(inputs["restorable_share"].rename("restorable_land_share"))
        .addBands(inputs["built_up_share"].rename("built_up_share"))
        .addBands(inputs["water_wetland_share"].rename("water_wetland_mangrove_share"))
        .addBands(inputs["valid_restoration_land"].rename("valid_restoration_land"))
        .addBands(inputs["valid_restoration_mask"].rename("valid_restoration_mask"))
    )


def reduce_grid_scores(score_stack, grid, scale_m: int, projection):
    import ee

    grid_stats = score_stack.reduceRegions(
        collection=grid,
        reducer=ee.Reducer.mean(),
        scale=scale_m,
        crs=projection,
        tileScale=4,
    ).filter(ee.Filter.notNull(["restoration_score"]))

    def enrich_feature(feature):
        score = ee.Number(feature.get("restoration_score"))
        valid_share = ee.Number(feature.get("valid_restoration_land")).max(0).min(1)
        restorable_share = ee.Number(feature.get("restorable_land_share")).max(0).min(1)
        built_share = ee.Number(feature.get("built_up_share")).max(0).min(1)
        water_share = ee.Number(feature.get("water_wetland_mangrove_share")).max(0).min(1)
        settlement_pressure = ee.Number(feature.get("settlement_pressure_1km_pct")).divide(100).max(0).min(1)
        protected_share = ee.Number(feature.get("protected_area_share")).max(0).min(1)
        area_ha = feature.geometry().area(1).divide(10000)
        valid_area_ha = area_ha.multiply(valid_share)
        target_project_area_ha = valid_area_ha.min(MAX_PROJECT_AREA_HA)
        estimated_cost_million_eur = target_project_area_ha.multiply(PLACEHOLDER_COST_EUR_PER_HA).divide(1000000)
        environmental_roi = score.divide(estimated_cost_million_eur.add(0.1))

        hard_exclusion = (
            settlement_pressure.gt(MAX_SETTLEMENT_PRESSURE_MEAN)
            .Or(built_share.gt(MAX_BUILTUP_SHARE))
            .Or(water_share.gt(MAX_WATER_WETLAND_SHARE))
            .Or(valid_share.lt(MIN_VALID_RESTORATION_SHARE))
        )
        candidate_ok = ee.Number(ee.Algorithms.If(hard_exclusion, 0, 1))

        roi_label = ee.String(
            ee.Algorithms.If(score.gte(HIGH_PRIORITY_THRESHOLD), "Green", ee.Algorithms.If(score.gte(MEDIUM_PRIORITY_THRESHOLD), "Yellow", "Red"))
        )
        priority_category = ee.String(
            ee.Algorithms.If(
                score.gte(HIGH_PRIORITY_THRESHOLD),
                "High priority / good candidate",
                ee.Algorithms.If(score.gte(MEDIUM_PRIORITY_THRESHOLD), "Medium priority / review candidate", "Lower priority / weak candidate"),
            )
        )
        recommendation = ee.String(
            ee.Algorithms.If(
                candidate_ok.eq(0),
                "Not recommended for first-pass investment without expert review",
                ee.Algorithms.If(
                    score.gte(HIGH_PRIORITY_THRESHOLD),
                    "High-priority restoration candidate for expert validation and investment screening",
                    ee.Algorithms.If(
                        score.gte(MEDIUM_PRIORITY_THRESHOLD),
                        "Medium-priority candidate; review locally before investment",
                        "Lower-priority candidate; monitor or deprioritize for first-pass investment",
                    ),
                ),
            )
        )
        eligibility_status = ee.String(
            ee.Algorithms.If(
                settlement_pressure.gt(MAX_SETTLEMENT_PRESSURE_MEAN),
                "Not recommended - high settlement pressure",
                ee.Algorithms.If(
                    built_share.gt(MAX_BUILTUP_SHARE),
                    "Not recommended - high built-up share",
                    ee.Algorithms.If(
                        water_share.gt(MAX_WATER_WETLAND_SHARE),
                        "Not recommended - high water/wetland/mangrove share",
                        ee.Algorithms.If(
                            valid_share.lt(MIN_VALID_RESTORATION_SHARE),
                            "Not recommended - too little valid restoration land in cell",
                            ee.Algorithms.If(
                                protected_share.gt(PROTECTED_AREA_REVIEW_SHARE),
                                "Needs expert review - protected area safeguard",
                                "Good candidate for expert validation",
                            ),
                        ),
                    ),
                ),
            )
        )

        return feature.set(
            {
                "roi_class": roi_label,
                "priority_category": priority_category,
                "recommendation": recommendation,
                "eligibility_status": eligibility_status,
                "candidate_ok": candidate_ok,
                "area_ha": area_ha,
                "restorable_land_pct": restorable_share.multiply(100),
                "valid_restoration_land_pct": valid_share.multiply(100),
                "built_up_pct": built_share.multiply(100),
                "water_wetland_mangrove_pct": water_share.multiply(100),
                "protected_area_pct": protected_share.multiply(100),
                "target_project_area_ha": target_project_area_ha,
                "estimated_cost_million_eur": estimated_cost_million_eur,
                "environmental_roi": environmental_roi,
                "score_formula": "ROI = carbon 25%, water/soil 25%, biodiversity 25%, livelihood 15%, degradation 10%, multiplied by selected plant suitability and masked by safeguards",
                "explanation": "Screening result only. Final decisions require local expert validation.",
            }
        )

    return grid_stats.map(enrich_feature)
