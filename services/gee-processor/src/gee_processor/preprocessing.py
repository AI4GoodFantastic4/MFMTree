from __future__ import annotations


def analysis_projection(scale_m: int):
    import ee

    return ee.Projection("EPSG:3857").atScale(scale_m)


def fuzzy_range(img, min_val: float, opt_min: float, opt_max: float, max_val: float):
    import ee

    img = ee.Image(img)
    left = img.subtract(min_val).divide(opt_min - min_val)
    right = ee.Image(max_val).subtract(img).divide(max_val - opt_max)
    return left.min(right).clamp(0, 1)


def fraction_at_analysis_scale(mask, band_name: str, projection, source_projection=None):
    import ee

    src_projection = source_projection or projection
    return (
        ee.Image(mask)
        .unmask(0)
        .toFloat()
        .setDefaultProjection(src_projection)
        .reduceResolution(reducer=ee.Reducer.mean(), bestEffort=True, maxPixels=1024)
        .reproject(crs=projection)
        .rename(band_name)
    )


def to_analysis_scale(img, band_name: str, projection):
    import ee

    return ee.Image(img).unmask(0).toFloat().reproject(crs=projection).rename(band_name)


def make_grid(region, scale_m: int):
    import ee

    projection = analysis_projection(scale_m)
    coords = ee.Image.pixelCoordinates(projection)
    grid_id = coords.select("x").toInt64().multiply(10000000).add(coords.select("y").toInt64()).rename("grid_id")
    grid = grid_id.reduceToVectors(
        geometry=region,
        crs=projection,
        scale=scale_m,
        geometryType="polygon",
        eightConnected=False,
        labelProperty="grid_id",
        reducer=ee.Reducer.countEvery(),
        maxPixels=1e13,
        tileScale=4,
    )
    return grid.filterBounds(region)


def mask_sentinel2_sr(img):
    import ee

    scl = img.select("SCL")
    mask = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)).And(scl.neq(11))
    sr = img.select(["B2", "B3", "B4", "B8", "B11", "B12"]).multiply(0.0001)
    return ee.Image(sr.updateMask(mask).copyProperties(img, ["system:time_start"]))


def landsat_mask(img):
    qa = img.select("QA_PIXEL")
    return (
        qa.bitwiseAnd(1 << 1)
        .eq(0)
        .And(qa.bitwiseAnd(1 << 2).eq(0))
        .And(qa.bitwiseAnd(1 << 3).eq(0))
        .And(qa.bitwiseAnd(1 << 4).eq(0))
        .And(qa.bitwiseAnd(1 << 5).eq(0))
    )


def prep_landsat_57(img):
    mask = landsat_mask(img)
    sr = img.select(["SR_B3", "SR_B4"]).multiply(0.0000275).add(-0.2).rename(["red", "nir"])
    return sr.updateMask(mask).copyProperties(img, ["system:time_start"])


def prep_landsat_89(img):
    mask = landsat_mask(img)
    sr = img.select(["SR_B4", "SR_B5"]).multiply(0.0000275).add(-0.2).rename(["red", "nir"])
    return sr.updateMask(mask).copyProperties(img, ["system:time_start"])
