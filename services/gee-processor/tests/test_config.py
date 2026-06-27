import sys
import unittest
from pathlib import Path


SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from gee_processor.config import parse_args, validate_config  # noqa: E402


class ConfigTest(unittest.TestCase):
    def test_parse_dry_run_config(self) -> None:
        config = parse_args(
            [
                "--target-region",
                "ethiopia",
                "--output-prefix",
                "reforestation/processed",
                "--dry-run",
            ]
        )
        self.assertEqual(config.target_region, "ethiopia")
        self.assertTrue(config.dry_run)
        self.assertEqual(config.output_prefix, "reforestation/processed")

    def test_real_export_requires_bucket(self) -> None:
        config = parse_args(["--target-region", "ethiopia"])
        warnings = validate_config(config)
        self.assertTrue(any("output_bucket is required" in warning for warning in warnings))


if __name__ == "__main__":
    unittest.main()
