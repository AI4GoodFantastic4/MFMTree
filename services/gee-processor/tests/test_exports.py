import sys
import unittest
from pathlib import Path


SRC = Path(__file__).resolve().parents[1] / "src"
sys.path.insert(0, str(SRC))

from gee_processor.config import parse_args  # noqa: E402
from gee_processor.exports import build_run_metadata, dry_run_export_plan  # noqa: E402


class ExportMetadataTest(unittest.TestCase):
    def test_dry_run_metadata_contains_outputs(self) -> None:
        config = parse_args(["--target-region", "ethiopia", "--output-bucket", "bucket", "--dry-run"])
        plan = dry_run_export_plan(config)
        metadata = build_run_metadata(config, {"sentinel2": "COPERNICUS/S2"}, {"targetRegion": "ethiopia"}, plan)
        self.assertEqual(len(metadata["exports"]), 4)
        self.assertEqual(metadata["exports"][0]["taskId"], None)
        self.assertIn("futureBridgeTodo", metadata)


if __name__ == "__main__":
    unittest.main()
