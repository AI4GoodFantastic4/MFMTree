import json
import os
from typing import Any


DEFAULT_DATA_SOURCES_KEY = "metadata/data_sources.json"


DEFAULT_DATA_SOURCES: list[dict[str, Any]] = [
    {
        "sourceId": "aoi_ocha_hdx_admin",
        "name": "HDX/OCHA Ethiopia Admin Boundaries",
        "provider": "HDX/OCHA",
        "geeAssetId": "users/YOUR_USERNAME/eth_adm1_ocha_hdx",
        "s3Key": "sources/admin/ethiopia_admin_boundaries.geojson",
        "category": "administrative_boundaries",
        "status": "placeholder_external",
        "usedFor": ["area geometry", "aggregation by woreda/zone/region"],
        "notes": "Original Code Editor script expected this as a user-provided GEE asset. Replace with the actual uploaded asset or S3 source key.",
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
            return sources, "s3"
    print(json.dumps({"level": "info", "event": "data_sources_source", "source": "default", "count": len(DEFAULT_DATA_SOURCES)}))
    return DEFAULT_DATA_SOURCES, "default"


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
