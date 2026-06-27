from __future__ import annotations

from dataclasses import dataclass

from .config import ProcessorConfig
from .preprocessing import (
    fraction_at_analysis_scale,
    fuzzy_range,
    mask_sentinel2_sr,
    prep_landsat_57,
    prep_landsat_89,
)


@dataclass(frozen=True)
class SourceDatasets:
    sentinel2: str = "COPERNICUS/S2_SR_HARMONIZED"
    landsat5: str = "LANDSAT/LT05/C02/T1_L2"
    landsat7: str = "LANDSAT/LE07/C02/T1_L2"
    landsat8: str = "LANDSAT/LC08/C02/T1_L2"
    landsat9: str = "LANDSAT/LC09/C02/T1_L2"
    sentinel1: str = "COPERNICUS/S1_GRD"
    worldcover: str = "ESA/WorldCover/v200"
    hansen_gfc: str = "UMD/hansen/global_forest_change_2025_v1_13"
    carbon_2010: str = "WCMC/biomass_carbon_density/v1_0/2010"
    chirps: str = "UCSB-CHC/CHIRPS/V3/DAILY_RNL"
    soil_fc_33: str = "ISRIC/SoilGrids250m/v2_0/wv0033"
    soil_wp_1500: str = "ISRIC/SoilGrids250m/v2_0/wv1500"
    srtm: str = "USGS/SRTMGL1_003"
    wdpa: str = "WCMC/WDPA/current/polygons"
    ghsl_population: str = "JRC/GHSL/P2023A/GHS_POP/2025"


def dataset_metadata() -> dict[str, str]:
    return SourceDatasets().__dict__.copy()


def sentinel2_composite(aoi, config: ProcessorConfig):
    import ee

    collection = (
        ee.ImageCollection(SourceDatasets.sentinel2)
        .filterBounds(aoi)
        .filterDate(config.start_date, config.end_date)
        .filter(ee.Filter.lte("CLOUDY_PIXEL_PERCENTAGE", 70))
        .map(mask_sentinel2_sr)
    )
    median = collection.median().clip(aoi)
    return {
        "s2_median": median,
        "ndvi_current": median.normalizedDifference(["B8", "B4"]).rename("current_ndvi"),
        "ndmi_current": median.normalizedDifference(["B8", "B11"]).rename("current_ndmi"),
    }


def landsat_ndvi_composite(aoi, start_date: str, end_date: str):
    import ee

    l5 = ee.ImageCollection(SourceDatasets.landsat5).filterBounds(aoi).filterDate(start_date, end_date).map(prep_landsat_57)
    l7 = ee.ImageCollection(SourceDatasets.landsat7).filterBounds(aoi).filterDate(start_date, end_date).map(prep_landsat_57)
    l8 = ee.ImageCollection(SourceDatasets.landsat8).filterBounds(aoi).filterDate(start_date, end_date).map(prep_landsat_89)
    l9 = ee.ImageCollection(SourceDatasets.landsat9).filterBounds(aoi).filterDate(start_date, end_date).map(prep_landsat_89)
    merged = l5.merge(l7).merge(l8).merge(l9)
    return (
        merged.map(lambda img: img.normalizedDifference(["nir", "red"]).rename("ndvi").copyProperties(img, ["system:time_start"]))
        .median()
        .clip(aoi)
    )


def historical_change(aoi, ndvi_current):
    ndvi_base = landsat_ndvi_composite(aoi, "2000-01-01", "2005-01-01").rename("landsat_ndvi_2000_2004")
    ndvi_recent = landsat_ndvi_composite(aoi, "2021-01-01", "2025-01-01").rename("landsat_ndvi_2021_2024")
    ndvi_decline = ndvi_base.subtract(ndvi_recent).unitScale(0.05, 0.35).clamp(0, 1).rename("ndvi_decline")
    low_current_vegetation = (
        ndvi_current.unitScale(0.25, 0.75).clamp(0, 1).multiply(-1).add(1).rename("low_current_vegetation")
    )
    return {
        "ndvi_base": ndvi_base,
        "ndvi_recent": ndvi_recent,
        "ndvi_decline": ndvi_decline,
        "low_current_vegetation": low_current_vegetation,
    }


def sentinel1_structure(aoi, config: ProcessorConfig):
    import ee

    s1 = (
        ee.ImageCollection(SourceDatasets.sentinel1)
        .filterBounds(aoi)
        .filterDate(config.start_date, config.end_date)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
        .select(["VV", "VH"])
        .median()
        .clip(aoi)
    )
    return s1.select("VH").unitScale(-25, -12).clamp(0, 1).rename("sentinel1_vh_structure")


def worldcover_inputs(aoi, projection):
    import ee

    worldcover_base = ee.ImageCollection(SourceDatasets.worldcover).first().select("Map")
    worldcover_projection = worldcover_base.projection()
    worldcover = worldcover_base.clip(aoi)

    tree_raw = worldcover.eq(10)
    shrub_raw = worldcover.eq(20)
    grass_raw = worldcover.eq(30)
    cropland_raw = worldcover.eq(40)
    built_raw = worldcover.eq(50)
    bare_raw = worldcover.eq(60)
    snow_ice_raw = worldcover.eq(70)
    water_raw = worldcover.eq(80)
    wetland_raw = worldcover.eq(90)
    mangrove_raw = worldcover.eq(95)
    moss_raw = worldcover.eq(100)

    restorable_raw = shrub_raw.Or(grass_raw).Or(cropland_raw).Or(bare_raw).rename("restorable_land_raw")
    water_wetland_raw = water_raw.Or(wetland_raw).Or(mangrove_raw).rename("water_wetland_mangrove_raw")
    built_up_raw = built_raw.rename("built_up_raw")

    return {
        "worldcover": worldcover,
        "tree_raw": tree_raw,
        "built_up_raw": built_up_raw,
        "snow_ice_raw": snow_ice_raw,
        "moss_raw": moss_raw,
        "restorable_raw": restorable_raw,
        "water_wetland_raw": water_wetland_raw,
        "restorable_share": fraction_at_analysis_scale(restorable_raw, "restorable_land_share", projection, worldcover_projection),
        "built_up_share": fraction_at_analysis_scale(built_up_raw, "built_up_share", projection, worldcover_projection),
        "water_wetland_share": fraction_at_analysis_scale(
            water_wetland_raw,
            "water_wetland_mangrove_share",
            projection,
            worldcover_projection,
        ),
    }


def forest_change_inputs(aoi, ndvi_current, ndvi_decline):
    import ee

    gfc = ee.Image(SourceDatasets.hansen_gfc).clip(aoi)
    tree_cover_2000 = gfc.select("treecover2000").divide(100).rename("treecover2000")
    forest_loss = gfc.select("loss").unmask(0).toFloat().rename("forest_loss_2001_2025")
    loss_year = gfc.select("lossyear").rename("forest_loss_year")
    forest_loss_recent = loss_year.gte(18).rename("forest_loss_2018_2025")
    low_current_vegetation = ndvi_current.unitScale(0.25, 0.75).clamp(0, 1).multiply(-1).add(1)
    degradation_proxy = ndvi_decline.max(forest_loss.multiply(0.8)).rename("degradation_proxy")
    return {
        "tree_cover_2000": tree_cover_2000,
        "forest_loss": forest_loss,
        "loss_year": loss_year,
        "forest_loss_recent": forest_loss_recent,
        "low_current_vegetation": low_current_vegetation.rename("low_current_vegetation"),
        "degradation_proxy": degradation_proxy,
    }


def carbon_inputs(aoi, restorable_share, low_current_vegetation):
    import ee

    carbon_2010 = ee.Image(SourceDatasets.carbon_2010).select("carbon_tonnes_per_ha").clip(aoi)
    low_existing_carbon = ee.Image(1).subtract(carbon_2010.unitScale(5, 150).clamp(0, 1)).rename("low_existing_carbon")
    carbon_proxy = restorable_share.multiply(low_existing_carbon).multiply(low_current_vegetation).rename("carbon_proxy")
    return {"carbon_2010": carbon_2010, "low_existing_carbon": low_existing_carbon, "carbon_proxy": carbon_proxy}


def rainfall_inputs(aoi, config: ProcessorConfig):
    import ee

    # Original used 2019-2025 and RAIN_YEARS=6. CLI dates are reused here for batch runs.
    years = max(1, int(config.end_date[:4]) - int(config.start_date[:4]))
    chirps = (
        ee.ImageCollection(SourceDatasets.chirps)
        .filterBounds(aoi)
        .filterDate(config.start_date, config.end_date)
        .select("precipitation")
    )
    annual_rain = chirps.sum().divide(years).rename("annual_rain_mm").clip(aoi)
    rainfall_fit = fuzzy_range(annual_rain, 300, 650, 1600, 2400).rename("rainfall_fit")
    return {"annual_rain": annual_rain, "rainfall_fit": rainfall_fit}


def soil_inputs():
    import ee

    depth_bands = ["val_0_5cm_mean", "val_5_15cm_mean", "val_15_30cm_mean"]
    field_capacity = ee.Image(SourceDatasets.soil_fc_33).select(depth_bands).reduce(ee.Reducer.mean())
    wilting_point = ee.Image(SourceDatasets.soil_wp_1500).select(depth_bands).reduce(ee.Reducer.mean())
    plant_available_water = field_capacity.subtract(wilting_point).multiply(0.001).rename("soil_pawc_0_30cm_cm3cm3")
    soil_water_fit = plant_available_water.unitScale(0.04, 0.18).clamp(0, 1).rename("soil_water_fit")
    return {"plant_available_water": plant_available_water, "soil_water_fit": soil_water_fit}


def terrain_inputs(aoi, restorable_share):
    import ee

    elevation = ee.Image(SourceDatasets.srtm).select("elevation").clip(aoi)
    slope = ee.Terrain.slope(elevation).rename("slope_deg")
    terrain_fit = ee.Image(1).subtract(slope.unitScale(8, 30).clamp(0, 1)).rename("terrain_access_fit")
    erosion_opportunity = slope.unitScale(5, 25).clamp(0, 1).multiply(restorable_share).rename("erosion_opportunity")
    return {"elevation": elevation, "slope": slope, "terrain_fit": terrain_fit, "erosion_opportunity": erosion_opportunity}


def safeguard_inputs(aoi, projection, tree_raw, tree_cover_2000):
    import ee

    wdpa = ee.FeatureCollection(SourceDatasets.wdpa).filterBounds(aoi)
    protected_area_mask = ee.Image(0).byte().paint(wdpa, 1).clip(aoi).rename("protected_area_raw")
    protected_area_share = fraction_at_analysis_scale(protected_area_mask, "protected_area_share", projection)
    protected_for_focal = protected_area_share.gt(0.01).unmask(0).toFloat().reproject(crs=projection)
    near_protected_area = protected_for_focal.focal_max(radius=5000, units="meters").rename("near_protected_area")

    existing_tree_mask = tree_raw.Or(tree_cover_2000.gt(0.30)).rename("existing_tree_cover_raw")
    existing_tree_share = fraction_at_analysis_scale(existing_tree_mask, "existing_tree_cover_share", projection)
    existing_tree_for_focal = existing_tree_share.gt(0.05).unmask(0).toFloat().reproject(crs=projection)
    near_existing_tree_cover = existing_tree_for_focal.focal_max(radius=3000, units="meters").rename("near_existing_tree_cover")

    return {
        "protected_area_share": protected_area_share,
        "near_protected_area": near_protected_area,
        "existing_tree_share": existing_tree_share,
        "near_existing_tree_cover": near_existing_tree_cover,
    }


def population_inputs(aoi):
    import ee

    pop_2025 = ee.Image(SourceDatasets.ghsl_population).select("population_count").unmask(0).clip(aoi)
    pop_local_mean_5km = pop_2025.focal_mean(radius=5000, units="meters").rename("population_local_mean_5km")
    settlement_pressure = pop_2025.focal_mean(radius=1000, units="meters").unitScale(10, 50).clamp(0, 1).rename(
        "settlement_pressure_1km"
    )
    community_access = pop_local_mean_5km.unitScale(0.02, 5).clamp(0, 1).rename("community_access")
    livelihood_proxy = community_access.multiply(ee.Image(1).subtract(settlement_pressure.multiply(0.6))).clamp(0, 1).rename(
        "livelihood_proxy"
    )
    return {
        "pop_2025": pop_2025,
        "pop_local_mean_5km": pop_local_mean_5km,
        "settlement_pressure": settlement_pressure,
        "community_access": community_access,
        "livelihood_proxy": livelihood_proxy,
    }
