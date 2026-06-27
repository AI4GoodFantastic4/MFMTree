import sys
import unittest
from pathlib import Path


API_DIR = Path(__file__).resolve().parents[1] / "services" / "api"
sys.path.insert(0, str(API_DIR))

from scoring_engine import apply_scores, score_areas  # noqa: E402


BASE_AREA = {
    "areaId": "ET-TST",
    "name": "Test Area",
    "region": "Test Region",
    "indicators": {
        "totalAreaHa": 1000,
        "plantableFraction": 0.7,
        "distanceToRoadKm": 8,
        "meanSlopeDeg": 9,
        "rainfallReliability": "medium",
        "soilSuitability": "medium",
        "protectedAreaConcern": "low",
        "recentDeforestationRisk": "low",
        "expectedSurvivalRate": 0.72,
        "expectedTCO2ePerHa": 68,
        "populationNearby": 12000,
    },
}


class ScoringEngineTest(unittest.TestCase):
    def test_scores_are_calculated_from_indicators(self) -> None:
        scored = apply_scores(BASE_AREA)
        self.assertEqual(scored["areaId"], "ET-TST")
        self.assertGreater(scored["priorityScore"], 0)
        self.assertIn(scored["carbonCreditReadiness"], {"low", "medium", "high"})

    def test_score_map_is_keyed_by_area_id(self) -> None:
        scores = score_areas([BASE_AREA])
        self.assertIn("ET-TST", scores)
        self.assertEqual(scores["ET-TST"]["areaId"], "ET-TST")

    def test_scenario_weights_change_dynamic_priority(self) -> None:
        carbon_rich_remote = {
            **BASE_AREA,
            "areaId": "CARBON",
            "indicators": {
                **BASE_AREA["indicators"],
                "expectedTCO2ePerHa": 95,
                "distanceToRoadKm": 35,
                "meanSlopeDeg": 18,
            },
        }
        cheap_accessible = {
            **BASE_AREA,
            "areaId": "CHEAP",
            "indicators": {
                **BASE_AREA["indicators"],
                "expectedTCO2ePerHa": 45,
                "distanceToRoadKm": 2,
                "meanSlopeDeg": 3,
            },
        }

        carbon_weighted = score_areas([carbon_rich_remote, cheap_accessible], {"carbon": 0.8, "costEfficiency": 0.05})
        cost_weighted = score_areas([carbon_rich_remote, cheap_accessible], {"carbon": 0.05, "costEfficiency": 0.8})

        self.assertGreater(carbon_weighted["CARBON"]["priorityScore"], carbon_weighted["CHEAP"]["priorityScore"])
        self.assertGreater(cost_weighted["CHEAP"]["priorityScore"], cost_weighted["CARBON"]["priorityScore"])

    def test_recent_deforestation_reduces_readiness(self) -> None:
        scored = apply_scores(
            {
                **BASE_AREA,
                "indicators": {
                    **BASE_AREA["indicators"],
                    "recentDeforestationRisk": "high",
                },
            }
        )
        self.assertEqual(scored["carbonCreditReadiness"], "low")
        self.assertIn("recent forest loss signal", scored["riskFlags"])


if __name__ == "__main__":
    unittest.main()
