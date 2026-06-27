import sys
import unittest
from pathlib import Path


API_DIR = Path(__file__).resolve().parents[1] / "services" / "api"
sys.path.insert(0, str(API_DIR))

from cost_estimator import estimate_area_cost, plan_budget  # noqa: E402


BASE_INDICATORS = {
    "areaId": "TEST-001",
    "totalAreaHa": 1000,
    "plantableFraction": 0.6,
    "distanceToRoadKm": 8,
    "meanSlopeDeg": 9,
    "rainfallReliability": "medium",
    "soilSuitability": "medium",
    "protectedAreaConcern": "low",
    "recentDeforestationRisk": "low",
    "expectedSurvivalRate": 0.72,
    "expectedTCO2ePerHa": 68,
}


class CostEstimatorTest(unittest.TestCase):
    def test_cost_estimate_returns_positive_totals(self) -> None:
        estimate = estimate_area_cost(BASE_INDICATORS)
        self.assertGreater(estimate["estimatedTotalCost"], 0)
        self.assertGreater(estimate["estimatedCostPerHa"], 0)

    def test_missing_indicators_do_not_crash(self) -> None:
        estimate = estimate_area_cost({"areaId": "MISSING"})
        self.assertEqual(estimate["estimatedPlantableHa"], 0)
        self.assertIsNone(estimate["estimatedCostPerHa"])
        self.assertTrue(estimate["costWarnings"])

    def test_higher_road_distance_increases_logistics_cost(self) -> None:
        near = estimate_area_cost({**BASE_INDICATORS, "distanceToRoadKm": 2})
        remote = estimate_area_cost({**BASE_INDICATORS, "distanceToRoadKm": 35})
        self.assertGreater(remote["estimatedLogisticsCost"], near["estimatedLogisticsCost"])

    def test_higher_slope_increases_logistics_cost(self) -> None:
        gentle = estimate_area_cost({**BASE_INDICATORS, "meanSlopeDeg": 3})
        steep = estimate_area_cost({**BASE_INDICATORS, "meanSlopeDeg": 28})
        self.assertGreater(steep["estimatedLogisticsCost"], gentle["estimatedLogisticsCost"])

    def test_lower_survival_increases_replanting_and_surviving_tree_cost(self) -> None:
        high_survival = estimate_area_cost({**BASE_INDICATORS, "expectedSurvivalRate": 0.85})
        low_survival = estimate_area_cost({**BASE_INDICATORS, "expectedSurvivalRate": 0.45})
        self.assertGreater(
            low_survival["estimatedReplantingMortalityBuffer"],
            high_survival["estimatedReplantingMortalityBuffer"],
        )
        self.assertGreater(
            low_survival["estimatedCostPerSurvivingTree"],
            high_survival["estimatedCostPerSurvivingTree"],
        )

    def test_recent_deforestation_adds_warning(self) -> None:
        estimate = estimate_area_cost({**BASE_INDICATORS, "recentDeforestationRisk": "high"})
        self.assertTrue(any("Recent forest loss signal detected" in warning for warning in estimate["costWarnings"]))

    def test_budget_planner_does_not_exceed_budget(self) -> None:
        areas = [
            {
                "areaId": "A",
                "name": "A",
                "priorityScore": 90,
                "carbonCreditReadiness": "medium",
                "riskScore": 20,
                "costIndicators": BASE_INDICATORS,
            },
            {
                "areaId": "B",
                "name": "B",
                "priorityScore": 80,
                "carbonCreditReadiness": "medium",
                "riskScore": 30,
                "costIndicators": {**BASE_INDICATORS, "areaId": "B", "distanceToRoadKm": 20},
            },
        ]
        plan = plan_budget(areas, 50000, "EUR")
        self.assertLessEqual(plan["estimatedSpend"], 50000)


if __name__ == "__main__":
    unittest.main()
