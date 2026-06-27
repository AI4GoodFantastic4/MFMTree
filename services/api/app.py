import json
from typing import Any

from bedrock import compare_areas, generate_area_explanation, generate_field_brief
from cost_estimator import estimate_area_cost, estimate_cost_for_area, load_cost_assumptions, plan_budget
from data import DataUnavailableError, get_area, load_area_collection, load_areas
from data_sources import get_data_source, load_data_sources
from scoring_engine import apply_scores, score_areas, scored_area_list


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
        return _json(
            200,
            {
                "geojson": collection["geojson"],
                "areas": scored_area_list(collection["areas"]),
                "source": collection["source"],
            },
        )

    if route_key == "GET /scores" or (method == "GET" and path == "/scores"):
        areas, source = load_areas()
        return _json(200, {"scoresByArea": score_areas(areas), "source": source})

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
        return _json(200, {"areaId": area_id, "explanation": generate_area_explanation(scored_area, estimate_cost_for_area(scored_area))})

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

    return _json(404, {"message": f"Unsupported route: {method} {path or route_key}"})


def _handle_cost_estimate(event: dict[str, Any]) -> dict[str, Any]:
    body = _body(event)
    assumptions_override = body.get("assumptionsOverride") or body.get("assumptions")
    indicators = body.get("indicators") if isinstance(body.get("indicators"), dict) else body
    return _json(200, estimate_area_cost(indicators, assumptions_override))


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
    scores_by_area = score_areas(areas, weights)
    ranked = sorted(scores_by_area.values(), key=lambda item: item.get("priorityScore", 0), reverse=True)

    if len(area_ids) >= 2:
        area_a = next((area for area in areas if area.get("areaId") == area_ids[0]), None)
        area_b = next((area for area in areas if area.get("areaId") == area_ids[1]), None)
        if not area_a or not area_b:
            return _json(404, {"message": "One or more scenario areas were not found."})
        scored_a = apply_scores(area_a, weights)
        scored_b = apply_scores(area_b, weights)
        return _json(
            200,
            {
                "scenario": body.get("name", "Area comparison"),
                "source": source,
                "areaIds": [scored_a["areaId"], scored_b["areaId"]],
                "scoresByArea": scores_by_area,
                "topAreaIds": [area["areaId"] for area in ranked[:3]],
                "analysis": compare_areas(scored_a, scored_b),
            },
        )

    return _json(
        200,
        {
            "scenario": body.get("name", "Default prioritisation"),
            "source": source,
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
    return _json(
        200,
        {
            "areaIds": [scored_a["areaId"], scored_b["areaId"]],
            "scoresByArea": {
                scored_a["areaId"]: {
                    key: scored_a[key]
                    for key in (
                        "areaId",
                        "priorityScore",
                        "carbonScore",
                        "treeSurvivalScore",
                        "costEfficiencyScore",
                        "carbonCreditReadiness",
                        "riskScore",
                        "riskFlags",
                        "recommendedAction",
                    )
                },
                scored_b["areaId"]: {
                    key: scored_b[key]
                    for key in (
                        "areaId",
                        "priorityScore",
                        "carbonScore",
                        "treeSurvivalScore",
                        "costEfficiencyScore",
                        "carbonCreditReadiness",
                        "riskScore",
                        "riskFlags",
                        "recommendedAction",
                    )
                },
            },
            "analysis": compare_areas(scored_a, scored_b),
        },
    )


def _carbon_readiness(area: dict[str, Any]) -> dict[str, Any]:
    indicators = area.get("indicators") or area.get("costIndicators") or {}
    estimate = estimate_cost_for_area(area)
    blockers: list[str] = []
    strengths: list[str] = []

    recent_deforestation_risk = str(indicators.get("recentDeforestationRisk", "")).lower()
    protected_area_concern = str(indicators.get("protectedAreaConcern", "")).lower()

    if recent_deforestation_risk == "high":
        blockers.append("recent deforestation risk requires carbon integrity review")
    else:
        strengths.append("no high recent-deforestation signal in mock indicators")

    if estimate["estimatedPlantableHa"] < 500:
        blockers.append("plantable area may be small for carbon project economics")
    else:
        strengths.append("plantable area size appears material for pre-screening")

    if _number(indicators.get("distanceToRoadKm"), 99) > 30:
        blockers.append("remote access may make monitoring difficult")
    else:
        strengths.append("monitoring access appears feasible for pre-screening")

    if "land tenure unknown" in area.get("uncertainties", []):
        blockers.append("land tenure unknown")

    if protected_area_concern in {"partial", "unclear", "high"}:
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
