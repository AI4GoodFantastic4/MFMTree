from __future__ import annotations

from .config import ProcessorConfig
from .datasets import (
    carbon_inputs,
    forest_change_inputs,
    historical_change,
    population_inputs,
    rainfall_inputs,
    safeguard_inputs,
    sentinel1_structure,
    sentinel2_composite,
    soil_inputs,
    terrain_inputs,
    worldcover_inputs,
)
from .preprocessing import analysis_projection, fraction_at_analysis_scale, fuzzy_range


PLANT_PROFILES = [
    {
        "name": "Dryland native mix - Acacia / Faidherbia",
        "rainMin": 300,
        "rainOptMin": 450,
        "rainOptMax": 900,
        "rainMax": 1250,
        "elevMin": 300,
        "elevOptMin": 700,
        "elevOptMax": 1700,
        "elevMax": 2300,
        "slopeMax": 25,
        "moistureBonus": False,
    },
    {
        "name": "Highland native mix - Juniperus / Olea",
        "rainMin": 650,
        "rainOptMin": 800,
        "rainOptMax": 1500,
        "rainMax": 2200,
        "elevMin": 1400,
        "elevOptMin": 1800,
        "elevOptMax": 3000,
        "elevMax": 3400,
        "slopeMax": 30,
        "moistureBonus": False,
    },
    {
        "name": "Moist highland mix - Cordia / Croton",
        "rainMin": 800,
        "rainOptMin": 1000,
        "rainOptMax": 1800,
        "rainMax": 2400,
        "elevMin": 900,
        "elevOptMin": 1200,
        "elevOptMax": 2400,
        "elevMax": 3000,
        "slopeMax": 25,
        "moistureBonus": True,
    },
    {
        "name": "Agroforestry / farmer livelihood mix",
        "rainMin": 500,
        "rainOptMin": 700,
        "rainOptMax": 1500,
        "rainMax": 2200,
        "elevMin": 500,
        "elevOptMin": 900,
        "elevOptMax": 2400,
        "elevMax": 3200,
        "slopeMax": 20,
        "moistureBonus": False,
    },
    {
        "name": "Riparian / water-holding restoration mix",
        "rainMin": 600,
        "rainOptMin": 800,
        "rainOptMax": 2000,
        "rainMax": 2600,
        "elevMin": 300,
        "elevOptMin": 700,
        "elevOptMax": 2500,
        "elevMax": 3400,
        "slopeMax": 18,
        "moistureBonus": True,
    },
    {
        "name": "Erosion-control shrub/grass assisted regeneration",
        "rainMin": 300,
        "rainOptMin": 500,
        "rainOptMax": 1300,
        "rainMax": 2100,
        "elevMin": 300,
        "elevOptMin": 700,
        "elevOptMax": 2800,
        "elevMax": 3600,
        "slopeMax": 35,
        "moistureBonus": False,
    },
]


def plant_suitability(profile: dict, annual_rain, elevation, slope, ndmi_fit, aoi):
    import ee

    rain_score = fuzzy_range(annual_rain, profile["rainMin"], profile["rainOptMin"], profile["rainOptMax"], profile["rainMax"])
    elev_score = fuzzy_range(elevation, profile["elevMin"], profile["elevOptMin"], profile["elevOptMax"], profile["elevMax"])
    slope_score = ee.Image(1).subtract(slope.unitScale(profile["slopeMax"] - 8, profile["slopeMax"]).clamp(0, 1))
    moisture_score = ndmi_fit if profile["moistureBonus"] else ee.Image(1).clip(aoi)
    return (
        rain_score.multiply(0.45)
        .add(elev_score.multiply(0.35))
        .add(slope_score.multiply(0.15))
        .add(moisture_score.multiply(0.05))
        .clamp(0, 1)
        .rename("plant_fit")
    )


def combined_plant_fit(annual_rain, elevation, slope, ndmi_fit, aoi, selected_profiles=None):
    import ee

    profiles = selected_profiles or PLANT_PROFILES
    if not profiles:
        return ee.Image(1).clip(aoi).rename("plant_fit")
    images = [plant_suitability(profile, annual_rain, elevation, slope, ndmi_fit, aoi) for profile in profiles]
    return ee.ImageCollection.fromImages(images).max().rename("plant_fit")


def build_indicator_inputs(aoi, config: ProcessorConfig) -> dict:
    import ee

    projection = analysis_projection(config.export_scale)
    s2 = sentinel2_composite(aoi, config)
    change = historical_change(aoi, s2["ndvi_current"])
    s1_vh = sentinel1_structure(aoi, config)
    worldcover = worldcover_inputs(aoi, projection)
    forest = forest_change_inputs(aoi, s2["ndvi_current"], change["ndvi_decline"])
    carbon = carbon_inputs(aoi, worldcover["restorable_share"], forest["low_current_vegetation"])
    rain = rainfall_inputs(aoi, config)
    soil = soil_inputs()
    terrain = terrain_inputs(aoi, worldcover["restorable_share"])
    safeguards = safeguard_inputs(aoi, projection, worldcover["tree_raw"], forest["tree_cover_2000"])
    population = population_inputs(aoi)

    ndmi_fit = s2["ndmi_current"].unitScale(-0.20, 0.35).clamp(0, 1).rename("ndmi_fit")
    water_soil_proxy = (
        rain["rainfall_fit"]
        .multiply(0.40)
        .add(soil["soil_water_fit"].multiply(0.35))
        .add(ndmi_fit.multiply(0.15))
        .add(terrain["terrain_fit"].multiply(0.10))
        .clamp(0, 1)
        .rename("water_soil_proxy")
    )
    biodiversity_proxy = (
        safeguards["near_protected_area"]
        .multiply(0.35)
        .add(safeguards["near_existing_tree_cover"].multiply(0.25))
        .add(forest["degradation_proxy"].multiply(0.25))
        .add(worldcover["restorable_share"].multiply(0.15))
        .clamp(0, 1)
        .rename("biodiversity_proxy")
    )

    valid_raw = (
        worldcover["restorable_raw"]
        .And(worldcover["built_up_raw"].Not())
        .And(worldcover["water_wetland_raw"].Not())
        .And(worldcover["snow_ice_raw"].Not())
        .And(worldcover["moss_raw"].Not())
        .And(terrain["slope"].lte(35))
        .And(rain["annual_rain"].gte(250))
        .And(rain["annual_rain"].lte(2600))
        .rename("valid_restoration_land_raw")
    )
    valid_restoration_land = fraction_at_analysis_scale(valid_raw, "valid_restoration_land", projection)
    valid_restoration_mask = valid_restoration_land.gte(0.05).rename("valid_restoration_mask")
    plant_fit = combined_plant_fit(rain["annual_rain"], terrain["elevation"], terrain["slope"], ndmi_fit, aoi)

    return {
        **s2,
        **change,
        **worldcover,
        **forest,
        **carbon,
        **rain,
        **soil,
        **terrain,
        **safeguards,
        **population,
        "s1_vh_structure": s1_vh,
        "ndmi_fit": ndmi_fit,
        "water_soil_proxy": water_soil_proxy,
        "biodiversity_proxy": biodiversity_proxy,
        "valid_restoration_land": valid_restoration_land,
        "valid_restoration_mask": valid_restoration_mask,
        "plant_fit": plant_fit,
        "projection": projection,
    }
