import json
import os

from app import lambda_handler


os.environ.setdefault("BEDROCK_ENABLED", "false")


def invoke(route_key: str, method: str, path: str, body: dict | None = None, path_parameters: dict | None = None) -> None:
    event = {
        "routeKey": route_key,
        "rawPath": path,
        "requestContext": {"http": {"method": method}},
        "pathParameters": path_parameters or {},
        "body": json.dumps(body or {}),
    }
    response = lambda_handler(event, None)
    print(f"{method} {path}: {response['statusCode']}")


if __name__ == "__main__":
    invoke("GET /health", "GET", "/health")
    invoke("GET /areas", "GET", "/areas")
    invoke("GET /areas/{areaId}", "GET", "/areas/ET-001", path_parameters={"areaId": "ET-001"})
    invoke(
        "POST /areas/{areaId}/explain",
        "POST",
        "/areas/ET-001/explain",
        path_parameters={"areaId": "ET-001"},
    )
    invoke("POST /scenario", "POST", "/scenario", {"areaIds": ["ET-001", "ET-002"]})
    invoke("POST /field-brief", "POST", "/field-brief", {"areaId": "ET-001"})
