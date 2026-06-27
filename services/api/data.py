import json
import os
from typing import Any


GEOMETRY_KEY = "geometry/areas.geojson"
INDICATORS_KEY = "indicators/latest.json"
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
        "costIndicators": {
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
            "expectedTCO2ePerHa": 68,
        },
    },
    {
        "areaId": "ET-002",
        "name": "Remote Carbon Highlands",
        "region": "Southwest Ethiopia",
        "priorityScore": 88,
        "carbonScore": 92,
        "treeSurvivalScore": 70,
        "costEfficiencyScore": 48,
        "carbonCreditReadiness": "medium",
        "livelihoodScore": 70,
        "biodiversityScore": 76,
        "riskScore": 42,
        "riskFlags": ["remote access", "field validation required"],
        "recommendedAction": "High-carbon candidate with logistics review",
        "evidence": [
            "high restoration carbon potential",
            "remote road access",
            "moderate rainfall reliability",
        ],
        "uncertainties": [
            "transport cost requires local validation",
            "species suitability needs field review",
        ],
        "costIndicators": {
            "areaId": "ET-002",
            "totalAreaHa": 2400,
            "plantableFraction": 0.62,
            "distanceToRoadKm": 24,
            "meanSlopeDeg": 18,
            "rainfallReliability": "medium",
            "soilSuitability": "medium",
            "protectedAreaConcern": "partial",
            "recentDeforestationRisk": "low",
            "expectedSurvivalRate": 0.68,
            "expectedTCO2ePerHa": 86,
        },
    },
    {
        "areaId": "ET-003",
        "name": "Accessible Lowland Buffer",
        "region": "Oromia",
        "priorityScore": 66,
        "carbonScore": 55,
        "treeSurvivalScore": 74,
        "costEfficiencyScore": 88,
        "carbonCreditReadiness": "low",
        "livelihoodScore": 82,
        "biodiversityScore": 52,
        "riskScore": 28,
        "riskFlags": ["lower carbon potential", "field validation required"],
        "recommendedAction": "Low-cost validation candidate",
        "evidence": [
            "near road access",
            "flat or gentle slope",
            "nearby communities",
        ],
        "uncertainties": [
            "carbon uplift may be modest",
            "local land-use priorities need confirmation",
        ],
        "costIndicators": {
            "areaId": "ET-003",
            "totalAreaHa": 950,
            "plantableFraction": 0.74,
            "distanceToRoadKm": 3,
            "meanSlopeDeg": 4,
            "rainfallReliability": "high",
            "soilSuitability": "medium",
            "protectedAreaConcern": "low",
            "recentDeforestationRisk": "low",
            "expectedSurvivalRate": 0.78,
            "expectedTCO2ePerHa": 42,
        },
    },
    {
        "areaId": "ET-004",
        "name": "Recent Loss Watch Area",
        "region": "Amhara",
        "priorityScore": 79,
        "carbonScore": 85,
        "treeSurvivalScore": 62,
        "costEfficiencyScore": 58,
        "carbonCreditReadiness": "low",
        "livelihoodScore": 64,
        "biodiversityScore": 70,
        "riskScore": 68,
        "riskFlags": ["recent forest loss signal", "carbon integrity review required"],
        "recommendedAction": "Do not prioritise before expert risk review",
        "evidence": [
            "high carbon potential",
            "recent forest-loss signal",
            "moderate distance to road",
        ],
        "uncertainties": [
            "carbon-credit eligibility uncertain",
            "land tenure unknown",
        ],
        "costIndicators": {
            "areaId": "ET-004",
            "totalAreaHa": 1300,
            "plantableFraction": 0.58,
            "distanceToRoadKm": 12,
            "meanSlopeDeg": 14,
            "rainfallReliability": "low",
            "soilSuitability": "low",
            "protectedAreaConcern": "unclear",
            "recentDeforestationRisk": "high",
            "expectedSurvivalRate": 0.55,
            "expectedTCO2ePerHa": 80,
        },
    },
    {
        "areaId": "ET-005",
        "name": "Balanced Woreda Candidate",
        "region": "SNNP",
        "priorityScore": 76,
        "carbonScore": 74,
        "treeSurvivalScore": 76,
        "costEfficiencyScore": 72,
        "carbonCreditReadiness": "medium",
        "livelihoodScore": 76,
        "biodiversityScore": 62,
        "riskScore": 33,
        "riskFlags": ["field validation required"],
        "recommendedAction": "Balanced candidate for validation shortlist",
        "evidence": [
            "medium rainfall reliability",
            "manageable slope",
            "community access appears feasible",
        ],
        "uncertainties": [
            "seedling supply cost needs local quote",
            "monitoring feasibility requires review",
        ],
        "costIndicators": {
            "areaId": "ET-005",
            "totalAreaHa": 1500,
            "plantableFraction": 0.66,
            "distanceToRoadKm": 10,
            "meanSlopeDeg": 11,
            "rainfallReliability": "medium",
            "soilSuitability": "high",
            "protectedAreaConcern": "low",
            "recentDeforestationRisk": "medium",
            "expectedSurvivalRate": 0.73,
            "expectedTCO2ePerHa": 64,
        },
    },
]


def load_areas() -> tuple[list[dict[str, Any]], str]:
    bucket = os.environ.get("PROCESSED_DATA_BUCKET")
    if not bucket:
        return MOCK_AREAS, "mock"

    try:
        import boto3

        client = boto3.client("s3")
        geometry = _read_json(client, bucket, GEOMETRY_KEY)
        indicators = _read_json(client, bucket, INDICATORS_KEY)
        if geometry and indicators:
            merged = _merge_geometry_and_indicators(geometry, indicators)
            if merged:
                return merged, "s3:geometry+indicators"

        data = _read_json(client, bucket, SCORED_AREAS_KEY)
        if isinstance(data, dict) and isinstance(data.get("areas"), list):
            return data["areas"], "s3:legacy-scored-areas"
        if isinstance(data, list):
            return data, "s3:legacy-scored-areas"
    except Exception as exc:
        print(f"Falling back to mock areas after S3 read failed: {exc}")

    return MOCK_AREAS, "mock"


def get_area(area_id: str) -> dict[str, Any] | None:
    areas, _ = load_areas()
    return next((area for area in areas if area.get("areaId") == area_id), None)


def _read_json(client: Any, bucket: str, key: str) -> Any | None:
    try:
        response = client.get_object(Bucket=bucket, Key=key)
        payload = response["Body"].read().decode("utf-8")
        return json.loads(payload)
    except Exception as exc:
        print(f"Could not read s3://{bucket}/{key}: {exc}")
        return None


def _merge_geometry_and_indicators(geometry: Any, indicators_payload: Any) -> list[dict[str, Any]]:
    indicators_by_id = _indicator_map(indicators_payload)
    areas: list[dict[str, Any]] = []

    if isinstance(geometry, dict) and geometry.get("type") == "FeatureCollection":
        for feature in geometry.get("features", []):
            properties = dict(feature.get("properties") or {})
            area_id = properties.get("areaId") or properties.get("id")
            if not area_id:
                continue
            areas.append(
                {
                    **properties,
                    "areaId": area_id,
                    "geometry": feature.get("geometry"),
                    "indicators": indicators_by_id.get(area_id, {}),
                }
            )
        return areas

    if isinstance(geometry, dict) and isinstance(geometry.get("areas"), list):
        for area in geometry["areas"]:
            area_id = area.get("areaId")
            if area_id:
                areas.append({**area, "indicators": indicators_by_id.get(area_id, {})})
    return areas


def _indicator_map(indicators_payload: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(indicators_payload, dict):
        return {}
    raw_areas = indicators_payload.get("areas")
    if isinstance(raw_areas, list):
        return {item["areaId"]: item for item in raw_areas if isinstance(item, dict) and item.get("areaId")}
    if isinstance(raw_areas, dict):
        return raw_areas
    return {key: value for key, value in indicators_payload.items() if isinstance(value, dict)}
