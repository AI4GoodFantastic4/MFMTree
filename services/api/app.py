import json
import os
from typing import Any

from bedrock import compare_areas, generate_area_explanation, generate_field_brief
from cost_estimator import estimate_area_cost, estimate_cost_for_area, load_cost_assumptions, plan_budget
from data import DataUnavailableError, get_area, load_area_collection, load_areas
from data_sources import get_data_source, load_data_sources
from scoring_engine import apply_scores, scored_area_list
from voice import VoiceGenerationError, generate_voice_audio, generate_voice_fallback


DEFAULT_AREA_LIMIT = 1000
MAX_AREA_LIMIT = 2000


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    try:
        return _route(event, context)
    except DataUnavailableError as exc:
        return _json(404, {"message": str(exc), "source": "missing"})


def _route(event: dict[str, Any], context: Any) -> dict[str, Any]:
    route_key = event.get("routeKey", "")
    path = event.get("rawPath", "")
    method = event.get("requestContext", {}).get("http", {}).get("method", "")

    if route_key == "GET /health" or (method == "GET" and path == "/health"):
        return _json(200, {"status": "ok", "service": "mfmtree-api"})

    if route_key == "GET /areas" or (method == "GET" and path == "/areas"):
        collection = load_area_collection()
        limit = _area_limit(event)
        scored_areas = _ranked_scored_areas(collection["areas"], limit=limit)
        area_ids = {area["areaId"] for area in scored_areas if area.get("areaId")}
        return _json(
            200,
            {
                "geojson": _filter_geojson_by_area_ids(collection["geojson"], area_ids),
                "areas": scored_areas,
                "source": collection["source"],
                "limit": limit,
                "available": len(collection["areas"]),
                "returned": len(scored_areas),
            },
        )

    if route_key == "GET /scores" or (method == "GET" and path == "/scores"):
        areas, source = load_areas()
        limit = _area_limit(event)
        scored_areas = _ranked_scored_areas(areas, limit=limit)
        return _json(
            200,
            {
                "scoresByArea": {
                    area["areaId"]: _comparison_score_payload(area)
                    for area in scored_areas
                    if area.get("areaId")
                },
                "source": source,
                "limit": limit,
                "available": len(areas),
                "returned": len(scored_areas),
            },
        )

    if route_key == "GET /data-sources" or (method == "GET" and path == "/data-sources"):
        sources, source = load_data_sources()
        return _json(200, {"dataSources": sources, "source": source})

    if route_key == "GET /data-sources/{sourceId}" or (method == "GET" and path.startswith("/data-sources/")):
        source_id = _path_param(event, "sourceId") or path.rsplit("/", 1)[-1]
        data_source = get_data_source(source_id)
        if not data_source:
            return _json(404, {"message": f"Data source not found: {source_id}"})
        return _json(200, data_source)

    if route_key == "GET /areas/{areaId}/cost-estimate" or (
        method == "GET" and path.startswith("/areas/") and path.endswith("/cost-estimate")
    ):
        area_id = _path_param(event, "areaId") or path.split("/")[-2]
        area = get_area(area_id)
        if not area:
            return _json(404, {"message": f"Area not found: {area_id}"})
        return _json(200, estimate_cost_for_area(apply_scores(area)))

    if route_key == "GET /areas/{areaId}" or (method == "GET" and path.startswith("/areas/")):
        area_id = _path_param(event, "areaId") or path.rsplit("/", 1)[-1]
        area = get_area(area_id)
        if not area:
            return _json(404, {"message": f"Area not found: {area_id}"})
        return _json(200, apply_scores(area))

    if route_key == "POST /areas/{areaId}/explain" or (method == "POST" and path.endswith("/explain")):
        area_id = _path_param(event, "areaId") or path.split("/")[-2]
        area = get_area(area_id)
        if not area:
            return _json(404, {"message": f"Area not found: {area_id}"})
        scored_area = apply_scores(area)
        cost_estimate = estimate_cost_for_area(scored_area)
        explanation = generate_area_explanation(scored_area, cost_estimate)
        return _json(200, _area_explanation_payload(scored_area, cost_estimate, explanation))

    if route_key == "POST /areas/{areaId}/field-brief" or (
        method == "POST" and path.startswith("/areas/") and path.endswith("/field-brief")
    ):
        area_id = _path_param(event, "areaId") or path.split("/")[-2]
        area = get_area(area_id)
        if not area:
            return _json(404, {"message": f"Area not found: {area_id}"})
        scored_area = apply_scores(area)
        return _json(200, {"areaId": area_id, "fieldBrief": generate_field_brief(scored_area, estimate_cost_for_area(scored_area))})

    if route_key == "POST /areas/{areaId}/carbon-readiness" or (
        method == "POST" and path.startswith("/areas/") and path.endswith("/carbon-readiness")
    ):
        area_id = _path_param(event, "areaId") or path.split("/")[-2]
        area = get_area(area_id)
        if not area:
            return _json(404, {"message": f"Area not found: {area_id}"})
        return _json(200, _carbon_readiness(apply_scores(area)))

    if route_key == "POST /cost-estimate" or (method == "POST" and path == "/cost-estimate"):
        return _handle_cost_estimate(event)

    if route_key == "POST /budget-plan" or (method == "POST" and path == "/budget-plan"):
        return _handle_budget_plan(event)

    if route_key == "POST /scenario" or (method == "POST" and path == "/scenario"):
        return _handle_scenario(event)

    if route_key == "POST /compare-areas" or (method == "POST" and path == "/compare-areas"):
        return _handle_compare_areas(event)

    if route_key == "POST /field-brief" or (method == "POST" and path == "/field-brief"):
        body = _body(event)
        area_id = body.get("areaId", "ET-001")
        area = get_area(area_id)
        if not area:
            return _json(404, {"message": f"Area not found: {area_id}"})
        scored_area = apply_scores(area)
        return _json(200, {"areaId": area_id, "fieldBrief": generate_field_brief(scored_area, estimate_cost_for_area(scored_area))})

    if route_key in {"POST /voice", "POST /tts"} or (method == "POST" and path in {"/voice", "/tts"}):
        return _handle_voice(event)

    return _json(404, {"message": f"Unsupported route: {method} {path or route_key}"})


def _handle_cost_estimate(event: dict[str, Any]) -> dict[str, Any]:
    body = _body(event)
    assumptions_override = body.get("assumptionsOverride") or body.get("assumptions")
    indicators = body.get("indicators") if isinstance(body.get("indicators"), dict) else body
    return _json(200, estimate_area_cost(indicators, assumptions_override))


def _handle_voice(event: dict[str, Any]) -> dict[str, Any]:
    body = _body(event)
    text = str(body.get("text") or "")
    try:
        return _json(200, generate_voice_audio(text))
    except VoiceGenerationError as exc:
        print(f"Voice generation unavailable; returning alignment-only fallback: {exc}")
        return _json(200, generate_voice_fallback(text, str(exc)))


def _handle_budget_plan(event: dict[str, Any]) -> dict[str, Any]:
    body = _body(event)
    budget = _number(body.get("budget"), 0)
    assumptions = load_cost_assumptions()
    currency = body.get("currency") or assumptions["currency"]
    risk_tolerance = body.get("riskTolerance", "medium")
    minimum_readiness = body.get("minimumCarbonCreditReadiness", "medium")
    areas, source = load_areas()
    plan = plan_budget(scored_area_list(areas), budget, currency, risk_tolerance, minimum_readiness)
    plan["source"] = source
    plan["objective"] = body.get("objective", "maximize_risk_adjusted_carbon_roi")
    return _json(200, plan)


def _handle_scenario(event: dict[str, Any]) -> dict[str, Any]:
    body = _body(event)
    weights = body.get("weights") if isinstance(body.get("weights"), dict) else body
    area_ids = body.get("areaIds") or [body.get("areaIdA"), body.get("areaIdB")]
    area_ids = [area_id for area_id in area_ids if area_id]
    areas, source = load_areas()
    limit = _area_limit(event, body)
    ranked = _ranked_scored_areas(areas, weights, limit=limit)
    scores_by_area = {
        area["areaId"]: _comparison_score_payload(area)
        for area in ranked
        if area.get("areaId")
    }

    if len(area_ids) >= 2:
        area_a = next((area for area in areas if area.get("areaId") == area_ids[0]), None)
        area_b = next((area for area in areas if area.get("areaId") == area_ids[1]), None)
        if not area_a or not area_b:
            return _json(404, {"message": "One or more scenario areas were not found."})
        scored_a = apply_scores(area_a, weights)
        scored_b = apply_scores(area_b, weights)
        cost_a = estimate_cost_for_area(scored_a)
        cost_b = estimate_cost_for_area(scored_b)
        return _json(
            200,
            {
                "scenario": body.get("name", "Area comparison"),
                "source": source,
                "areaIds": [scored_a["areaId"], scored_b["areaId"]],
                "scoresByArea": scores_by_area,
                "limit": limit,
                "available": len(areas),
                "returned": len(scores_by_area),
                "topAreaIds": [area["areaId"] for area in ranked[:3]],
                "analysis": compare_areas(scored_a, scored_b, cost_a, cost_b),
            },
        )

    return _json(
        200,
        {
            "scenario": body.get("name", "Default prioritisation"),
            "source": source,
            "limit": limit,
            "available": len(areas),
            "returned": len(scores_by_area),
            "topAreaIds": [area["areaId"] for area in ranked[:3]],
            "scoresByArea": scores_by_area,
            "analysis": "Scenario recalculates deterministic scores from indicator inputs and scenario weights. Geometry is unchanged; onsite validation remains required before approval.",
        },
    )


def _handle_compare_areas(event: dict[str, Any]) -> dict[str, Any]:
    body = _body(event)
    weights = body.get("weights") if isinstance(body.get("weights"), dict) else body
    area_ids = body.get("areaIds") or [body.get("areaIdA"), body.get("areaIdB")]
    area_ids = [area_id for area_id in area_ids if area_id]
    if len(area_ids) < 2:
        return _json(400, {"message": "Provide two area IDs using areaIds or areaIdA/areaIdB."})

    area_a = get_area(area_ids[0])
    area_b = get_area(area_ids[1])
    if not area_a or not area_b:
        return _json(404, {"message": "One or more comparison areas were not found."})

    scored_a = apply_scores(area_a, weights)
    scored_b = apply_scores(area_b, weights)
    cost_a = estimate_cost_for_area(scored_a)
    cost_b = estimate_cost_for_area(scored_b)
    recommended = scored_a if scored_a["priorityScore"] >= scored_b["priorityScore"] else scored_b
    other = scored_b if recommended is scored_a else scored_a
    confidence = _comparison_confidence(scored_a["priorityScore"], scored_b["priorityScore"])
    key_tradeoffs = _comparison_tradeoffs(scored_a, scored_b)
    risk_flags = _unique_list(recommended.get("riskFlags", []) + other.get("riskFlags", []))
    field_questions = _comparison_field_questions()
    narrative_summary = compare_areas(scored_a, scored_b, cost_a, cost_b)
    caveat = "This recommendation is based on available indicators and requires onsite expert validation."
    return _json(
        200,
        {
            "areaIds": [scored_a["areaId"], scored_b["areaId"]],
            "recommendedAreaId": recommended["areaId"],
            "recommendedAreaName": _area_label(recommended),
            "recommendation": f"Validate {_area_label(recommended)} first for field review.",
            "confidence": confidence,
            "summary": narrative_summary,
            "keyTradeoffs": key_tradeoffs,
            "comparisonBullets": key_tradeoffs,
            "riskFlags": risk_flags,
            "riskWarnings": risk_flags,
            "fieldValidationQuestions": field_questions,
            "decisionBasis": ["priority score", "carbon readiness", "cost efficiency", "risk flags"],
            "caveat": caveat,
            "narrativeSummary": narrative_summary,
            "llmExplanation": narrative_summary,
            "costEstimatesByArea": {
                scored_a["areaId"]: cost_a,
                scored_b["areaId"]: cost_b,
            },
            "scoresByArea": {
                scored_a["areaId"]: _comparison_score_payload(scored_a),
                scored_b["areaId"]: _comparison_score_payload(scored_b),
            },
            "analysis": narrative_summary,
        },
    )


def _comparison_confidence(score_a: float, score_b: float) -> str:
    delta = abs(score_a - score_b)
    if delta >= 10:
        return "high"
    if delta >= 4:
        return "medium"
    return "low"


def _ranked_scored_areas(
    areas: list[dict[str, Any]],
    weights: dict[str, Any] | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    ranked = sorted(
        scored_area_list(areas, weights),
        key=lambda item: item.get("priorityScore", 0),
        reverse=True,
    )
    return ranked[:limit] if limit else ranked


def _filter_geojson_by_area_ids(geojson: dict[str, Any], area_ids: set[str]) -> dict[str, Any]:
    if not area_ids or not isinstance(geojson, dict):
        return geojson
    features = [
        feature
        for feature in geojson.get("features", [])
        if str((feature.get("properties") or {}).get("areaId")) in area_ids
    ]
    return {**geojson, "features": features}


def _comparison_score_payload(area: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "areaId",
        "name",
        "displayName",
        "technicalName",
        "regionName",
        "zoneName",
        "woredaName",
        "candidateLabel",
        "priorityScore",
        "carbonScore",
        "treeSurvivalScore",
        "costEfficiencyScore",
        "carbonCreditReadiness",
        "riskScore",
        "riskFlags",
        "recommendedAction",
    )
    return {key: area.get(key) for key in keys if area.get(key) is not None}


def _area_explanation_payload(
    area: dict[str, Any],
    cost_estimate: dict[str, Any],
    explanation: str,
) -> dict[str, Any]:
    return {
        "areaId": area.get("areaId"),
        "name": _area_label(area),
        "displayName": area.get("displayName") or area.get("name"),
        "technicalName": area.get("technicalName"),
        "regionName": area.get("regionName") or area.get("region"),
        "zoneName": area.get("zoneName"),
        "woredaName": area.get("woredaName"),
        "candidateLabel": area.get("candidateLabel"),
        "summary": explanation,
        "explanation": explanation,
        "recommendation": area.get("recommendedAction"),
        "evidenceBullets": area.get("evidence", []),
        "risks": _unique_list(area.get("riskFlags", []) + area.get("uncertainties", [])),
        "riskFlags": area.get("riskFlags", []),
        "uncertainties": area.get("uncertainties", []),
        "caveat": "This is a pre-screening result and requires onsite expert validation.",
        "carbonCreditReadiness": area.get("carbonCreditReadiness"),
        "costEstimate": cost_estimate,
    }


def _comparison_tradeoffs(area_a: dict[str, Any], area_b: dict[str, Any]) -> list[str]:
    return [
        _higher_score_tradeoff("priority score", area_a, area_b, "priorityScore"),
        _higher_score_tradeoff("carbon potential", area_a, area_b, "carbonScore"),
        _higher_score_tradeoff("cost efficiency", area_a, area_b, "costEfficiencyScore"),
        _lower_score_tradeoff("risk", area_a, area_b, "riskScore"),
    ]


def _higher_score_tradeoff(label: str, area_a: dict[str, Any], area_b: dict[str, Any], key: str) -> str:
    a_value = _number(area_a.get(key), 0)
    b_value = _number(area_b.get(key), 0)
    if abs(a_value - b_value) < 2:
        return f"{label.capitalize()} is broadly similar between both areas."
    winner = area_a if a_value >= b_value else area_b
    loser = area_b if winner is area_a else area_a
    return f"{_area_label(winner)} has stronger {label} than {_area_label(loser)} ({round(max(a_value, b_value))} vs {round(min(a_value, b_value))})."


def _lower_score_tradeoff(label: str, area_a: dict[str, Any], area_b: dict[str, Any], key: str) -> str:
    a_value = _number(area_a.get(key), 0)
    b_value = _number(area_b.get(key), 0)
    if abs(a_value - b_value) < 2:
        return f"{label.capitalize()} is broadly similar between both areas."
    winner = area_a if a_value <= b_value else area_b
    loser = area_b if winner is area_a else area_a
    return f"{_area_label(winner)} has the lower {label} signal than {_area_label(loser)} ({round(min(a_value, b_value))} vs {round(max(a_value, b_value))})."


def _area_label(area: dict[str, Any]) -> str:
    return str(area.get("displayName") or area.get("name") or area.get("candidateLabel") or area.get("areaId") or "the selected area")


def _comparison_field_questions() -> list[str]:
    return [
        "Confirm actual plantable hectares and restoration boundaries.",
        "Confirm local seedling and labor costs.",
        "Confirm access, road constraints, and wet-season transport risk.",
        "Confirm land tenure, safeguards, and recent deforestation history.",
        "Confirm whether a carbon-credit pathway is realistic.",
    ]


def _unique_list(items: list[str]) -> list[str]:
    return list(dict.fromkeys(item for item in items if item))


def _carbon_readiness(area: dict[str, Any]) -> dict[str, Any]:
    indicators = area.get("indicators") or area.get("costIndicators") or {}
    estimate = estimate_cost_for_area(area)
    blockers: list[str] = []
    strengths: list[str] = []

    recent_deforestation_risk = str(indicators.get("recentDeforestationRisk", "")).lower()
    protected_area_concern = str(indicators.get("protectedAreaConcern", "")).lower()
    monitoring_feasibility = str(indicators.get("monitoringFeasibility", "")).lower()

    if indicators.get("forestLossRecent") is True or recent_deforestation_risk == "high":
        blockers.append("recent deforestation risk requires carbon integrity review")
    else:
        strengths.append("no high recent-deforestation signal in available indicators")

    if estimate["estimatedPlantableHa"] < 500:
        blockers.append("plantable area may be small for carbon project economics")
    else:
        strengths.append("plantable area size appears material for pre-screening")

    if monitoring_feasibility == "low":
        blockers.append("MRV readiness is low in the remote-sensing screen")
    elif monitoring_feasibility in {"medium", "high"}:
        strengths.append(f"{monitoring_feasibility} MRV readiness in the remote-sensing screen")
    elif _number(indicators.get("distanceToRoadKm"), 99) > 30:
        blockers.append("remote access may make monitoring difficult")
    else:
        strengths.append("monitoring access appears feasible for pre-screening")

    if "land tenure unknown" in area.get("uncertainties", []):
        blockers.append("land tenure unknown")

    if protected_area_concern in {"partial", "unclear", "high"} or _number(indicators.get("ecologicalReviewRequired"), 0) > 0:
        blockers.append("protected-area or safeguard status requires review")

    if estimate["estimatedNetTCO2e"] >= 50000:
        strengths.append("carbon potential is material in the planning estimate")

    readiness = "high"
    if blockers:
        readiness = "medium"
    if recent_deforestation_risk == "high" or len(blockers) >= 3:
        readiness = "low"

    return {
        "areaId": area.get("areaId"),
        "carbonReadiness": readiness,
        "currentLabel": area.get("carbonCreditReadiness"),
        "strengths": strengths,
        "blockers": blockers,
        "caveats": [
            "Deterministic MVP screen only.",
            "Not carbon-credit certification.",
            "Onsite expert validation and legal review are required.",
        ],
    }


def _path_param(event: dict[str, Any], name: str) -> str | None:
    return (event.get("pathParameters") or {}).get(name)


def _body(event: dict[str, Any]) -> dict[str, Any]:
    raw_body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        return {}
    try:
        parsed = json.loads(raw_body)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _area_limit(event: dict[str, Any], body: dict[str, Any] | None = None) -> int:
    query = event.get("queryStringParameters") or {}
    raw_limit = None
    if body and body.get("limit") is not None:
        raw_limit = body.get("limit")
    elif query.get("limit") is not None:
        raw_limit = query.get("limit")
    else:
        raw_limit = os.environ.get("DEFAULT_AREA_LIMIT", str(DEFAULT_AREA_LIMIT))

    limit = _int_value(raw_limit, DEFAULT_AREA_LIMIT)
    max_limit = _int_value(os.environ.get("MAX_AREA_LIMIT"), MAX_AREA_LIMIT)
    return max(1, min(limit, max_limit))


def _int_value(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _number(value: Any, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _json(status_code: int, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "content-type": "application/json",
        },
        "body": json.dumps(payload, ensure_ascii=True),
    }
