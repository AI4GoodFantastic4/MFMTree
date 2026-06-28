import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT_DIR / "scripts" / "normalize_gee_output.py"
spec = importlib.util.spec_from_file_location("normalize_gee_output", SCRIPT_PATH)
normalizer = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(normalizer)


class NormalizeGeeOutputTest(unittest.TestCase):
    def test_normalizer_splits_geometry_and_indicators(self) -> None:
        raw = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "grid_id": "391600_70700",
                        "area_ha": 22500,
                        "valid_candidate_10y_cleared_pct": 62,
                        "valid_candidate_10y_cleared_area_ha": 13950,
                        "rainfall_fit_pct": 58,
                        "soil_water_fit_pct": 64,
                        "mrv_readiness_pct": 81,
                        "restoration_system_code": "moist_system",
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[39.16, 7.07], [39.25, 7.07], [39.25, 7.16], [39.16, 7.16], [39.16, 7.07]]],
                    },
                }
            ],
        }

        geometry, indicators, final_gis = normalizer.normalize_feature_collection(raw)
        normalizer.validate_outputs(geometry, indicators)

        self.assertEqual(geometry["features"][0]["properties"]["areaId"], "ET-GRID-391600_70700")
        self.assertNotIn("priorityScore", geometry["features"][0]["properties"])
        self.assertEqual(indicators[0]["areaId"], "ET-GRID-391600_70700")
        self.assertEqual(indicators[0]["plantableFraction"], 0.62)
        self.assertEqual(indicators[0]["monitoringFeasibility"], "high")
        self.assertEqual(indicators[0]["restorationSystemCode"], "moist_system")
        final_props = final_gis["features"][0]["properties"]
        self.assertEqual(final_props["plantableFraction"], 0.62)
        self.assertEqual(final_props["mrv_readiness_pct"], 81)
        self.assertNotIn("priorityScore", final_props)

    def test_cli_writes_expected_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            raw_path = tmp_path / "raw.geojson"
            geometry_path = tmp_path / "areas.geojson"
            indicators_path = tmp_path / "area_indicators.json"
            full_gis_path = tmp_path / "final_gis_data.geojson"
            raw_path.write_text(
                json.dumps(
                    {
                        "type": "FeatureCollection",
                        "features": [
                            {
                                "type": "Feature",
                                "properties": {
                                    "grid_id": 123,
                                    "area_ha": 1000,
                                    "valid_candidate_10y_cleared_pct": 50,
                                },
                                "geometry": {
                                    "type": "Polygon",
                                    "coordinates": [[[38, 8], [38.1, 8], [38.1, 8.1], [38, 8.1], [38, 8]]],
                                },
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT_PATH),
                    "--input",
                    str(raw_path),
                    "--geometry-output",
                    str(geometry_path),
                    "--indicators-output",
                    str(indicators_path),
                    "--full-gis-output",
                    str(full_gis_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(geometry_path.read_text(encoding="utf-8"))["type"], "FeatureCollection")
            self.assertIn("areas", json.loads(indicators_path.read_text(encoding="utf-8")))
            self.assertEqual(json.loads(full_gis_path.read_text(encoding="utf-8"))["type"], "FeatureCollection")


if __name__ == "__main__":
    unittest.main()
