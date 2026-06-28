#!/usr/bin/env python3
"""Normalize the RestoreAI Earth Engine GeoJSON export for the MFMTree backend.

The Code Editor script exports one GeoJSON with geometry plus semi-static
indicator properties. This script keeps geometry separate from indicators so
the backend can calculate dynamic scores from sliders, budgets, and assumptions.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_INPUT = Path("scripts/output/restoreai_ethiopia_15km_500m_low_compute_inputs.geojson")
DEFAULT_GEOMETRY_OUTPUT = Path("data/processed/areas.geojson")
DEFAULT_INDICATORS_OUTPUT = Path("data/processed/area_indicators.json")
DEFAULT_FULL_GIS_OUTPUT = Path("data/processed/final_gis_data.geojson")

CATEGORICAL_FIELDS = {
    "rainfallReliability": {"low", "medium", "high"},
    "soilSuitability": {"low", "medium", "high"},
    "protectedAreaConcern": {"low", "partial", "unclear", "high"},
    "recentDeforestationRisk": {"low", "medium", "high"},
    "monitoringFeasibility": {"low", "medium", "high"},
}


FIELD_MAP = {
    "area_ha": "totalAreaHa",
    "ndvi_current": "meanNdvi",
    "ndmi_current": "meanNdmi",
    "slope_deg": "meanSlopeDeg",
    "annual_rain_mm": "annualRainMm",
    "valid_candidate_10y_cleared_pct": "validCandidate10yClearedPct",
    "valid_candidate_10y_cleared_area_ha": "validCandidate10yClearedAreaHa",
    "valid_restoration_pct": "validRestorationPct",
    "restoration_gain_pct": "restorationGainPct",
    "vegetation_gain_pct": "vegetationGainPct",
    "carbon_gain_pct": "carbonGainPct",
    "soil_water_gain_pct": "soilWaterGainPct",
    "habitat_recovery_gain_pct": "habitatRecoveryGainPct",
    "degradation_recovery_pct": "degradationRecoveryPct",
    "restoration_additionality_pct": "restorationAdditionalityPct",
    "forest_loss_10y_plus_pct": "forestLoss10yPlusPct",
    "current_non_forest_evidence_pct": "currentNonForestEvidencePct",
    "long_term_cleared_pct": "longTermClearedPct",
    "long_term_cleared_confidence_pct": "longTermClearedConfidencePct",
    "forest_regrowth_probability_pct": "forestRegrowthProbabilityPct",
    "low_existing_carbon_pct": "lowExistingCarbonPct",
    "ecological_restorable_pct": "ecologicalRestorablePct",
    "low_vegetation_sparse_pct": "lowVegetationSparsePct",
    "tree_pct": "treePct",
    "shrubland_pct": "shrublandPct",
    "grassland_pct": "grasslandPct",
    "bare_sparse_pct": "bareSparsePct",
    "cropland_pct": "croplandPct",
    "built_up_pct": "builtUpPct",
    "water_wetland_pct": "waterWetlandPct",
    "open_ecosystem_pct": "openEcosystemPct",
    "open_ecosystem_conversion_risk_pct": "openEcosystemConversionRiskPct",
    "rainfall_fit_pct": "rainfallFitPct",
    "soil_water_fit_pct": "soilWaterFitPct",
    "terrain_fit_pct": "terrainFitPct",
    "settlement_pressure_pct": "settlementPressurePct",
    "restoration_system_fit_pct": "restorationSystemFitPct",
    "restoration_system_code": "restorationSystemCode",
    "data_completeness_pct": "dataCompletenessPct",
    "remote_sensing_uncertainty_pct": "remoteSensingUncertaintyPct",
    "mrv_readiness_pct": "mrvReadinessPct",
    "s2_observation_count": "s2ObservationCount",
    "hard_exclusion": "hardExclusion",
    "ecological_review_required": "ecologicalReviewRequired",
    "social_review_required": "socialReviewRequired",
    "land_history_review_required": "landHistoryReviewRequired",
    "low_vegetation_review_required": "lowVegetationReviewRequired",
    "mrv_review_required": "mrvReviewRequired",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT, help="Raw GEE GeoJSON export path.")
    parser.add_argument(
        "--geometry-output",
        type=Path,
        default=DEFAULT_GEOMETRY_OUTPUT,
        help="Normalized geometry GeoJSON output path.",
    )
    parser.add_argument(
        "--indicators-output",
        type=Path,
        default=DEFAULT_INDICATORS_OUTPUT,
        help="Normalized indicator JSON output path.",
    )
    parser.add_argument(
        "--full-gis-output",
        type=Path,
        default=DEFAULT_FULL_GIS_OUTPUT,
        help="GIS-friendly GeoJSON with geometry plus all normalized indicator metrics.",
    )
    args = parser.parse_args()

    raw = json.loads(args.input.read_text(encoding="utf-8"))
    geometry, indicators, final_gis = normalize_feature_collection(raw)
    validate_outputs(geometry, indicators)

    args.geometry_output.parent.mkdir(parents=True, exist_ok=True)
    args.indicators_output.parent.mkdir(parents=True, exist_ok=True)
    args.full_gis_output.parent.mkdir(parents=True, exist_ok=True)
    args.geometry_output.write_text(json.dumps(geometry, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    args.indicators_output.write_text(json.dumps({"areas": indicators}, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    args.full_gis_output.write_text(json.dumps(final_gis, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "status": "ok",
                "features": len(geometry["features"]),
                "geometryOutput": str(args.geometry_output),
                "indicatorsOutput": str(args.indicators_output),
                "fullGisOutput": str(args.full_gis_output),
            },
            ensure_ascii=True,
        )
    )
    return 0


def normalize_feature_collection(payload: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    if payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        raise ValueError("Input must be a GeoJSON FeatureCollection.")

    geometry_features: list[dict[str, Any]] = []
    indicator_records: list[dict[str, Any]] = []
    final_gis_features: list[dict[str, Any]] = []

    for index, feature in enumerate(payload["features"], start=1):
        if feature.get("type") != "Feature" or not isinstance(feature.get("properties"), dict):
            continue
        geometry = feature.get("geometry")
        if not isinstance(geometry, dict):
            continue
        props = feature["properties"]
        area_id = stable_area_id(props)
        if not area_id:
            raise ValueError(f"Feature {index} is missing areaId/id/grid_id.")

        name = props.get("name") or f"Grid cell {props.get('grid_id', area_id)}"
        region = props.get("region") or props.get("country") or "Ethiopia"
        geometry_properties = {
            "areaId": area_id,
            "name": str(name),
            "region": str(region),
            "grid_id": props.get("grid_id"),
            "restoration_system_code": props.get("restoration_system_code"),
        }
        normalized_indicators = normalize_indicators(props, area_id)
        geometry_features.append(
            {
                "type": "Feature",
                "properties": geometry_properties,
                "geometry": geometry,
            }
        )
        indicator_records.append(normalized_indicators)
        final_gis_features.append(
            {
                "type": "Feature",
                "properties": {
                    **geometry_properties,
                    **without_dynamic_score_fields(normalized_indicators),
                },
                "geometry": geometry,
            }
        )

    return (
        {"type": "FeatureCollection", "features": geometry_features},
        indicator_records,
        {"type": "FeatureCollection", "features": final_gis_features},
    )


def stable_area_id(props: dict[str, Any]) -> str | None:
    for key in ("areaId", "area_id", "id"):
        if props.get(key):
            return str(props[key])
    if props.get("grid_id") is not None:
        return f"ET-GRID-{props['grid_id']}"
    return None


def normalize_indicators(props: dict[str, Any], area_id: str) -> dict[str, Any]:
    record: dict[str, Any] = {"areaId": area_id}
    for key, value in props.items():
        if is_json_scalar(value):
            record[key] = value
    for source, target in FIELD_MAP.items():
        if source in props:
            record[target] = props[source]

    if record.get("totalAreaHa") is None:
        record["totalAreaHa"] = number_or_none(props.get("area_ha"))
    if record.get("plantableFraction") is None:
        record["plantableFraction"] = fraction(
            props.get("valid_candidate_10y_cleared_pct")
            if props.get("valid_candidate_10y_cleared_pct") is not None
            else props.get("valid_restoration_pct")
        )
    if record.get("targetProjectAreaHa") is None:
        target_area = number_or_none(props.get("valid_candidate_10y_cleared_area_ha"))
        if target_area is None and record.get("totalAreaHa") is not None:
            target_area = float(record["totalAreaHa"]) * float(record.get("plantableFraction") or 0)
        record["targetProjectAreaHa"] = round(target_area, 2) if target_area is not None else None
    if record.get("expectedSurvivalRate") is None:
        record["expectedSurvivalRate"] = fraction(props.get("restoration_system_fit_pct"))
    if record.get("expectedTCO2ePerHa") is None:
        carbon_gain = number_or_none(props.get("carbon_gain_pct"))
        record["expectedTCO2ePerHa"] = round(max(fraction(carbon_gain) * 90, 8), 2) if carbon_gain is not None else None

    record["rainfallReliability"] = fit_label(props.get("rainfall_fit_pct"))
    record["soilSuitability"] = fit_label(props.get("soil_water_fit_pct"))
    record["protectedAreaConcern"] = protected_area_concern(props)
    record["recentDeforestationRisk"] = recent_deforestation_risk(props)
    record["forestLossRecent"] = record["recentDeforestationRisk"] == "high"
    record["populationNearby"] = population_proxy(props)
    record["monitoringFeasibility"] = fit_label(props.get("mrv_readiness_pct"))
    vegetation_gain = number_or_none(props.get("vegetation_gain_pct"))
    if vegetation_gain is not None:
        record["vegetationTrend"] = round(-fraction(vegetation_gain), 3)
    return record


def validate_outputs(geometry: dict[str, Any], indicators: list[dict[str, Any]]) -> None:
    if not geometry["features"] or not indicators:
        raise ValueError("Normalized output is empty.")
    seen: set[str] = set()
    for feature, record in zip(geometry["features"], indicators, strict=True):
        area_id = feature["properties"].get("areaId") or record.get("areaId")
        if not area_id:
            raise ValueError("Every feature and indicator record must include areaId.")
        if area_id in seen:
            raise ValueError(f"Duplicate areaId: {area_id}")
        seen.add(area_id)
        for field, allowed in CATEGORICAL_FIELDS.items():
            if record.get(field) is not None and record[field] not in allowed:
                raise ValueError(f"{area_id} has invalid {field}: {record[field]}")


def protected_area_concern(props: dict[str, Any]) -> str:
    if truthy(props.get("hard_exclusion")) or truthy(props.get("ecological_review_required")):
        return "partial"
    open_risk = number_or_none(props.get("open_ecosystem_conversion_risk_pct"))
    if open_risk is None:
        return "low"
    return "partial" if open_risk >= 40 else "low"


def recent_deforestation_risk(props: dict[str, Any]) -> str:
    if truthy(props.get("land_history_review_required")):
        return "medium"
    regrowth = number_or_none(props.get("forest_regrowth_probability_pct"))
    loss = number_or_none(props.get("forest_loss_10y_plus_pct"))
    if loss is not None and loss >= 60:
        return "high"
    if regrowth is not None and regrowth >= 50:
        return "medium"
    return "low"


def population_proxy(props: dict[str, Any]) -> int | None:
    pressure = number_or_none(props.get("settlement_pressure_pct"))
    return round(pressure * 300) if pressure is not None else None


def fit_label(value: Any) -> str:
    number = number_or_none(value)
    if number is None:
        return "medium"
    if number >= 70:
        return "high"
    if number >= 40:
        return "medium"
    return "low"


def fraction(value: Any) -> float:
    number = number_or_none(value)
    if number is None:
        return 0.0
    return max(0.0, min(1.0, number if number <= 1 else number / 100))


def number_or_none(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    number = number_or_none(value)
    if number is not None:
        return number > 0
    return str(value).strip().lower() in {"true", "yes", "y"}


def is_json_scalar(value: Any) -> bool:
    return value is None or isinstance(value, (str, int, float, bool))


def without_dynamic_score_fields(record: dict[str, Any]) -> dict[str, Any]:
    dynamic_fields = {
        "priorityScore",
        "carbonScore",
        "treeSurvivalScore",
        "costEfficiencyScore",
        "livelihoodScore",
        "biodiversityScore",
        "riskScore",
        "recommendedAction",
    }
    return {key: value for key, value in record.items() if key not in dynamic_fields}


if __name__ == "__main__":
    raise SystemExit(main())
