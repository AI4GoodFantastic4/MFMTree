import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch


API_DIR = Path(__file__).resolve().parents[1] / "services" / "api"
sys.path.insert(0, str(API_DIR))

from app import lambda_handler  # noqa: E402
from data_sources import DEFAULT_DATA_SOURCES  # noqa: E402


class DataSourcesTest(unittest.TestCase):
    def test_default_catalog_includes_script_datasets(self) -> None:
        ids = {source["sourceId"] for source in DEFAULT_DATA_SOURCES}
        expected = {
            "aoi_ocha_hdx_admin",
            "aoi_fao_gaul_fallback",
            "sentinel2_surface_reflectance",
            "landsat5_collection2_l2",
            "landsat7_collection2_l2",
            "landsat8_collection2_l2",
            "landsat9_collection2_l2",
            "sentinel1_grd",
            "esa_worldcover",
            "hansen_global_forest_change",
            "biomass_carbon_density_2010",
            "chirps_daily_rainfall",
            "soilgrids_field_capacity",
            "soilgrids_wilting_point",
            "srtm_dem",
            "wdpa_protected_areas",
            "ghsl_population_2025",
            "cifor_icraf_species_suitability",
        }
        self.assertTrue(expected.issubset(ids))

    def test_get_data_sources_endpoint_returns_catalog(self) -> None:
        with patch.dict(os.environ, {"PROCESSED_BUCKET": "", "PROCESSED_DATA_BUCKET": ""}, clear=False):
            response = lambda_handler(
                {
                    "routeKey": "GET /data-sources",
                    "rawPath": "/data-sources",
                    "requestContext": {"http": {"method": "GET"}},
                    "body": "{}",
                },
                None,
            )
        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertGreaterEqual(len(body["dataSources"]), 18)
        self.assertEqual(body["source"], "default")

    def test_get_one_data_source_endpoint(self) -> None:
        with patch.dict(os.environ, {"PROCESSED_BUCKET": "", "PROCESSED_DATA_BUCKET": ""}, clear=False):
            response = lambda_handler(
                {
                    "routeKey": "GET /data-sources/{sourceId}",
                    "rawPath": "/data-sources/sentinel2_surface_reflectance",
                    "requestContext": {"http": {"method": "GET"}},
                    "pathParameters": {"sourceId": "sentinel2_surface_reflectance"},
                    "body": "{}",
                },
                None,
            )
        body = json.loads(response["body"])
        self.assertEqual(response["statusCode"], 200)
        self.assertEqual(body["geeAssetId"], "COPERNICUS/S2_SR_HARMONIZED")


if __name__ == "__main__":
    unittest.main()
