import sys
import unittest
from pathlib import Path


SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from gee_processor.scoring import ScoreComponents, recommendation_text, roi_class, score_category, weighted_priority_score  # noqa: E402


class ScoringTest(unittest.TestCase):
    def test_weighted_priority_score_is_deterministic(self) -> None:
        score = weighted_priority_score(
            ScoreComponents(
                carbon_potential=0.8,
                tree_survival_ecological_suitability=0.7,
                cost_efficiency_accessibility=0.6,
                carbon_credit_readiness=0.5,
                livelihood_benefit=0.9,
                biodiversity_cobenefit=0.7,
                risk_penalty=0.2,
            )
        )
        self.assertEqual(score, 56.0)

    def test_score_category_thresholds(self) -> None:
        self.assertEqual(roi_class(72), "Green")
        self.assertEqual(roi_class(50), "Yellow")
        self.assertEqual(roi_class(20), "Red")
        self.assertIn("High priority", score_category(80))

    def test_recommendation_respects_candidate_flag(self) -> None:
        self.assertIn("Not recommended", recommendation_text(90, False))


if __name__ == "__main__":
    unittest.main()
