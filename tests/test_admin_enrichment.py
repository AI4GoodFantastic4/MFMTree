import importlib.util
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT_DIR / "scripts" / "enrich_admin_boundaries.py"
spec = importlib.util.spec_from_file_location("enrich_admin_boundaries", SCRIPT_PATH)
enricher = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(enricher)


class AdminEnrichmentTest(unittest.TestCase):
    def test_area_centroid_is_joined_to_admin3_boundary(self) -> None:
        areas = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "areaId": "ET-GRID-1",
                        "grid_id": 1,
                        "technicalName": "Grid cell 1",
                        "candidateLabel": "Candidate Area 01",
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[39.1, 7.1], [39.2, 7.1], [39.2, 7.2], [39.1, 7.2], [39.1, 7.1]]],
                    },
                }
            ],
        }
        admin = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "NAME_1": "Oromia",
                        "NAME_2": "Bale",
                        "NAME_3": "Goba",
                        "CCA_3": "ET010101",
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[[39.0, 7.0], [39.3, 7.0], [39.3, 7.3], [39.0, 7.3], [39.0, 7.0]]],
                    },
                }
            ],
        }

        enriched, matched, unmatched = enricher.enrich_areas(areas, admin)
        props = enriched["features"][0]["properties"]

        self.assertEqual(matched, 1)
        self.assertEqual(unmatched, 0)
        self.assertEqual(props["regionName"], "Oromia")
        self.assertEqual(props["zoneName"], "Bale")
        self.assertEqual(props["woredaName"], "Goba")
        self.assertEqual(props["technicalName"], "Grid cell 1")
        self.assertEqual(props["displayName"], "Oromia · Bale · Candidate Area 01")
        self.assertEqual(props["name"], props["displayName"])
        self.assertEqual(props["adminLevel"], "admin3")


if __name__ == "__main__":
    unittest.main()
