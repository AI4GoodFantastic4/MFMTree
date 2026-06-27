from __future__ import annotations

from .config import ProcessorConfig


TARGET_ADM1_NAMES = [
    "South Ethiopia",
    "South West Ethiopia Peoples",
    "South West Ethiopia Peoples'",
    "Southwest Ethiopia Peoples",
    "Southwest Ethiopia Peoples'",
    "South West Ethiopia People's Region",
    "Southwest Ethiopia People's Region",
]


def load_aoi(config: ProcessorConfig):
    import ee

    if config.aoi_asset:
        aoi_fc = ee.FeatureCollection(config.aoi_asset)
        return aoi_fc, aoi_fc.geometry().dissolve(100)

    # Original Code Editor fallback: FAO GAUL Ethiopia Admin 0.
    ethiopia = ee.FeatureCollection("FAO/GAUL/2015/level0").filter(ee.Filter.eq("ADM0_NAME", "Ethiopia"))
    return ethiopia, ethiopia.geometry().dissolve(100)


def aoi_metadata(config: ProcessorConfig) -> dict[str, str | None]:
    return {
        "targetRegion": config.target_region,
        "aoiAsset": config.aoi_asset,
        "fallback": None if config.aoi_asset else "FAO/GAUL/2015/level0 Ethiopia",
    }
