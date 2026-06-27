import json
import os
from typing import Any


SCORED_AREAS_KEY = "processed/scored_areas.json"


MOCK_AREAS: list[dict[str, Any]] = [
    {
        "areaId": "ET-001",
        "name": "Example Woreda",
        "region": "Southwest Ethiopia",
        "priorityScore": 86,
        "carbonScore": 82,
        "treeSurvivalScore": 78,
        "costEfficiencyScore": 74,
        "carbonCreditReadiness": "medium",
        "livelihoodScore": 80,
        "biodiversityScore": 68,
        "riskScore": 22,
        "riskFlags": ["biodiversity proxy only", "field validation required"],
        "recommendedAction": "High-priority field validation",
        "evidence": [
            "moderate rainfall reliability",
            "nearby communities",
            "manageable slope",
            "no strong recent-deforestation signal",
        ],
        "uncertainties": [
            "land tenure unknown",
            "species suitability needs local validation",
        ],
    },
    {
        "areaId": "ET-002",
        "name": "Bench Maji Candidate Area",
        "region": "Southwest Ethiopia",
        "priorityScore": 73,
        "carbonScore": 70,
        "treeSurvivalScore": 72,
        "costEfficiencyScore": 76,
        "carbonCreditReadiness": "low",
        "livelihoodScore": 78,
        "biodiversityScore": 64,
        "riskScore": 35,
        "riskFlags": ["land access unclear", "carbon baseline incomplete"],
        "recommendedAction": "Candidate for desk review",
        "evidence": [
            "community access appears feasible",
            "moderate restoration potential",
            "road distance is manageable",
        ],
        "uncertainties": [
            "carbon baseline requires better data",
            "recent land use needs field review",
        ],
    },
]


def load_areas() -> tuple[list[dict[str, Any]], str]:
    bucket = os.environ.get("PROCESSED_DATA_BUCKET")
    if not bucket:
        return MOCK_AREAS, "mock"

    try:
        import boto3

        client = boto3.client("s3")
        response = client.get_object(Bucket=bucket, Key=SCORED_AREAS_KEY)
        payload = response["Body"].read().decode("utf-8")
        data = json.loads(payload)
        if isinstance(data, dict) and isinstance(data.get("areas"), list):
            return data["areas"], "s3"
        if isinstance(data, list):
            return data, "s3"
    except Exception as exc:
        print(f"Falling back to mock areas after S3 read failed: {exc}")

    return MOCK_AREAS, "mock"


def get_area(area_id: str) -> dict[str, Any] | None:
    areas, _ = load_areas()
    return next((area for area in areas if area.get("areaId") == area_id), None)
