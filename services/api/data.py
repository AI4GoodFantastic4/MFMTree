import json
import os
from pathlib import Path
from typing import Any


DEFAULT_GEOMETRY_KEY = "geometry/areas.geojson"
DEFAULT_INDICATORS_KEY = "indicators/latest.json"
SCORED_AREAS_KEY = "processed/scored_areas.json"
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOCAL_GEOJSON_PATH = REPO_ROOT / "data" / "sample" / "areas.geojson"


class DataUnavailableError(RuntimeError):
    pass


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


def load_area_collection() -> dict[str, Any]:
    bucket = _processed_bucket()
    geometry_key = os.environ.get("GEOMETRY_KEY", DEFAULT_GEOMETRY_KEY)
    indicators_key = os.environ.get("INDICATORS_KEY", DEFAULT_INDICATORS_KEY)

    if bucket:
        geojson = load_geojson_from_s3(bucket, geometry_key)
        if geojson:
            indicators = _read_s3_json(bucket, indicators_key) or {}
            areas = _merge_geometry_and_indicators(geojson, indicators)
            _log_data_source("s3", geometry_key, len(areas))
            return {"areas": areas, "geojson": geojson, "source": "s3"}

        message = f"Required GeoJSON is missing or invalid: s3://{bucket}/{geometry_key}"
        if not _allow_mock_data():
            _log_data_source("missing", geometry_key, 0, message)
            raise DataUnavailableError(message)

    local_geojson = load_local_or_mock_geojson()
    if local_geojson:
        areas = _merge_geometry_and_indicators(local_geojson, _mock_indicators_by_area())
        _log_data_source("local", str(_local_geojson_path()), len(areas))
        return {"areas": areas, "geojson": local_geojson, "source": "local"}

    if _allow_mock_data():
        geojson = _mock_geojson()
        areas = _merge_geometry_and_indicators(geojson, _mock_indicators_by_area())
        _log_data_source("mock", "generated", len(areas))
        return {"areas": areas, "geojson": geojson, "source": "mock"}

    message = "No geometry source available. Set PROCESSED_BUCKET/PROCESSED_DATA_BUCKET or LOCAL_GEOJSON_PATH, or enable ALLOW_MOCK_DATA=true."
    _log_data_source("missing", "none", 0, message)
    raise DataUnavailableError(message)


def load_areas() -> tuple[list[dict[str, Any]], str]:
    collection = load_area_collection()
    return collection["areas"], collection["source"]


def load_geojson_from_s3(bucket: str, key: str | None = None) -> dict[str, Any] | None:
    geometry_key = key or os.environ.get("GEOMETRY_KEY", DEFAULT_GEOMETRY_KEY)
    try:
        import boto3

        client = boto3.client("s3")
        return _validate_feature_collection(_read_json(client, bucket, geometry_key))
    except Exception as exc:
        print(json.dumps({"level": "warning", "event": "geojson_s3_read_failed", "bucket": bucket, "key": geometry_key, "error": str(exc)}))
        return None


def load_local_or_mock_geojson() -> dict[str, Any] | None:
    path = _local_geojson_path()
    if not path or not path.exists():
        return None
    try:
        return _validate_feature_collection(json.loads(path.read_text(encoding="utf-8")))
    except Exception as exc:
        print(json.dumps({"level": "warning", "event": "local_geojson_read_failed", "path": str(path), "error": str(exc)}))
        return None


def get_area(area_id: str) -> dict[str, Any] | None:
    areas, _ = load_areas()
    return next((area for area in areas if area.get("areaId") == area_id), None)


def _processed_bucket() -> str | None:
    return os.environ.get("PROCESSED_BUCKET") or os.environ.get("PROCESSED_DATA_BUCKET")


def _allow_mock_data() -> bool:
    return os.environ.get("ALLOW_MOCK_DATA", "true").strip().lower() in {"1", "true", "yes", "y"}


def _local_geojson_path() -> Path | None:
    configured = os.environ.get("LOCAL_GEOJSON_PATH")
    if configured:
        return Path(configured)
    return DEFAULT_LOCAL_GEOJSON_PATH


def _read_s3_json(bucket: str, key: str) -> Any | None:
    try:
        import boto3

        return _read_json(boto3.client("s3"), bucket, key)
    except Exception as exc:
        print(json.dumps({"level": "warning", "event": "s3_json_read_failed", "bucket": bucket, "key": key, "error": str(exc)}))
        return None


def _read_json(client: Any, bucket: str, key: str) -> Any | None:
    try:
        response = client.get_object(Bucket=bucket, Key=key)
        payload = response["Body"].read().decode("utf-8")
        return json.loads(payload)
    except Exception as exc:
        print(json.dumps({"level": "warning", "event": "s3_object_missing_or_unreadable", "bucket": bucket, "key": key, "error": str(exc)}))
        return None


def _validate_feature_collection(payload: Any) -> dict[str, Any] | None:
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        return None
    features = payload.get("features")
    if not isinstance(features, list):
        return None
    valid_features = []
    for feature in features:
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            continue
        properties = feature.get("properties")
        geometry = feature.get("geometry")
        if not isinstance(properties, dict) or not isinstance(geometry, dict):
            continue
        area_id = _stable_area_id(properties)
        if not area_id:
            continue
        properties = dict(properties)
        properties.setdefault("areaId", area_id)
        properties.setdefault("name", _area_name(properties))
        properties.setdefault("region", "Ethiopia")
        feature = {**feature, "properties": properties}
        valid_features.append(feature)
    if not valid_features:
        return None
    return {**payload, "features": valid_features}


def _merge_geometry_and_indicators(geometry: Any, indicators_payload: Any) -> list[dict[str, Any]]:
    indicators_by_id = _indicator_map(indicators_payload)
    areas: list[dict[str, Any]] = []

    if isinstance(geometry, dict) and geometry.get("type") == "FeatureCollection":
        for feature in geometry.get("features", []):
            properties = dict(feature.get("properties") or {})
            area_id = _stable_area_id(properties)
            if not area_id:
                continue
            properties.setdefault("areaId", area_id)
            properties.setdefault("name", _area_name(properties))
            properties.setdefault("region", "Ethiopia")
            indicators = _normalize_indicators({**_indicators_from_properties(properties), **indicators_by_id.get(area_id, {})})
            areas.append(
                {
                    **properties,
                    "areaId": area_id,
                    "geometry": feature.get("geometry"),
                    "indicators": indicators,
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
        return {
            _stable_area_id(item): _normalize_indicators(item)
            for item in raw_areas
            if isinstance(item, dict) and _stable_area_id(item)
        }
    if isinstance(raw_areas, dict):
        return {str(key): _normalize_indicators(value) for key, value in raw_areas.items() if isinstance(value, dict)}
    return {str(key): _normalize_indicators(value) for key, value in indicators_payload.items() if isinstance(value, dict)}


def _stable_area_id(properties: dict[str, Any]) -> str | None:
    raw_id = properties.get("areaId") or properties.get("area_id") or properties.get("id")
    if raw_id:
        return str(raw_id)
    grid_id = properties.get("grid_id")
    if grid_id is not None:
        return f"ET-GRID-{grid_id}"
    return None


def _area_name(properties: dict[str, Any]) -> str:
    if properties.get("name"):
        return str(properties["name"])
    if properties.get("grid_id") is not None:
        return f"Grid cell {properties['grid_id']}"
    return str(properties.get("areaId") or properties.get("area_id") or "Candidate area")


def _normalize_indicators(indicators: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(indicators)
    if normalized.get("areaId") is None:
        area_id = _stable_area_id(normalized)
        if area_id:
            normalized["areaId"] = area_id

    mappings = {
        "area_ha": "totalAreaHa",
        "slope_deg": "meanSlopeDeg",
        "current_ndvi": "meanNdvi",
        "carbon_tonnes_per_ha_2010": "carbonTonnesPerHa2010",
        "population_local_mean_5km": "populationLocalMean5km",
        "near_protected_area": "nearProtectedArea",
        "protected_area_share": "protectedAreaShare",
        "restorable_land_share": "restorableLandShare",
        "restorable_land_pct": "restorableLandPct",
        "target_project_area_ha": "targetProjectAreaHa",
        "plant_fit": "plantFit",
        "annual_rain_mm": "annualRainMm",
        "degradation_proxy": "degradationProxy",
        "ndvi_decline_proxy": "ndviDeclineProxy",
        "soil_pawc_0_30cm_cm3cm3": "soilPawc030Cm",
    }
    for source, target in mappings.items():
        if source in normalized and target not in normalized:
            normalized[target] = normalized[source]

    if normalized.get("plantableFraction") is None:
        if normalized.get("restorable_land_pct") is not None:
            normalized["plantableFraction"] = _fraction(normalized["restorable_land_pct"])
        elif normalized.get("restorable_land_share") is not None:
            normalized["plantableFraction"] = _fraction(normalized["restorable_land_share"], already_fraction=True)

    if normalized.get("expectedSurvivalRate") is None:
        plant_fit = _number_or_none(normalized.get("plant_fit"))
        water_soil = _number_or_none(normalized.get("water_soil_proxy"))
        if plant_fit is not None:
            normalized["expectedSurvivalRate"] = _fraction(plant_fit)
        elif water_soil is not None:
            normalized["expectedSurvivalRate"] = _fraction(water_soil)

    if normalized.get("expectedTCO2ePerHa") is None:
        carbon_t_ha = _number_or_none(normalized.get("carbon_tonnes_per_ha_2010"))
        if carbon_t_ha is not None:
            normalized["expectedTCO2ePerHa"] = round(max(carbon_t_ha * 3.667, 0), 2)

    if normalized.get("rainfallReliability") is None:
        rainfall = _number_or_none(normalized.get("annual_rain_mm"))
        if rainfall is not None:
            normalized["rainfallReliability"] = "high" if rainfall >= 1000 else "medium" if rainfall >= 650 else "low"

    if normalized.get("soilSuitability") is None:
        water_soil = _number_or_none(normalized.get("water_soil_proxy"))
        pawc = _number_or_none(normalized.get("soil_pawc_0_30cm_cm3cm3"))
        proxy = water_soil if water_soil is not None else (pawc * 100 if pawc is not None else None)
        if proxy is not None:
            normalized["soilSuitability"] = "high" if proxy >= 75 else "medium" if proxy >= 45 else "low"

    if normalized.get("protectedAreaConcern") is None:
        protected = _number_or_none(normalized.get("protected_area_share"))
        near = _number_or_none(normalized.get("near_protected_area"))
        signal = protected if protected is not None else near
        if signal is not None:
            normalized["protectedAreaConcern"] = "high" if signal >= 0.5 else "partial" if signal > 0.05 else "low"

    if normalized.get("recentDeforestationRisk") is None:
        decline = _number_or_none(normalized.get("ndvi_decline_proxy"))
        degradation = _number_or_none(normalized.get("degradation_proxy"))
        signal = decline if decline is not None else degradation
        if signal is not None:
            normalized["recentDeforestationRisk"] = "high" if signal >= 20 else "medium" if signal >= 5 else "low"

    if normalized.get("populationNearby") is None:
        population_proxy = _number_or_none(normalized.get("population_local_mean_5km"))
        if population_proxy is not None:
            normalized["populationNearby"] = round(population_proxy * 1000)

    return normalized


def _indicators_from_properties(properties: dict[str, Any]) -> dict[str, Any]:
    indicator_keys = {
        "areaId",
        "grid_id",
        "restoration_score",
        "carbon_proxy",
        "biodiversity_proxy",
        "livelihood_proxy",
        "water_soil_proxy",
        "current_ndvi",
        "current_ndmi",
        "degradation_proxy",
        "ndvi_decline_proxy",
        "elevation_m",
        "annual_rain_mm",
        "estimated_cost_million_eur",
        "environmental_roi",
        "restorable_land_pct",
        "restorable_land_share",
        "target_project_area_ha",
        "area_ha",
        "carbon_tonnes_per_ha_2010",
        "slope_deg",
        "population_local_mean_5km",
        "settlement_pressure_1km_pct",
        "near_protected_area",
        "protected_area_share",
        "plant_fit",
        "soil_pawc_0_30cm_cm3cm3",
    }
    return {key: properties[key] for key in indicator_keys if key in properties}


def _number_or_none(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fraction(value: Any, already_fraction: bool = False) -> float:
    number = _number_or_none(value)
    if number is None:
        return 0.0
    fraction = number if already_fraction or number <= 1 else number / 100
    return max(0.0, min(1.0, fraction))


def _mock_indicators_by_area() -> dict[str, dict[str, Any]]:
    return {area["areaId"]: dict(area.get("indicators") or area.get("costIndicators") or {}) for area in MOCK_AREAS}


def _mock_geojson() -> dict[str, Any]:
    polygons = {
        "ET-001": [[[36.35, 7.05], [36.85, 7.1], [36.95, 6.72], [36.52, 6.5], [36.22, 6.75], [36.35, 7.05]]],
        "ET-002": [[[35.75, 8.15], [36.28, 8.28], [36.45, 7.9], [36.05, 7.62], [35.62, 7.82], [35.75, 8.15]]],
        "ET-003": [[[39.05, 6.55], [39.58, 6.5], [39.7, 6.12], [39.22, 5.95], [38.9, 6.2], [39.05, 6.55]]],
        "ET-004": [[[38.15, 10.35], [38.75, 10.42], [38.9, 9.98], [38.42, 9.78], [38.02, 10.02], [38.15, 10.35]]],
        "ET-005": [[[37.25, 6.35], [37.82, 6.42], [37.92, 6.02], [37.48, 5.75], [37.08, 5.98], [37.25, 6.35]]],
    }
    features = []
    for area in MOCK_AREAS:
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "areaId": area["areaId"],
                    "name": area["name"],
                    "region": area["region"],
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": polygons[area["areaId"]],
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def _log_data_source(source: str, key: str, feature_count: int, message: str | None = None) -> None:
    payload = {
        "level": "info",
        "event": "geometry_data_source",
        "source": source,
        "key": key,
        "featureCount": feature_count,
    }
    if message:
        payload["message"] = message
    print(json.dumps(payload, ensure_ascii=True))
