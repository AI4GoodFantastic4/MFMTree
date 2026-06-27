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


def invoke(route_key: str, method: str, path: str, body: dict | None = None, path_parameters: dict | None = None) -> dict:
    response = lambda_handler(
        {
            "routeKey": route_key,
            "rawPath": path,
            "requestContext": {"http": {"method": method}},
            "pathParameters": path_parameters or {},
            "body": json.dumps(body or {}),
        },
        None,
    )
    return {"statusCode": response["statusCode"], "body": json.loads(response["body"])}


class AISummaryFlowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.env = {
            "PROCESSED_BUCKET": "",
            "PROCESSED_DATA_BUCKET": "",
            "LOCAL_GEOJSON_PATH": str(SAMPLE_GEOJSON),
            "ALLOW_MOCK_DATA": "true",
            "BEDROCK_ENABLED": "false",
        }

    def test_area_explanation_returns_structured_fallback(self) -> None:
        with patch.dict(os.environ, self.env, clear=False):
            response = invoke(
                "POST /areas/{areaId}/explain",
                "POST",
                "/areas/ET-001/explain",
                path_parameters={"areaId": "ET-001"},
            )

        self.assertEqual(response["statusCode"], 200)
        body = response["body"]
        self.assertEqual(body["areaId"], "ET-001")
        self.assertTrue(body["summary"])
        self.assertEqual(body["summary"], body["explanation"])
        self.assertTrue(body["recommendation"])
        self.assertIsInstance(body["evidenceBullets"], list)
        self.assertIsInstance(body["risks"], list)
        self.assertIn("onsite expert validation", body["caveat"])
        self.assertIn("estimatedTotalCost", body["costEstimate"])

    def test_compare_areas_returns_narrative_and_structured_fields(self) -> None:
        with patch.dict(os.environ, self.env, clear=False):
            response = invoke("POST /compare-areas", "POST", "/compare-areas", {"areaIds": ["ET-001", "ET-002"]})

        self.assertEqual(response["statusCode"], 200)
        body = response["body"]
        self.assertIn(body["recommendedAreaId"], {"ET-001", "ET-002"})
        self.assertTrue(body["summary"])
        self.assertEqual(body["summary"], body["narrativeSummary"])
        self.assertIsInstance(body["comparisonBullets"], list)
        self.assertIsInstance(body["riskWarnings"], list)
        self.assertIsInstance(body["fieldValidationQuestions"], list)
        self.assertIn("onsite expert validation", body["caveat"])
        self.assertIn("costEstimatesByArea", body)


if __name__ == "__main__":
    unittest.main()
