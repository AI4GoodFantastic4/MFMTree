import json
from typing import Any

from bedrock import compare_areas, generate_area_explanation, generate_field_brief
from data import get_area, load_areas


def lambda_handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    route_key = event.get("routeKey", "")
    path = event.get("rawPath", "")
    method = event.get("requestContext", {}).get("http", {}).get("method", "")

    if route_key == "GET /health" or (method == "GET" and path == "/health"):
        return _json(200, {"status": "ok", "service": "mfmtree-api"})

    if route_key == "GET /areas" or (method == "GET" and path == "/areas"):
        areas, source = load_areas()
        return _json(200, {"areas": areas, "source": source})

    if route_key == "GET /areas/{areaId}" or (method == "GET" and path.startswith("/areas/")):
        area_id = _path_param(event, "areaId") or path.rsplit("/", 1)[-1]
        area = get_area(area_id)
        if not area:
            return _json(404, {"message": f"Area not found: {area_id}"})
        return _json(200, area)

    if route_key == "POST /areas/{areaId}/explain" or (method == "POST" and path.endswith("/explain")):
        area_id = _path_param(event, "areaId") or path.split("/")[-2]
        area = get_area(area_id)
        if not area:
            return _json(404, {"message": f"Area not found: {area_id}"})
        return _json(200, {"areaId": area_id, "explanation": generate_area_explanation(area)})

    if route_key == "POST /scenario" or (method == "POST" and path == "/scenario"):
        return _handle_scenario(event)

    if route_key == "POST /field-brief" or (method == "POST" and path == "/field-brief"):
        body = _body(event)
        area_id = body.get("areaId", "ET-001")
        area = get_area(area_id)
        if not area:
            return _json(404, {"message": f"Area not found: {area_id}"})
        return _json(200, {"areaId": area_id, "fieldBrief": generate_field_brief(area)})

    return _json(404, {"message": f"Unsupported route: {method} {path or route_key}"})


def _handle_scenario(event: dict[str, Any]) -> dict[str, Any]:
    body = _body(event)
    area_ids = body.get("areaIds") or [body.get("areaIdA"), body.get("areaIdB")]
    area_ids = [area_id for area_id in area_ids if area_id]

    if len(area_ids) >= 2:
        area_a = get_area(area_ids[0])
        area_b = get_area(area_ids[1])
        if not area_a or not area_b:
            return _json(404, {"message": "One or more scenario areas were not found."})
        return _json(
            200,
            {
                "scenario": body.get("name", "Area comparison"),
                "areaIds": [area_a["areaId"], area_b["areaId"]],
                "analysis": compare_areas(area_a, area_b),
            },
        )

    areas, source = load_areas()
    ranked = sorted(areas, key=lambda item: item.get("priorityScore", 0), reverse=True)
    return _json(
        200,
        {
            "scenario": body.get("name", "Default prioritisation"),
            "source": source,
            "topAreaIds": [area["areaId"] for area in ranked[:3]],
            "analysis": "Scenario mock ranks areas by priorityScore. Field validation remains required before approval.",
        },
    )


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


def _json(status_code: int, payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "headers": {
            "content-type": "application/json",
        },
        "body": json.dumps(payload, ensure_ascii=True),
    }
