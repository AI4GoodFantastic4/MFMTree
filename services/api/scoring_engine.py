from typing import Any


DEFAULT_SCENARIO_WEIGHTS = {
    "carbon": 0.28,
    "survival": 0.22,
    "costEfficiency": 0.18,
    "livelihood": 0.12,
    "biodiversity": 0.12,
    "riskPenalty": 0.08,
}


def score_area(area: dict[str, Any], weights: dict[str, Any] | None = None) -> dict[str, Any]:
    indicators = _indicators(area)
    scenario_weights = _weights(weights)

    carbon_score = _carbon_score(indicators)
    survival_score = _survival_score(indicators)
    cost_efficiency_score = _cost_efficiency_score(indicators)
    livelihood_score = _livelihood_score(indicators)
    biodiversity_score = _biodiversity_score(indicators)
    risk_score = _risk_score(area, indicators)

    gross = (
        carbon_score * scenario_weights["carbon"]
        + survival_score * scenario_weights["survival"]
        + cost_efficiency_score * scenario_weights["costEfficiency"]
        + livelihood_score * scenario_weights["livelihood"]
        + biodiversity_score * scenario_weights["biodiversity"]
    )
    priority_score = round(max(0, min(100, gross - (risk_score * scenario_weights["riskPenalty"]))))

    return {
        "areaId": area.get("areaId"),
        "priorityScore": priority_score,
        "carbonScore": round(carbon_score),
        "treeSurvivalScore": round(survival_score),
        "costEfficiencyScore": round(cost_efficiency_score),
        "carbonCreditReadiness": _carbon_readiness(indicators, risk_score),
        "livelihoodScore": round(livelihood_score),
        "biodiversityScore": round(biodiversity_score),
        "riskScore": round(risk_score),
        "riskFlags": _risk_flags(area, indicators),
        "recommendedAction": _recommended_action(priority_score, risk_score),
    }


def apply_scores(area: dict[str, Any], weights: dict[str, Any] | None = None) -> dict[str, Any]:
    scored = dict(area)
    scored.update(score_area(area, weights))
    scored.setdefault("evidence", _evidence(area))
    scored.setdefault("uncertainties", _uncertainties(area))
    return scored


def score_areas(areas: list[dict[str, Any]], weights: dict[str, Any] | None = None) -> dict[str, dict[str, Any]]:
    return {area["areaId"]: score_area(area, weights) for area in areas if area.get("areaId")}


def scored_area_list(areas: list[dict[str, Any]], weights: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    return [apply_scores(area, weights) for area in areas]


def _weights(overrides: dict[str, Any] | None) -> dict[str, float]:
    weights = dict(DEFAULT_SCENARIO_WEIGHTS)
    if overrides:
        for key in weights:
            if overrides.get(key) is not None:
                weights[key] = float(overrides[key])
    total_positive = sum(value for key, value in weights.items() if key != "riskPenalty" and value > 0)
    if total_positive > 0:
        for key in ("carbon", "survival", "costEfficiency", "livelihood", "biodiversity"):
            weights[key] = weights[key] / total_positive
    return weights


def _indicators(area: dict[str, Any]) -> dict[str, Any]:
    return dict(area.get("indicators") or area.get("costIndicators") or {})


def _carbon_score(indicators: dict[str, Any]) -> float:
    carbon_gain = _number_or_none(indicators.get("carbonGainPct"))
    additionality = _number_or_none(indicators.get("restorationAdditionalityPct"))
    tco2e = _number(indicators.get("expectedTCO2ePerHa"), 68)
    plantable = _number(indicators.get("plantableFraction"), 0.5)
    recent_loss = str(indicators.get("recentDeforestationRisk", "unknown")).lower()
    penalty = 0.75 if recent_loss == "high" else 1.0
    if carbon_gain is not None:
        additionality_bonus = (additionality or 0) * 0.25
        return _clamp(carbon_gain * 0.75 + additionality_bonus, 0, 100) * penalty
    return _clamp((tco2e / 90) * 75 + plantable * 25, 0, 100) * penalty


def _survival_score(indicators: dict[str, Any]) -> float:
    restoration_fit = _number_or_none(indicators.get("restorationSystemFitPct"))
    soil_water_fit = _number_or_none(indicators.get("soilWaterFitPct"))
    terrain_fit = _number_or_none(indicators.get("terrainFitPct"))
    if restoration_fit is not None:
        soil_component = soil_water_fit if soil_water_fit is not None else restoration_fit
        terrain_component = terrain_fit if terrain_fit is not None else restoration_fit
        return _clamp(restoration_fit * 0.55 + soil_component * 0.25 + terrain_component * 0.20, 0, 100)

    survival = _number(indicators.get("expectedSurvivalRate"), 0.7) * 100
    rainfall_bonus = {"high": 10, "medium": 0, "low": -15}.get(str(indicators.get("rainfallReliability", "")).lower(), -5)
    soil_bonus = {"high": 8, "medium": 0, "low": -12}.get(str(indicators.get("soilSuitability", "")).lower(), -4)
    slope = _number(indicators.get("meanSlopeDeg"), 12)
    slope_penalty = max(0, slope - 12) * 1.2
    return _clamp(survival + rainfall_bonus + soil_bonus - slope_penalty, 0, 100)


def _cost_efficiency_score(indicators: dict[str, Any]) -> float:
    distance = _number(indicators.get("distanceToRoadKm"), 15)
    slope = _number(indicators.get("meanSlopeDeg"), 12)
    terrain_fit = _number_or_none(indicators.get("terrainFitPct"))
    settlement_pressure = _number_or_none(indicators.get("settlementPressurePct"))
    hard_exclusion = _flag(indicators.get("hardExclusion"))
    if terrain_fit is not None and indicators.get("distanceToRoadKm") is None:
        social_pressure_penalty = (settlement_pressure or 0) * 0.25
        exclusion_penalty = 30 if hard_exclusion else 0
        return _clamp(terrain_fit - social_pressure_penalty - exclusion_penalty, 0, 100)
    score = 100 - distance * 1.7 - max(0, slope - 5) * 1.8
    return _clamp(score, 0, 100)


def _livelihood_score(indicators: dict[str, Any]) -> float:
    population = _number(indicators.get("populationNearby"), 9000)
    distance = _number(indicators.get("distanceToRoadKm"), 15)
    access = _clamp(100 - distance * 2, 0, 100)
    community = _clamp((population / 15000) * 100, 20, 100)
    return (access * 0.45) + (community * 0.55)


def _biodiversity_score(indicators: dict[str, Any]) -> float:
    habitat_gain = _number_or_none(indicators.get("habitatRecoveryGainPct"))
    open_risk = _number_or_none(indicators.get("openEcosystemConversionRiskPct"))
    if habitat_gain is not None:
        return _clamp(habitat_gain - ((open_risk or 0) * 0.25), 0, 100)

    plantable = _number(indicators.get("plantableFraction"), 0.5)
    protected = str(indicators.get("protectedAreaConcern", "low")).lower()
    base = 45 + plantable * 35
    if protected in {"partial", "unclear", "medium"}:
        base += 8
    if protected == "high":
        base -= 10
    return _clamp(base, 0, 100)


def _risk_score(area: dict[str, Any], indicators: dict[str, Any]) -> float:
    risk = 15.0
    if _flag(indicators.get("hardExclusion")):
        risk += 45
    if _flag(indicators.get("ecologicalReviewRequired")):
        risk += 18
    if _flag(indicators.get("socialReviewRequired")):
        risk += 10
    if _flag(indicators.get("landHistoryReviewRequired")):
        risk += 12
    if _flag(indicators.get("mrvReviewRequired")):
        risk += 8
    uncertainty = _number_or_none(indicators.get("remoteSensingUncertaintyPct"))
    if uncertainty is not None:
        risk += max(0, uncertainty - 45) * 0.35
    if str(indicators.get("recentDeforestationRisk", "")).lower() == "high":
        risk += 35
    if str(indicators.get("rainfallReliability", "")).lower() == "low":
        risk += 14
    if str(indicators.get("soilSuitability", "")).lower() == "low":
        risk += 10
    if str(indicators.get("protectedAreaConcern", "")).lower() in {"partial", "unclear", "high"}:
        risk += 12
    if _number(indicators.get("meanSlopeDeg"), 0) > 20:
        risk += 8
    if any("tenure" in item.lower() for item in area.get("uncertainties", [])):
        risk += 8
    return _clamp(risk, 0, 100)


def _carbon_readiness(indicators: dict[str, Any], risk_score: float) -> str:
    monitoring = str(indicators.get("monitoringFeasibility", "")).lower()
    if indicators.get("forestLossRecent") is True or str(indicators.get("recentDeforestationRisk", "")).lower() == "high" or risk_score >= 60:
        return "low"
    if monitoring == "low":
        return "low"
    if risk_score >= 35 or monitoring == "medium" or str(indicators.get("protectedAreaConcern", "")).lower() in {"partial", "unclear"}:
        return "medium"
    return "high"


def _risk_flags(area: dict[str, Any], indicators: dict[str, Any]) -> list[str]:
    flags = list(area.get("riskFlags", []))
    if _flag(indicators.get("hardExclusion")):
        flags.append("hard exclusion signal in GEE screen")
    if _flag(indicators.get("ecologicalReviewRequired")):
        flags.append("ecological safeguard review required")
    if _flag(indicators.get("socialReviewRequired")):
        flags.append("social or cropland review required")
    if _flag(indicators.get("landHistoryReviewRequired")):
        flags.append("land history review required")
    if _flag(indicators.get("mrvReviewRequired")):
        flags.append("MRV/data confidence review required")
    if str(indicators.get("recentDeforestationRisk", "")).lower() == "high":
        flags.append("recent forest loss signal")
    if str(indicators.get("protectedAreaConcern", "")).lower() in {"partial", "unclear", "high"}:
        flags.append("safeguard/legal review required")
    if not flags:
        flags.append("field validation required")
    return sorted(set(flags))


def _recommended_action(priority_score: int, risk_score: float) -> str:
    if risk_score >= 60:
        return "Do not prioritise before expert risk review"
    if priority_score >= 80:
        return "High-priority field validation"
    if priority_score >= 65:
        return "Candidate for validation shortlist"
    return "Monitor or deprioritise for first-pass validation"


def _evidence(area: dict[str, Any]) -> list[str]:
    indicators = _indicators(area)
    evidence = list(area.get("evidence", []))
    if indicators.get("rainfallReliability"):
        evidence.append(f"{indicators['rainfallReliability']} rainfall reliability")
    if indicators.get("meanSlopeDeg") is not None:
        evidence.append(f"{indicators['meanSlopeDeg']} degree mean slope")
    if indicators.get("restorationSystemCode"):
        evidence.append(f"{indicators['restorationSystemCode']} restoration system")
    if indicators.get("mrvReadinessPct") is not None:
        evidence.append(f"{round(_number(indicators.get('mrvReadinessPct'), 0))}% MRV readiness proxy")
    return sorted(set(evidence))


def _uncertainties(area: dict[str, Any]) -> list[str]:
    uncertainties = list(area.get("uncertainties", []))
    if not uncertainties:
        uncertainties.append("field validation required")
    return uncertainties


def _number(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _number_or_none(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _flag(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return str(value).lower() in {"true", "yes", "y"}


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))
