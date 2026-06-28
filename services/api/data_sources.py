import json
import os
from typing import Any


DEFAULT_DATA_SOURCES_KEY = "metadata/data_sources.json"
SCHEMA_VERSION = "0.2.0"
GEE_REFERENCE_SCRIPT = "services/gee-processor/references/restoreai_gee_data_only_message.js"

GEE_SCRIPT_SECTIONS: dict[str, str] = {
    "aoi_ocha_hdx_admin": "2. AOI",
    "aoi_fao_gaul_fallback": "2. AOI",
    "sentinel2_surface_reflectance": "4. SENTINEL-2 CURRENT VEGETATION",
    "landsat5_collection2_l2": "5. LANDSAT NDVI CHANGE",
    "landsat7_collection2_l2": "5. LANDSAT NDVI CHANGE",
    "landsat8_collection2_l2": "5. LANDSAT NDVI CHANGE",
    "landsat9_collection2_l2": "5. LANDSAT NDVI CHANGE",
    "sentinel1_grd": "6. SENTINEL-1 SAR",
    "esa_worldcover": "7. ESA WORLDCOVER / 9. EMPTY NO-PLANT MASK",
    "hansen_global_forest_change": "8. HANSEN FOREST CHANGE",
    "biomass_carbon_density_2010": "10. CARBON",
    "chirps_daily_rainfall": "11. RAINFALL",
    "soilgrids_field_capacity": "12. SOILS",
    "soilgrids_wilting_point": "12. SOILS",
    "srtm_dem": "13. TERRAIN",
    "wdpa_protected_areas": "14. WDPA + POPULATION",
    "ghsl_population_2025": "14. WDPA + POPULATION",
    "cifor_icraf_species_suitability": "16. PLANT / RESTORATION OPTIONS",
}

INDICATOR_FIELDS_BY_SOURCE: dict[str, list[str]] = {
    "sentinel2_surface_reflectance": ["current_ndvi", "current_ndmi", "low_current_vegetation"],
    "landsat5_collection2_l2": ["landsat_ndvi_2000_2004", "ndvi_decline_proxy"],
    "landsat7_collection2_l2": ["landsat_ndvi_2000_2004", "ndvi_decline_proxy"],
    "landsat8_collection2_l2": ["landsat_ndvi_2021_2024", "ndvi_decline_proxy"],
    "landsat9_collection2_l2": ["landsat_ndvi_2021_2024", "ndvi_decline_proxy"],
    "sentinel1_grd": ["sentinel1_vh_structure_proxy"],
    "esa_worldcover": [
        "restorable_land_share",
        "built_up_share",
        "water_wetland_mangrove_share",
        "existing_tree_cover_share",
        "no_plant_empty_land_share",
        "valid_restoration_land",
    ],
    "hansen_global_forest_change": ["treecover2000", "forest_loss_2001_2025", "degradation_proxy"],
    "biomass_carbon_density_2010": ["carbon_tonnes_per_ha_2010", "carbon_proxy"],
    "chirps_daily_rainfall": ["annual_rain_mm", "rainfall_fit"],
    "soilgrids_field_capacity": ["soil_water_33kpa_0_30cm_raw", "soil_pawc_0_30cm_cm3cm3", "soil_water_fit"],
    "soilgrids_wilting_point": ["soil_water_1500kpa_0_30cm_raw", "soil_pawc_0_30cm_cm3cm3", "soil_water_fit"],
    "srtm_dem": ["elevation_m", "slope_deg", "terrain_access_fit"],
    "wdpa_protected_areas": ["protected_area_share", "near_protected_area"],
    "ghsl_population_2025": ["population_local_mean_5km", "settlement_pressure_1km_pct", "community_access", "livelihood_proxy"],
    "cifor_icraf_species_suitability": ["plant_fit", "selected_species_profile"],
}

PIPELINE_OUTPUTS = {
    "geometry": "geometry/areas.geojson",
    "indicators": "indicators/latest.json",
    "scores": "scores/default_scores.json",
    "metadata": DEFAULT_DATA_SOURCES_KEY,
}


DEFAULT_DATA_SOURCES: list[dict[str, Any]] = [
    {
        "sourceId": "aoi_ocha_hdx_admin",
        "name": "HDX/OCHA Ethiopia Admin Boundaries",
        "provider": "HDX/OCHA",
        "geeAssetId": "users/YOUR_USERNAME/eth_adm1_ocha_hdx",
        "s3Key": "sources/admin/ethiopia_admin_boundaries.geojson",
        "publishedS3Key": "sources/admin/ethiopia_admin3.geojson",
        "category": "administrative_boundaries",
        "status": "integrated",
        "usedFor": ["area geometry", "aggregation by woreda/zone/region", "displayName, regionName, zoneName, woredaName enrichment"],
        "notes": "Admin 3 boundaries are joined after the GEE export by scripts/enrich_admin_boundaries.py. The default source is the public ICPAC GeoServer; audited HDX/OCHA COD-AB runs can pass ADMIN_BOUNDARIES_PATH.",
    },
    {
        "sourceId": "aoi_fao_gaul_fallback",
        "name": "FAO GAUL Ethiopia Admin 0 Fallback",
        "provider": "FAO GAUL",
        "geeAssetId": "FAO/GAUL/2015/level0",
        "category": "administrative_boundaries",
        "status": "gee_available",
        "usedFor": ["Ethiopia AOI fallback"],
    },
    {
        "sourceId": "sentinel2_surface_reflectance",
        "name": "Sentinel-2 Surface Reflectance Harmonized",
        "provider": "Copernicus",
        "geeAssetId": "COPERNICUS/S2_SR_HARMONIZED",
        "category": "satellite_optical",
        "status": "gee_available",
        "usedFor": ["current NDVI", "current NDMI", "vegetation condition", "moisture proxy"],
    },
    {
        "sourceId": "landsat5_collection2_l2",
        "name": "Landsat 5 Collection 2 Level 2",
        "provider": "USGS/NASA",
        "geeAssetId": "LANDSAT/LT05/C02/T1_L2",
        "category": "satellite_optical",
        "status": "gee_available",
        "usedFor": ["historical NDVI baseline", "vegetation trend"],
    },
    {
        "sourceId": "landsat7_collection2_l2",
        "name": "Landsat 7 Collection 2 Level 2",
        "provider": "USGS/NASA",
        "geeAssetId": "LANDSAT/LE07/C02/T1_L2",
        "category": "satellite_optical",
        "status": "gee_available",
        "usedFor": ["historical NDVI baseline", "vegetation trend"],
    },
    {
        "sourceId": "landsat8_collection2_l2",
        "name": "Landsat 8 Collection 2 Level 2",
        "provider": "USGS/NASA",
        "geeAssetId": "LANDSAT/LC08/C02/T1_L2",
        "category": "satellite_optical",
        "status": "gee_available",
        "usedFor": ["recent NDVI", "vegetation trend"],
    },
    {
        "sourceId": "landsat9_collection2_l2",
        "name": "Landsat 9 Collection 2 Level 2",
        "provider": "USGS/NASA",
        "geeAssetId": "LANDSAT/LC09/C02/T1_L2",
        "category": "satellite_optical",
        "status": "gee_available",
        "usedFor": ["recent NDVI", "vegetation trend"],
    },
    {
        "sourceId": "sentinel1_grd",
        "name": "Sentinel-1 GRD",
        "provider": "Copernicus",
        "geeAssetId": "COPERNICUS/S1_GRD",
        "category": "satellite_radar",
        "status": "gee_available",
        "usedFor": ["vegetation structure proxy", "cloud-independent radar signal"],
    },
    {
        "sourceId": "esa_worldcover",
        "name": "ESA WorldCover 10 m",
        "provider": "ESA",
        "geeAssetId": "ESA/WorldCover/v200",
        "category": "land_cover",
        "status": "gee_available",
        "usedFor": ["plantable/restorable land fraction", "built-up share", "water/wetland exclusion", "existing tree cover proxy"],
    },
    {
        "sourceId": "hansen_global_forest_change",
        "name": "Hansen Global Forest Change",
        "provider": "UMD/Google/USGS/NASA",
        "geeAssetId": "UMD/hansen/global_forest_change_2025_v1_13",
        "category": "forest_change",
        "status": "gee_available",
        "usedFor": ["tree cover 2000", "forest loss", "recent deforestation risk", "carbon-credit integrity warning"],
    },
    {
        "sourceId": "biomass_carbon_density_2010",
        "name": "Biomass Carbon Density 2010",
        "provider": "WCMC",
        "geeAssetId": "WCMC/biomass_carbon_density/v1_0/2010",
        "category": "carbon",
        "status": "gee_available",
        "usedFor": ["existing carbon proxy", "carbon opportunity proxy"],
    },
    {
        "sourceId": "chirps_daily_rainfall",
        "name": "CHIRPS Daily Rainfall",
        "provider": "UCSB CHC",
        "geeAssetId": "UCSB-CHC/CHIRPS/V3/DAILY_RNL",
        "category": "climate",
        "status": "gee_available",
        "usedFor": ["annual rainfall", "rainfall reliability", "survival probability", "maintenance multiplier"],
    },
    {
        "sourceId": "soilgrids_field_capacity",
        "name": "SoilGrids Field Capacity",
        "provider": "ISRIC SoilGrids",
        "geeAssetId": "ISRIC/SoilGrids250m/v2_0/wv0033",
        "category": "soil",
        "status": "gee_available",
        "usedFor": ["soil water availability", "soil suitability proxy"],
    },
    {
        "sourceId": "soilgrids_wilting_point",
        "name": "SoilGrids Wilting Point",
        "provider": "ISRIC SoilGrids",
        "geeAssetId": "ISRIC/SoilGrids250m/v2_0/wv1500",
        "category": "soil",
        "status": "gee_available",
        "usedFor": ["plant available water capacity", "soil suitability proxy"],
    },
    {
        "sourceId": "srtm_dem",
        "name": "SRTM DEM",
        "provider": "USGS/NASA",
        "geeAssetId": "USGS/SRTMGL1_003",
        "category": "terrain",
        "status": "gee_available",
        "usedFor": ["elevation", "slope", "terrain difficulty", "erosion opportunity", "logistics multiplier"],
    },
    {
        "sourceId": "wdpa_protected_areas",
        "name": "World Database on Protected Areas",
        "provider": "WCMC/IUCN",
        "geeAssetId": "WCMC/WDPA/current/polygons",
        "category": "safeguards",
        "status": "gee_available",
        "usedFor": ["protected-area overlap", "legal/safeguard review flag", "biodiversity proximity proxy"],
    },
    {
        "sourceId": "ghsl_population_2025",
        "name": "GHSL Population 2025",
        "provider": "JRC GHSL",
        "geeAssetId": "JRC/GHSL/P2023A/GHS_POP/2025",
        "category": "population",
        "status": "gee_available",
        "usedFor": ["nearby communities", "settlement pressure", "livelihood proxy", "monitoring/access proxy"],
    },
    {
        "sourceId": "cifor_icraf_species_suitability",
        "name": "CIFOR-ICRAF / MEFCC-WRI Species Suitability",
        "provider": "CIFOR-ICRAF / MEFCC-WRI",
        "s3Key": "sources/species/cifor_icraf_species_suitability.tif",
        "category": "species_suitability",
        "status": "planned_external",
        "usedFor": ["tree species suitability", "survival confidence", "field validation questions"],
        "notes": "The original script used rule-based species profiles and explicitly marked this as a future replacement dataset.",
    },
]


def load_data_sources() -> tuple[list[dict[str, Any]], str]:
    bucket = os.environ.get("PROCESSED_BUCKET") or os.environ.get("PROCESSED_DATA_BUCKET")
    key = os.environ.get("DATA_SOURCES_KEY", DEFAULT_DATA_SOURCES_KEY)
    if bucket:
        data = _read_s3_json(bucket, key)
        sources = _normalize_sources(data)
        if sources:
            print(json.dumps({"level": "info", "event": "data_sources_source", "source": "s3", "key": key, "count": len(sources)}))
            return _decorate_sources(sources), "s3"
    sources = _decorate_sources(DEFAULT_DATA_SOURCES)
    print(json.dumps({"level": "info", "event": "data_sources_source", "source": "default", "count": len(sources)}))
    return sources, "default"


def get_data_source(source_id: str) -> dict[str, Any] | None:
    sources, _ = load_data_sources()
    return next((source for source in sources if source.get("sourceId") == source_id), None)


def _read_s3_json(bucket: str, key: str) -> Any | None:
    try:
        import boto3

        response = boto3.client("s3").get_object(Bucket=bucket, Key=key)
        return json.loads(response["Body"].read().decode("utf-8"))
    except Exception as exc:
        print(json.dumps({"level": "warning", "event": "data_sources_s3_read_failed", "bucket": bucket, "key": key, "error": str(exc)}))
        return None


def _normalize_sources(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, dict):
        raw_sources = payload.get("dataSources") or payload.get("sources") or []
    else:
        raw_sources = payload
    if not isinstance(raw_sources, list):
        return []
    return [source for source in raw_sources if isinstance(source, dict) and source.get("sourceId") and source.get("name")]


def _decorate_sources(sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_decorate_source(source) for source in sources]


def _decorate_source(source: dict[str, Any]) -> dict[str, Any]:
    source_id = str(source.get("sourceId", ""))
    decorated = dict(source)
    decorated.setdefault("schemaVersion", SCHEMA_VERSION)
    decorated.setdefault("geeScriptReference", GEE_REFERENCE_SCRIPT)
    decorated.setdefault("scriptSection", GEE_SCRIPT_SECTIONS.get(source_id, "not mapped"))
    decorated.setdefault("s3Prefix", _default_s3_prefix(source_id))
    decorated.setdefault("indicatorFields", INDICATOR_FIELDS_BY_SOURCE.get(source_id, []))
    decorated.setdefault("pipelineOutputs", PIPELINE_OUTPUTS)
    decorated.setdefault("decisionRole", "evidence_indicator")
    decorated.setdefault(
        "flow",
        "GEE or external source -> area indicators/geometry in S3 -> backend deterministic scoring -> frontend areaId join",
    )
    return decorated


def _default_s3_prefix(source_id: str) -> str:
    if source_id.startswith("aoi_"):
        return "sources/admin/"
    if source_id == "cifor_icraf_species_suitability":
        return "sources/species/"
    return f"sources/gee/{source_id}/"
