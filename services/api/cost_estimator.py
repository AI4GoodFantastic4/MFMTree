import json
from pathlib import Path
from typing import Any


ASSUMPTIONS_PATH = Path(__file__).with_name("cost_assumptions.json")


def load_cost_assumptions(overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    assumptions = json.loads(ASSUMPTIONS_PATH.read_text(encoding="utf-8"))
    if overrides:
        for key, value in overrides.items():
            if key in assumptions and value is not None:
                assumptions[key] = value
    return assumptions


def estimate_area_cost(
    indicators: dict[str, Any],
    assumptions_override: dict[str, Any] | None = None,
) -> dict[str, Any]:
    assumptions = load_cost_assumptions(assumptions_override)
    warnings: list[str] = [
        "Cost values are configurable planning estimates, not financial commitments.",
        "Replace default assumptions with local NGO/project costs before budgeting.",
    ]
    missing_defaults: list[str] = []

    total_area_ha = _number(indicators.get("totalAreaHa"))
    if total_area_ha is None:
        total_area_ha = 0.0
        missing_defaults.append("totalAreaHa")
        warnings.append("Missing totalAreaHa; using 0 ha, so cost-per-unit fields may be null.")

    plantable_fraction = _number(indicators.get("plantableFraction"))
    if plantable_fraction is None:
        plantable_fraction = _number(assumptions["defaultPlantableFraction"], 0.5)
        missing_defaults.append("plantableFraction")
        warnings.append(f"Missing plantableFraction; using default {plantable_fraction}.")
    plantable_fraction = _clamp(plantable_fraction, 0.0, 1.0)

    expected_survival_rate = _number(indicators.get("expectedSurvivalRate"))
    if expected_survival_rate is None:
        expected_survival_rate = _number(assumptions["defaultExpectedSurvivalRate"], 0.7)
        missing_defaults.append("expectedSurvivalRate")
        warnings.append(f"Missing expectedSurvivalRate; using default {expected_survival_rate}.")
    expected_survival_rate = _clamp(expected_survival_rate, 0.0, 1.0)

    expected_tco2e_per_ha = _number(indicators.get("expectedTCO2ePerHa"))
    if expected_tco2e_per_ha is None:
        expected_tco2e_per_ha = _number(assumptions["defaultExpectedTCO2ePerHa"], 68)
        missing_defaults.append("expectedTCO2ePerHa")
        warnings.append(f"Missing expectedTCO2ePerHa; using default {expected_tco2e_per_ha}.")

    access_multiplier, access_driver = access_multiplier_for(indicators.get("distanceToRoadKm"))
    slope_multiplier, slope_driver = slope_multiplier_for(indicators.get("meanSlopeDeg"))
    rainfall_multiplier, rainfall_driver = rainfall_survival_multiplier_for(indicators.get("rainfallReliability"))
    soil_multiplier, soil_driver = soil_multiplier_for(indicators.get("soilSuitability"))
    safeguard_multiplier, safeguard_driver = safeguard_multiplier_for(indicators.get("protectedAreaConcern"))

    if access_driver.endswith("unknown"):
        warnings.append("Missing distanceToRoadKm; using default access multiplier.")
        missing_defaults.append("distanceToRoadKm")
    if slope_driver.endswith("unknown"):
        warnings.append("Missing meanSlopeDeg; using default slope multiplier.")
        missing_defaults.append("meanSlopeDeg")
    if rainfall_driver.endswith("unknown"):
        warnings.append("Missing rainfallReliability; using default rainfall/survival multiplier.")
        missing_defaults.append("rainfallReliability")
    if soil_driver.endswith("unknown"):
        warnings.append("Missing soilSuitability; using default soil multiplier.")
        missing_defaults.append("soilSuitability")

    recent_deforestation_risk = str(indicators.get("recentDeforestationRisk", "unknown")).lower()
    if recent_deforestation_risk == "high":
        warnings.append(
            "Recent forest loss signal detected. Carbon-credit eligibility and integrity require expert review before investment."
        )

    eligible_area_ha = total_area_ha * plantable_fraction
    planting_density = _number(assumptions["plantingDensityPerHa"], 1100)
    seedlings_required = eligible_area_ha * planting_density
    expected_surviving_trees = seedlings_required * expected_survival_rate

    base_planting_cost = (
        eligible_area_ha * _number(assumptions["sitePreparationCostPerHa"], 0)
        + seedlings_required * _number(assumptions["seedlingUnitCost"], 0)
        + seedlings_required * _number(assumptions["plantingLaborCostPerSeedling"], 0)
    )
    maintenance_cost = (
        eligible_area_ha
        * _number(assumptions["annualMaintenanceCostPerHa"], 0)
        * _number(assumptions["maintenanceYears"], 0)
        * rainfall_multiplier
        * soil_multiplier
    )
    logistics_cost = (
        eligible_area_ha
        * _number(assumptions["baseLogisticsCostPerHa"], 0)
        * access_multiplier
        * slope_multiplier
    )
    replacement_share = _clamp(_number(assumptions["replacementShare"], 0.5), 0.0, 1.0)
    replanting_buffer = (
        seedlings_required
        * (1 - expected_survival_rate)
        * replacement_share
        * (
            _number(assumptions["seedlingUnitCost"], 0)
            + _number(assumptions["plantingLaborCostPerSeedling"], 0)
        )
    )
    field_validation_cost = _number(assumptions["fieldValidationBaseCost"], 0) * access_multiplier * slope_multiplier
    mrv_setup_cost = _number(assumptions["mrvSetupCost"], 0) * safeguard_multiplier
    carbon_project_development_cost = _number(assumptions["carbonProjectDevelopmentFixedCost"], 0)

    total_before_contingency = (
        base_planting_cost
        + maintenance_cost
        + logistics_cost
        + replanting_buffer
        + field_validation_cost
        + mrv_setup_cost
        + carbon_project_development_cost
    )
    contingency = total_before_contingency * _number(assumptions["contingencyRate"], 0)
    estimated_total_cost = total_before_contingency + contingency

    uncertainty_discount = _clamp(_number(assumptions["uncertaintyDiscount"], 0.85), 0.0, 1.0)
    if recent_deforestation_risk == "high":
        uncertainty_discount *= 0.75
    estimated_net_tco2e = eligible_area_ha * expected_tco2e_per_ha * expected_survival_rate * uncertainty_discount

    estimated_cost_per_ha = _safe_divide(estimated_total_cost, eligible_area_ha, "eligible plantable hectares", warnings)
    estimated_cost_per_surviving_tree = _safe_divide(
        estimated_total_cost,
        expected_surviving_trees,
        "expected surviving trees",
        warnings,
    )
    estimated_cost_per_tco2e = _safe_divide(estimated_total_cost, estimated_net_tco2e, "expected net tCO2e", warnings)

    drivers = _cost_drivers(
        access_driver,
        slope_driver,
        rainfall_driver,
        soil_driver,
        safeguard_driver,
        indicators=indicators,
    )

    return {
        "areaId": indicators.get("areaId"),
        "estimatedPlantableHa": _round(eligible_area_ha),
        "plantingDensityPerHa": planting_density,
        "estimatedSeedlingsRequired": round(seedlings_required),
        "expectedSurvivalRate": _round(expected_survival_rate, 3),
        "expectedSurvivingTrees": round(expected_surviving_trees),
        "estimatedBasePlantingCost": _money(base_planting_cost),
        "estimatedMaintenanceCost": _money(maintenance_cost),
        "estimatedLogisticsCost": _money(logistics_cost),
        "estimatedReplantingMortalityBuffer": _money(replanting_buffer),
        "estimatedFieldValidationCost": _money(field_validation_cost),
        "estimatedMrvMonitoringSetupCost": _money(mrv_setup_cost),
        "estimatedCarbonProjectDevelopmentCost": _money(carbon_project_development_cost),
        "contingency": _money(contingency),
        "estimatedTotalCost": _money(estimated_total_cost),
        "estimatedCostPerHa": _round_or_none(estimated_cost_per_ha),
        "estimatedCostPerSurvivingTree": _round_or_none(estimated_cost_per_surviving_tree),
        "estimatedNetTCO2e": _round(estimated_net_tco2e),
        "estimatedCostPerTCO2e": _round_or_none(estimated_cost_per_tco2e),
        "currency": assumptions["currency"],
        "costConfidence": _cost_confidence(indicators, missing_defaults, recent_deforestation_risk),
        "costDrivers": drivers,
        "costWarnings": warnings,
        "assumptions": assumptions,
        "multipliers": {
            "access": access_multiplier,
            "slope": slope_multiplier,
            "rainfallOrSurvival": rainfall_multiplier,
            "soil": soil_multiplier,
            "safeguardLegalComplexity": safeguard_multiplier,
        },
    }


def estimate_cost_for_area(area: dict[str, Any], assumptions_override: dict[str, Any] | None = None) -> dict[str, Any]:
    indicators = dict(area.get("costIndicators") or {})
    indicators.setdefault("areaId", area.get("areaId"))
    return estimate_area_cost(indicators, assumptions_override)


def plan_budget(
    areas: list[dict[str, Any]],
    budget: float,
    currency: str,
    risk_tolerance: str = "medium",
    minimum_carbon_credit_readiness: str = "medium",
) -> dict[str, Any]:
    estimates = [(area, estimate_cost_for_area(area)) for area in areas]
    candidates = [
        (area, estimate)
        for area, estimate in estimates
        if _passes_risk(area, risk_tolerance) and _readiness_rank(area.get("carbonCreditReadiness")) >= _readiness_rank(minimum_carbon_credit_readiness)
    ]
    ranked = sorted(candidates, key=lambda item: _carbon_roi_score(item[0], item[1]), reverse=True)

    selected: list[dict[str, Any]] = []
    estimated_spend = 0.0
    for area, estimate in ranked:
        initial_cost = _validation_or_initial_cost(estimate)
        if initial_cost <= 0 or estimated_spend + initial_cost > budget:
            continue
        carbon_roi_score = _carbon_roi_score(area, estimate)
        selected.append(
            {
                "areaId": area.get("areaId"),
                "name": area.get("name"),
                "estimatedValidationOrInitialCost": _money(initial_cost),
                "estimatedTotalProjectCost": estimate["estimatedTotalCost"],
                "carbonRoiScore": carbon_roi_score,
                "reason": _portfolio_reason(area, estimate),
            }
        )
        estimated_spend += initial_cost

    return {
        "budget": _money(budget),
        "currency": currency,
        "selectedAreas": selected,
        "estimatedSpend": _money(estimated_spend),
        "remainingBudget": _money(max(budget - estimated_spend, 0)),
        "caveats": [
            "Uses configurable planning assumptions.",
            "Not a final project budget.",
            "Requires onsite expert validation.",
        ],
    }


def access_multiplier_for(distance_to_road_km: Any) -> tuple[float, str]:
    distance = _number(distance_to_road_km)
    if distance is None:
        return 1.3, "road distance unknown"
    if distance < 5:
        return 1.0, "near road access"
    if distance <= 15:
        return 1.2, "moderate distance to road"
    if distance <= 30:
        return 1.5, "remote road access"
    return 2.0, "very remote road access"


def slope_multiplier_for(mean_slope_deg: Any) -> tuple[float, str]:
    slope = _number(mean_slope_deg)
    if slope is None:
        return 1.25, "slope unknown"
    if slope < 5:
        return 1.0, "flat or gentle slope"
    if slope <= 15:
        return 1.15, "manageable slope"
    if slope <= 25:
        return 1.4, "steep slope"
    return 1.8, "very steep slope"


def rainfall_survival_multiplier_for(reliability: Any) -> tuple[float, str]:
    value = str(reliability or "unknown").lower()
    if value == "high":
        return 1.0, "high rainfall reliability"
    if value == "medium":
        return 1.25, "medium rainfall reliability"
    if value == "low":
        return 1.6, "low rainfall reliability"
    return 1.3, "rainfall reliability unknown"


def soil_multiplier_for(suitability: Any) -> tuple[float, str]:
    value = str(suitability or "unknown").lower()
    if value == "high":
        return 1.0, "high soil suitability"
    if value == "medium":
        return 1.15, "medium soil suitability"
    if value == "low":
        return 1.4, "low soil suitability"
    return 1.2, "soil suitability unknown"


def safeguard_multiplier_for(concern: Any) -> tuple[float, str]:
    value = str(concern or "unknown").lower()
    if value in {"none", "no", "low"}:
        return 1.0, "no protected-area or conflict signal"
    if value in {"partial", "unclear", "medium"}:
        return 1.2, "partial overlap or unclear safeguard status"
    if value == "high":
        return 1.5, "high safeguard/legal concern"
    return 1.2, "partial overlap or unclear safeguard status"


def _cost_drivers(*drivers: str, indicators: dict[str, Any]) -> list[str]:
    result = list(drivers)
    if str(indicators.get("recentDeforestationRisk", "")).lower() == "high":
        result.append("recent deforestation integrity concern")
    result.append("field validation required")
    return result


def _cost_confidence(indicators: dict[str, Any], missing_defaults: list[str], recent_deforestation_risk: str) -> str:
    protected_area_concern = str(indicators.get("protectedAreaConcern", "")).lower()
    if protected_area_concern == "high" or recent_deforestation_risk == "high" or len(missing_defaults) >= 4:
        return "low"
    if missing_defaults:
        return "medium"
    return "high"


def _validation_or_initial_cost(estimate: dict[str, Any]) -> float:
    return (
        estimate["estimatedFieldValidationCost"]
        + estimate["estimatedMrvMonitoringSetupCost"]
        + estimate["estimatedTotalCost"] * 0.03
    )


def _carbon_roi_score(area: dict[str, Any], estimate: dict[str, Any]) -> int:
    cost_per_tco2e = estimate.get("estimatedCostPerTCO2e") or 999
    cost_factor = max(0, min(100, 100 - cost_per_tco2e * 5))
    readiness_factor = _readiness_rank(area.get("carbonCreditReadiness")) / 3
    risk_factor = max(0.2, 1 - (_number(area.get("riskScore"), 50) / 100))
    priority_factor = _number(area.get("priorityScore"), 50)
    score = (priority_factor * 0.4) + (cost_factor * 0.35) + (readiness_factor * 100 * 0.15) + (risk_factor * 100 * 0.1)
    return round(score)


def _portfolio_reason(area: dict[str, Any], estimate: dict[str, Any]) -> str:
    return (
        f"Priority {area.get('priorityScore')}, carbon readiness {area.get('carbonCreditReadiness')}, "
        f"{estimate['costConfidence']} cost confidence, main driver: {estimate['costDrivers'][0]}"
    )


def _passes_risk(area: dict[str, Any], risk_tolerance: str) -> bool:
    risk_score = _number(area.get("riskScore"), 50)
    indicators = area.get("costIndicators") or {}
    recent_risk = str(indicators.get("recentDeforestationRisk", "")).lower()
    if risk_tolerance == "low":
        return risk_score <= 30 and recent_risk != "high"
    if risk_tolerance == "medium":
        return risk_score <= 55 and recent_risk != "high"
    return True


def _readiness_rank(value: Any) -> int:
    return {"low": 1, "medium": 2, "high": 3}.get(str(value or "low").lower(), 1)


def _safe_divide(numerator: float, denominator: float, label: str, warnings: list[str]) -> float | None:
    if denominator <= 0:
        warnings.append(f"Cannot calculate ratio because {label} is zero or missing.")
        return None
    return numerator / denominator


def _number(value: Any, default: float | None = None) -> float | None:
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _money(value: float) -> float:
    return round(value, 2)


def _round(value: float, digits: int = 2) -> float:
    return round(value, digits)


def _round_or_none(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value, 2)
