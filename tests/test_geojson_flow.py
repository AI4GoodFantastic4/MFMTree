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


def invoke(route_key: str, method: str, path: str, body: dict | None = None) -> dict:
    response = lambda_handler(
        {
            "routeKey": route_key,
            "rawPath": path,
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


if __name__ == "__main__":
    unittest.main()
