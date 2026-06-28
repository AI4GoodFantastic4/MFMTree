import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT_DIR = Path(__file__).resolve().parents[1]
API_DIR = ROOT_DIR / "services" / "api"
SAMPLE_GEOJSON = ROOT_DIR / "data" / "sample" / "areas.geojson"
sys.path.insert(0, str(API_DIR))

from app import lambda_handler  # noqa: E402


def invoke(route_key: str, method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    response = lambda_handler(
        {
            "routeKey": route_key,
            "rawPath": path,
            "queryStringParameters": query or {},
            "requestContext": {"http": {"method": method}},
            "body": json.dumps(body or {}),
        },
        None,
    )
    return {"statusCode": response["statusCode"], "body": json.loads(response["body"])}


class GeoJsonFlowTest(unittest.TestCase):
    def test_get_areas_returns_valid_feature_collection(self) -> None:
        with patch.dict(
            os.environ,
            {
                "PROCESSED_BUCKET": "",
                "PROCESSED_DATA_BUCKET": "",
                "LOCAL_GEOJSON_PATH": str(SAMPLE_GEOJSON),
                "ALLOW_MOCK_DATA": "true",
            },
            clear=False,
        ):
            response = invoke("GET /areas", "GET", "/areas")

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(response["body"]["geojson"]["type"], "FeatureCollection")
        self.assertEqual(response["body"]["source"], "local")
        self.assertGreaterEqual(len(response["body"]["geojson"]["features"]), 3)

    def test_get_areas_respects_limit_query_parameter(self) -> None:
        with patch.dict(
            os.environ,
            {
                "PROCESSED_BUCKET": "",
                "PROCESSED_DATA_BUCKET": "",
                "LOCAL_GEOJSON_PATH": str(SAMPLE_GEOJSON),
                "ALLOW_MOCK_DATA": "true",
                "MAX_AREA_LIMIT": "2000",
            },
            clear=False,
        ):
            response = invoke("GET /areas", "GET", "/areas", query={"limit": "2"})

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(response["body"]["limit"], 2)
        self.assertEqual(response["body"]["returned"], 2)
        self.assertEqual(len(response["body"]["areas"]), 2)
        self.assertEqual(len(response["body"]["geojson"]["features"]), 2)

    def test_every_feature_has_area_id(self) -> None:
        geojson = json.loads(SAMPLE_GEOJSON.read_text(encoding="utf-8"))
        for feature in geojson["features"]:
            self.assertTrue(feature["properties"]["areaId"])

    def test_missing_geometry_with_mock_allowed_returns_mock_geojson(self) -> None:
        with patch.dict(
            os.environ,
            {
                "PROCESSED_BUCKET": "",
                "PROCESSED_DATA_BUCKET": "",
                "LOCAL_GEOJSON_PATH": "/tmp/mfmtree-missing-areas.geojson",
                "ALLOW_MOCK_DATA": "true",
            },
            clear=False,
        ):
            response = invoke("GET /areas", "GET", "/areas")

        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(response["body"]["source"], "mock")
        self.assertEqual(response["body"]["geojson"]["type"], "FeatureCollection")

    def test_missing_geometry_with_mock_disabled_returns_error(self) -> None:
        with patch.dict(
            os.environ,
            {
                "PROCESSED_BUCKET": "",
                "PROCESSED_DATA_BUCKET": "",
                "LOCAL_GEOJSON_PATH": "/tmp/mfmtree-missing-areas.geojson",
                "ALLOW_MOCK_DATA": "false",
            },
            clear=False,
        ):
            response = invoke("GET /areas", "GET", "/areas")

        self.assertEqual(response["statusCode"], 404)
        self.assertIn("No geometry source available", response["body"]["message"])

    def test_scenario_returns_scores_by_area_id(self) -> None:
        with patch.dict(
            os.environ,
            {
                "PROCESSED_BUCKET": "",
                "PROCESSED_DATA_BUCKET": "",
                "LOCAL_GEOJSON_PATH": str(SAMPLE_GEOJSON),
                "ALLOW_MOCK_DATA": "true",
            },
            clear=False,
        ):
            response = invoke("POST /scenario", "POST", "/scenario", {"weights": {"carbon": 0.5}})

        self.assertEqual(response["statusCode"], 200)
        self.assertIn("scoresByArea", response["body"])
        self.assertIn("ET-001", response["body"]["scoresByArea"])

    def test_gee_geojson_grid_id_is_normalized_to_area_id(self) -> None:
        gee_geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "grid_id": 4360000079,
                        "area_ha": 9824.23,
                        "valid_restoration_land": 0.64,
                        "restorable_land_pct": 94.9,
                        "built_up_share": 0.01,
                        "water_wetland_mangrove_share": 0.0,
                        "no_plant_empty_land_share": 0.72,
                        "current_ndvi": 0.216,
                        "rainfall_fit": 0.52,
                        "annual_rain_mm": 754,
                        "slope_deg": 1.05,
                        "plant_fit": 100,
                        "carbon_tonnes_per_ha_2010": 8.56,
                        "near_protected_area": 1,
                        "settlement_pressure_1km_pct_export": 12,
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[39.16, 7.07], [39.25, 7.07], [39.25, 7.16], [39.16, 7.16], [39.16, 7.07]]],
                    },
                }
            ],
        }
        path = Path("/tmp/mfmtree-gee-grid-test.geojson")
        path.write_text(json.dumps(gee_geojson), encoding="utf-8")

        with patch.dict(
            os.environ,
            {
                "PROCESSED_BUCKET": "",
                "PROCESSED_DATA_BUCKET": "",
                "LOCAL_GEOJSON_PATH": str(path),
                "ALLOW_MOCK_DATA": "false",
            },
            clear=False,
        ):
            response = invoke("GET /areas", "GET", "/areas")
            scenario = invoke("POST /scenario", "POST", "/scenario", {"weights": {"carbon": 0.5}})

        area_id = "ET-GRID-4360000079"
        feature_props = response["body"]["geojson"]["features"][0]["properties"]
        area = response["body"]["areas"][0]
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(feature_props["areaId"], area_id)
        self.assertEqual(feature_props["technicalName"], "Grid cell 4360000079")
        self.assertEqual(feature_props["candidateLabel"], "Candidate Area 01")
        self.assertNotIn("Grid cell", feature_props["displayName"])
        self.assertEqual(feature_props["name"], feature_props["displayName"])
        self.assertEqual(area["areaId"], area_id)
        self.assertEqual(area["technicalName"], "Grid cell 4360000079")
        self.assertEqual(area["candidateLabel"], "Candidate Area 01")
        self.assertNotIn("Grid cell", area["displayName"])
        self.assertEqual(area["name"], area["displayName"])
        self.assertEqual(area["indicators"]["totalAreaHa"], 9824.23)
        self.assertAlmostEqual(area["indicators"]["plantableFraction"], 0.64, places=3)
        self.assertEqual(area["indicators"]["rainfallReliability"], "medium")
        self.assertEqual(area["indicators"]["settlementPressure1kmPct"], 12)
        self.assertIn(area_id, scenario["body"]["scoresByArea"])

    def test_low_compute_gee_fields_are_normalized_for_scoring(self) -> None:
        gee_geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "grid_id": "391600_70700",
                        "country": "Ethiopia",
                        "area_ha": 22500,
                        "valid_candidate_10y_cleared_pct": 62,
                        "valid_candidate_10y_cleared_area_ha": 13950,
                        "ndvi_current": 0.42,
                        "ndmi_current": 0.16,
                        "rainfall_fit_pct": 58,
                        "soil_water_fit_pct": 64,
                        "terrain_fit_pct": 76,
                        "settlement_pressure_pct": 18,
                        "carbon_gain_pct": 70,
                        "habitat_recovery_gain_pct": 65,
                        "restoration_additionality_pct": 72,
                        "restoration_system_fit_pct": 74,
                        "restoration_system_code": "moist_system",
                        "mrv_readiness_pct": 81,
                        "remote_sensing_uncertainty_pct": 24,
                        "ecological_review_required": 0,
                        "land_history_review_required": 0,
                        "hard_exclusion": 0,
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[39.16, 7.07], [39.25, 7.07], [39.25, 7.16], [39.16, 7.16], [39.16, 7.07]]],
                    },
                }
            ],
        }
        path = Path("/tmp/mfmtree-low-compute-gee-test.geojson")
        path.write_text(json.dumps(gee_geojson), encoding="utf-8")

        with patch.dict(
            os.environ,
            {
                "PROCESSED_BUCKET": "",
                "PROCESSED_DATA_BUCKET": "",
                "LOCAL_GEOJSON_PATH": str(path),
                "ALLOW_MOCK_DATA": "false",
            },
            clear=False,
        ):
            response = invoke("GET /areas", "GET", "/areas")
            scenario = invoke("POST /scenario", "POST", "/scenario", {"weights": {"carbon": 0.5}})

        area_id = "ET-GRID-391600_70700"
        indicators = response["body"]["areas"][0]["indicators"]
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(response["body"]["geojson"]["features"][0]["properties"]["areaId"], area_id)
        self.assertEqual(indicators["plantableFraction"], 0.62)
        self.assertEqual(indicators["targetProjectAreaHa"], 13950)
        self.assertEqual(indicators["rainfallReliability"], "medium")
        self.assertEqual(indicators["soilSuitability"], "medium")
        self.assertEqual(indicators["monitoringFeasibility"], "high")
        self.assertEqual(indicators["restorationSystemCode"], "moist_system")
        self.assertIn(area_id, scenario["body"]["scoresByArea"])

    def test_local_indicator_file_is_joined_by_area_id(self) -> None:
        geojson_path = Path("/tmp/mfmtree-local-geometry-test.geojson")
        indicators_path = Path("/tmp/mfmtree-local-indicators-test.json")
        geojson_path.write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "properties": {"areaId": "ET-GRID-LOCAL", "name": "Local Cell"},
                            "geometry": {
                                "type": "Polygon",
                                "coordinates": [[[39.16, 7.07], [39.25, 7.07], [39.25, 7.16], [39.16, 7.16], [39.16, 7.07]]],
                            },
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        indicators_path.write_text(
            json.dumps({"areas": [{"areaId": "ET-GRID-LOCAL", "mrv_readiness_pct": 75, "valid_candidate_10y_cleared_pct": 55}]}),
            encoding="utf-8",
        )

        with patch.dict(
            os.environ,
            {
                "PROCESSED_BUCKET": "",
                "PROCESSED_DATA_BUCKET": "",
                "LOCAL_GEOJSON_PATH": str(geojson_path),
                "LOCAL_INDICATORS_PATH": str(indicators_path),
                "ALLOW_MOCK_DATA": "false",
            },
            clear=False,
        ):
            response = invoke("GET /areas", "GET", "/areas")

        indicators = response["body"]["areas"][0]["indicators"]
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(indicators["monitoringFeasibility"], "high")
        self.assertEqual(indicators["plantableFraction"], 0.55)
        self.assertEqual(response["body"]["areas"][0]["displayName"], "Local Cell")
        self.assertEqual(response["body"]["areas"][0]["name"], "Local Cell")


if __name__ == "__main__":
    unittest.main()
