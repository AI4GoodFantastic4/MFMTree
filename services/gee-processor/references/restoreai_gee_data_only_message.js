/***************************************************************
RESTOREAI ETHIOPIA RESTORATION ROI EXPLORER
DATA-ONLY VERSION — NO MAP VISUALIZATION

Purpose:
- Calculate restoration ROI grid data.
- Only include/display/export areas where the empty/no-plant proxy passes.
- Avoid heavy Map.addLayer vector styling.
- Avoid printing large FeatureCollections.
- Create export tasks for CSV, GeoJSON, KML and GeoTIFF.

Important:
"no plant" cannot be confirmed at individual plant level from satellite data.
This script uses a conservative proxy:
- ESA WorldCover bare/sparse land
- low current Sentinel-2 NDVI
- low Hansen tree cover
- not built-up
- not water/wetland/mangrove
***************************************************************/


/***********************
1. USER CONFIGURATION
***********************/

// Use uploaded HDX/OCHA Admin boundary asset for exact regions.
var USE_OCHA_HDX_ASSET = false;

// Example after uploading HDX/OCHA shapefile:
// var OCHA_HDX_ASSET = 'users/YOUR_USERNAME/eth_adm1_ocha_hdx';
var OCHA_HDX_ASSET = 'users/YOUR_USERNAME/eth_adm1_ocha_hdx';

// Check your uploaded attribute table.
// Common names: ADM1_EN, admin1Name, ADM1_NAME, ADM1_PCODE
var OCHA_ADM1_FIELD = 'ADM1_EN';

var TARGET_ADM1_NAMES = [
  'South Ethiopia',
  'South West Ethiopia Peoples',
  "South West Ethiopia Peoples'",
  'Southwest Ethiopia Peoples',
  "Southwest Ethiopia Peoples'",
  "South West Ethiopia People's Region",
  "Southwest Ethiopia People's Region"
];

// Data-only settings.
// Coarser grid and scale are more stable for all Ethiopia.
var GRID_SIZE_M = 25000;
var SCORE_SCALE_M = 500;
var ANALYSIS_PROJECTION = ee.Projection('EPSG:3857').atScale(SCORE_SCALE_M);

// Time windows.
var S2_START = '2023-01-01';
var S2_END   = '2025-01-01';

var S1_START = '2023-01-01';
var S1_END   = '2025-01-01';

var LANDSAT_BASE_START = '2000-01-01';
var LANDSAT_BASE_END   = '2005-01-01';

var LANDSAT_RECENT_START = '2021-01-01';
var LANDSAT_RECENT_END   = '2025-01-01';

var RAIN_START = '2019-01-01';
var RAIN_END   = '2025-01-01';
var RAIN_YEARS = 6;

// Score weights.
var W_CARBON       = 0.25;
var W_WATER_SOIL   = 0.25;
var W_BIODIVERSITY = 0.25;
var W_LIVELIHOOD   = 0.15;
var W_DEGRADATION  = 0.10;

var TOP_N_CELLS = 30;

// Project assumptions.
var COST_EUR_PER_HA = 450;
var MAX_PROJECT_AREA_HA = 10000;

// Score classes.
var HIGH_PRIORITY_THRESHOLD = 70;
var MEDIUM_PRIORITY_THRESHOLD = 45;

// Safeguards.
var MAX_SETTLEMENT_PRESSURE_MEAN = 0.70;
var MAX_BUILTUP_SHARE = 0.20;
var MAX_WATER_WETLAND_SHARE = 0.20;
var MIN_VALID_RESTORATION_SHARE = 0.05;
var PROTECTED_AREA_REVIEW_SHARE = 0.05;

// Empty/no-plant rule.
var REQUIRE_NO_PLANT_EMPTY_LAND_ONLY = true;
var MAX_CURRENT_NDVI_FOR_NO_PLANT = 0.25;
var MAX_TREECOVER2000_FOR_NO_PLANT = 0.10;
var MIN_NO_PLANT_EMPTY_SHARE = 0.50;


/***********************
2. AOI
***********************/

var ethiopia0 = ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', 'Ethiopia'));

var aoiFc;

if (USE_OCHA_HDX_ASSET) {
  var admin = ee.FeatureCollection(OCHA_HDX_ASSET);

  print('Uploaded HDX/OCHA admin sample. Check field names and region names:', admin.first());

  aoiFc = admin.filter(
    ee.Filter.inList(OCHA_ADM1_FIELD, TARGET_ADM1_NAMES)
  );

  print('Filtered HDX/OCHA target-region count:', aoiFc.size());

} else {
  print(
    'Using all Ethiopia as fallback. For exact South Ethiopia and South West Ethiopia Peoples regions, upload HDX/OCHA Admin boundaries and set USE_OCHA_HDX_ASSET = true.'
  );

  aoiFc = ethiopia0;
}

var aoi = aoiFc.geometry().dissolve(100);


/***********************
3. HELPER FUNCTIONS
***********************/

function fuzzyRange(img, minVal, optMin, optMax, maxVal) {
  img = ee.Image(img);
  var left = img.subtract(minVal).divide(optMin - minVal);
  var right = ee.Image(maxVal).subtract(img).divide(maxVal - optMax);
  return left.min(right).clamp(0, 1);
}

function fractionAtAnalysisScale(mask, bandName, sourceProjection) {
  var srcProj = sourceProjection || ANALYSIS_PROJECTION;

  return ee.Image(mask)
    .unmask(0)
    .toFloat()
    .setDefaultProjection(srcProj)
    .reduceResolution({
      reducer: ee.Reducer.mean(),
      bestEffort: true,
      maxPixels: 1024
    })
    .reproject({
      crs: ANALYSIS_PROJECTION
    })
    .rename(bandName);
}

function scoreCategory(score) {
  return ee.String(
    ee.Algorithms.If(
      ee.Number(score).gte(HIGH_PRIORITY_THRESHOLD),
      'High priority / good candidate',
      ee.Algorithms.If(
        ee.Number(score).gte(MEDIUM_PRIORITY_THRESHOLD),
        'Medium priority / review candidate',
        'Lower priority / weak candidate'
      )
    )
  );
}

function recommendationText(score, candidateOk) {
  return ee.String(
    ee.Algorithms.If(
      ee.Number(candidateOk).eq(0),
      'Not recommended for first-pass investment without expert review',
      ee.Algorithms.If(
        ee.Number(score).gte(HIGH_PRIORITY_THRESHOLD),
        'High-priority restoration candidate for expert validation and investment screening',
        ee.Algorithms.If(
          ee.Number(score).gte(MEDIUM_PRIORITY_THRESHOLD),
          'Medium-priority candidate; review locally before investment',
          'Lower-priority candidate; monitor or deprioritize for first-pass investment'
        )
      )
    )
  );
}

function makeGrid(region, scaleMeters) {
  var proj = ee.Projection('EPSG:3857').atScale(scaleMeters);
  var coords = ee.Image.pixelCoordinates(proj);

  var gridId = coords.select('x').toInt64()
    .multiply(10000000)
    .add(coords.select('y').toInt64())
    .rename('grid_id');

  var grid = gridId.reduceToVectors({
    geometry: region,
    crs: proj,
    scale: scaleMeters,
    geometryType: 'polygon',
    eightConnected: false,
    labelProperty: 'grid_id',
    reducer: ee.Reducer.countEvery(),
    maxPixels: 1e13,
    tileScale: 8
  });

  return grid.filterBounds(region);
}


/***********************
4. SENTINEL-2 CURRENT VEGETATION
***********************/

function maskS2sr(img) {
  var scl = img.select('SCL');

  var mask = scl.neq(3)
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));

  var sr = img.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
    .multiply(0.0001);

  return ee.Image(sr.updateMask(mask)
    .copyProperties(img, ['system:time_start']));
}

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(S2_START, S2_END)
  .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', 70))
  .map(maskS2sr);

var s2Med = s2.median().clip(aoi);

var ndviCurrent = s2Med.normalizedDifference(['B8', 'B4'])
  .rename('current_ndvi');

var ndmiCurrent = s2Med.normalizedDifference(['B8', 'B11'])
  .rename('current_ndmi');


/***********************
5. LANDSAT NDVI CHANGE
***********************/

function landsatMask(img) {
  var qa = img.select('QA_PIXEL');

  return qa.bitwiseAnd(1 << 1).eq(0)
    .and(qa.bitwiseAnd(1 << 2).eq(0))
    .and(qa.bitwiseAnd(1 << 3).eq(0))
    .and(qa.bitwiseAnd(1 << 4).eq(0))
    .and(qa.bitwiseAnd(1 << 5).eq(0));
}

function prepL57(img) {
  var mask = landsatMask(img);

  var sr = img.select(['SR_B3', 'SR_B4'])
    .multiply(0.0000275)
    .add(-0.2)
    .rename(['red', 'nir']);

  return sr.updateMask(mask)
    .copyProperties(img, ['system:time_start']);
}

function prepL89(img) {
  var mask = landsatMask(img);

  var sr = img.select(['SR_B4', 'SR_B5'])
    .multiply(0.0000275)
    .add(-0.2)
    .rename(['red', 'nir']);

  return sr.updateMask(mask)
    .copyProperties(img, ['system:time_start']);
}

function landsatNdviComposite(startDate, endDate) {
  var l5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .map(prepL57);

  var l7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .map(prepL57);

  var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .map(prepL89);

  var l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .map(prepL89);

  var merged = l5.merge(l7).merge(l8).merge(l9);

  return merged.map(function(img) {
      return img.normalizedDifference(['nir', 'red'])
        .rename('ndvi')
        .copyProperties(img, ['system:time_start']);
    })
    .median()
    .clip(aoi);
}

var ndviBase = landsatNdviComposite(
  LANDSAT_BASE_START,
  LANDSAT_BASE_END
).rename('landsat_ndvi_2000_2004');

var ndviRecent = landsatNdviComposite(
  LANDSAT_RECENT_START,
  LANDSAT_RECENT_END
).rename('landsat_ndvi_2021_2024');

var ndviDecline = ndviBase.subtract(ndviRecent)
  .unitScale(0.05, 0.35)
  .clamp(0, 1)
  .rename('ndvi_decline');


/***********************
6. SENTINEL-1 SAR
***********************/

var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filterBounds(aoi)
  .filterDate(S1_START, S1_END)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
  .select(['VV', 'VH'])
  .median()
  .clip(aoi);

var vhStructure = s1.select('VH')
  .unitScale(-25, -12)
  .clamp(0, 1)
  .rename('sentinel1_vh_structure');


/***********************
7. ESA WORLDCOVER
***********************/

var worldCoverBase = ee.ImageCollection('ESA/WorldCover/v200')
  .first()
  .select('Map');

var WORLD_COVER_PROJECTION = worldCoverBase.projection();

var worldCover = worldCoverBase.clip(aoi);

var treeRaw      = worldCover.eq(10);
var shrubRaw     = worldCover.eq(20);
var grassRaw     = worldCover.eq(30);
var croplandRaw  = worldCover.eq(40);
var builtRaw     = worldCover.eq(50);
var bareRaw      = worldCover.eq(60);
var snowIceRaw   = worldCover.eq(70);
var waterRaw     = worldCover.eq(80);
var wetlandRaw   = worldCover.eq(90);
var mangroveRaw  = worldCover.eq(95);
var mossRaw      = worldCover.eq(100);

var restorableRaw = shrubRaw.or(grassRaw).or(croplandRaw).or(bareRaw)
  .rename('restorable_land_raw');

var waterOrWetlandRaw = waterRaw.or(wetlandRaw).or(mangroveRaw)
  .rename('water_wetland_mangrove_raw');

var builtUpRaw = builtRaw.rename('built_up_raw');

var restorableShareBand = fractionAtAnalysisScale(
  restorableRaw,
  'restorable_land_share',
  WORLD_COVER_PROJECTION
);

var builtUpShareBand = fractionAtAnalysisScale(
  builtUpRaw,
  'built_up_share',
  WORLD_COVER_PROJECTION
);

var waterWetlandShareBand = fractionAtAnalysisScale(
  waterOrWetlandRaw,
  'water_wetland_mangrove_share',
  WORLD_COVER_PROJECTION
);


/***********************
8. HANSEN FOREST CHANGE
***********************/

var gfc = ee.Image('UMD/hansen/global_forest_change_2025_v1_13')
  .clip(aoi);

var treeCover2000 = gfc.select('treecover2000')
  .divide(100)
  .rename('treecover2000');

var forestLoss = gfc.select('loss')
  .unmask(0)
  .toFloat()
  .rename('forest_loss_2001_2025');

var existingTreeMaskRaw = treeRaw.or(treeCover2000.gt(0.30))
  .rename('existing_tree_cover_raw');

var existingTreeShare = fractionAtAnalysisScale(
  existingTreeMaskRaw,
  'existing_tree_cover_share'
);

var lowCurrentVegetation = ee.Image(1)
  .subtract(ndviCurrent.unitScale(0.25, 0.75).clamp(0, 1))
  .rename('low_current_vegetation');

var degradationProxy = ndviDecline.max(forestLoss.multiply(0.8))
  .rename('degradation_proxy');


/***********************
9. EMPTY / NO-PLANT MASK
***********************/

var noPlantEmptyRaw = bareRaw
  .and(ndviCurrent.lte(MAX_CURRENT_NDVI_FOR_NO_PLANT))
  .and(treeCover2000.lte(MAX_TREECOVER2000_FOR_NO_PLANT))
  .and(existingTreeMaskRaw.not())
  .and(builtUpRaw.not())
  .and(waterOrWetlandRaw.not())
  .and(snowIceRaw.not())
  .and(mossRaw.not())
  .rename('no_plant_empty_land_raw');

var noPlantEmptyShareBand = fractionAtAnalysisScale(
  noPlantEmptyRaw,
  'no_plant_empty_land_share',
  WORLD_COVER_PROJECTION
);

var noPlantDisplayMask = REQUIRE_NO_PLANT_EMPTY_LAND_ONLY
  ? noPlantEmptyShareBand.gte(MIN_NO_PLANT_EMPTY_SHARE)
  : ee.Image(1).clip(aoi);

noPlantDisplayMask = noPlantDisplayMask.rename('no_plant_display_mask');


/***********************
10. CARBON
***********************/

var carbon2010 = ee.Image('WCMC/biomass_carbon_density/v1_0/2010')
  .select('carbon_tonnes_per_ha')
  .clip(aoi);

var lowExistingCarbon = ee.Image(1)
  .subtract(carbon2010.unitScale(5, 150).clamp(0, 1))
  .rename('low_existing_carbon');

var carbonProxy = restorableShareBand
  .multiply(lowExistingCarbon)
  .multiply(lowCurrentVegetation)
  .rename('carbon_proxy');


/***********************
11. RAINFALL
***********************/

var chirps = ee.ImageCollection('UCSB-CHC/CHIRPS/V3/DAILY_RNL')
  .filterBounds(aoi)
  .filterDate(RAIN_START, RAIN_END)
  .select('precipitation');

var annualRain = chirps.sum()
  .divide(RAIN_YEARS)
  .rename('annual_rain_mm')
  .clip(aoi);

var rainfallFit = fuzzyRange(
  annualRain,
  300,
  650,
  1600,
  2400
).rename('rainfall_fit');


/***********************
12. SOILS
***********************/

var depthBands = [
  'val_0_5cm_mean',
  'val_5_15cm_mean',
  'val_15_30cm_mean'
];

var fieldCapacity33Raw = ee.Image('ISRIC/SoilGrids250m/v2_0/wv0033')
  .select(depthBands)
  .reduce(ee.Reducer.mean())
  .rename('soil_water_33kpa_0_30cm_raw');

var wiltingPoint1500Raw = ee.Image('ISRIC/SoilGrids250m/v2_0/wv1500')
  .select(depthBands)
  .reduce(ee.Reducer.mean())
  .rename('soil_water_1500kpa_0_30cm_raw');

// SoilGrids values are stored in 10^-3 cm3/cm3.
var plantAvailableWater = fieldCapacity33Raw
  .subtract(wiltingPoint1500Raw)
  .multiply(0.001)
  .rename('soil_pawc_0_30cm_cm3cm3');

var soilWaterFit = plantAvailableWater
  .unitScale(0.04, 0.18)
  .clamp(0, 1)
  .rename('soil_water_fit');


/***********************
13. TERRAIN
***********************/

var elevation = ee.Image('USGS/SRTMGL1_003')
  .select('elevation')
  .clip(aoi);

var slope = ee.Terrain.slope(elevation)
  .rename('slope_deg');

var terrainFit = ee.Image(1)
  .subtract(slope.unitScale(8, 30).clamp(0, 1))
  .rename('terrain_access_fit');


/***********************
14. WDPA + POPULATION
***********************/

var wdpa = ee.FeatureCollection('WCMC/WDPA/current/polygons')
  .filterBounds(aoi);

var protectedAreaMaskRaw = ee.Image(0)
  .byte()
  .paint(wdpa, 1)
  .clip(aoi)
  .rename('protected_area_raw');

var protectedAreaShare = fractionAtAnalysisScale(
  protectedAreaMaskRaw,
  'protected_area_share'
);

var protectedAreaForFocal = protectedAreaShare.gt(0.01)
  .unmask(0)
  .toFloat()
  .reproject({
    crs: ANALYSIS_PROJECTION
  });

var nearProtectedArea = protectedAreaForFocal
  .focal_max({
    radius: 5000,
    units: 'meters'
  })
  .rename('near_protected_area');

var existingTreeForFocal = existingTreeShare.gt(0.05)
  .unmask(0)
  .toFloat()
  .reproject({
    crs: ANALYSIS_PROJECTION
  });

var nearExistingTreeCover = existingTreeForFocal
  .focal_max({
    radius: 3000,
    units: 'meters'
  })
  .rename('near_existing_tree_cover');

var pop2025 = ee.Image('JRC/GHSL/P2023A/GHS_POP/2025')
  .select('population_count')
  .unmask(0)
  .clip(aoi);

var popLocalMean5km = pop2025
  .focal_mean({
    radius: 5000,
    units: 'meters'
  })
  .rename('population_local_mean_5km');

var settlementPressure1km = pop2025
  .focal_mean({
    radius: 1000,
    units: 'meters'
  })
  .unitScale(10, 50)
  .clamp(0, 1)
  .rename('settlement_pressure_1km');

var communityAccess = popLocalMean5km
  .unitScale(0.02, 5)
  .clamp(0, 1)
  .rename('community_access');

var livelihoodProxy = communityAccess
  .multiply(ee.Image(1).subtract(settlementPressure1km.multiply(0.6)))
  .clamp(0, 1)
  .rename('livelihood_proxy');


/***********************
15. COMBINED PROXIES
***********************/

var ndmiFit = ndmiCurrent
  .unitScale(-0.20, 0.35)
  .clamp(0, 1)
  .rename('ndmi_fit');

var waterSoilProxy = rainfallFit.multiply(0.40)
  .add(soilWaterFit.multiply(0.35))
  .add(ndmiFit.multiply(0.15))
  .add(terrainFit.multiply(0.10))
  .clamp(0, 1)
  .rename('water_soil_proxy');

var biodiversityProxy = nearProtectedArea.multiply(0.35)
  .add(nearExistingTreeCover.multiply(0.25))
  .add(degradationProxy.multiply(0.25))
  .add(restorableShareBand.multiply(0.15))
  .clamp(0, 1)
  .rename('biodiversity_proxy');

var validRestorationLandRaw = restorableRaw
  .and(builtUpRaw.not())
  .and(waterOrWetlandRaw.not())
  .and(snowIceRaw.not())
  .and(mossRaw.not())
  .and(slope.lte(35))
  .and(annualRain.gte(250))
  .and(annualRain.lte(2600))
  .rename('valid_restoration_land_raw');

var validRestorationLand = fractionAtAnalysisScale(
  validRestorationLandRaw,
  'valid_restoration_land',
  WORLD_COVER_PROJECTION
);

var validRestorationMask = validRestorationLand
  .gte(MIN_VALID_RESTORATION_SHARE)
  .and(noPlantDisplayMask)
  .rename('valid_restoration_mask');


/***********************
16. PLANT / RESTORATION OPTIONS
***********************/

var PLANTS = [
  {
    name: 'Dryland native mix — Acacia / Faidherbia',
    rainMin: 300, rainOptMin: 450, rainOptMax: 900, rainMax: 1250,
    elevMin: 300, elevOptMin: 700, elevOptMax: 1700, elevMax: 2300,
    slopeMax: 25,
    moistureBonus: false
  },
  {
    name: 'Highland native mix — Juniperus / Olea',
    rainMin: 650, rainOptMin: 800, rainOptMax: 1500, rainMax: 2200,
    elevMin: 1400, elevOptMin: 1800, elevOptMax: 3000, elevMax: 3400,
    slopeMax: 30,
    moistureBonus: false
  },
  {
    name: 'Moist highland mix — Cordia / Croton',
    rainMin: 800, rainOptMin: 1000, rainOptMax: 1800, rainMax: 2400,
    elevMin: 900, elevOptMin: 1200, elevOptMax: 2400, elevMax: 3000,
    slopeMax: 25,
    moistureBonus: true
  },
  {
    name: 'Agroforestry / farmer livelihood mix',
    rainMin: 500, rainOptMin: 700, rainOptMax: 1500, rainMax: 2200,
    elevMin: 500, elevOptMin: 900, elevOptMax: 2400, elevMax: 3200,
    slopeMax: 20,
    moistureBonus: false
  },
  {
    name: 'Riparian / water-holding restoration mix',
    rainMin: 600, rainOptMin: 800, rainOptMax: 2000, rainMax: 2600,
    elevMin: 300, elevOptMin: 700, elevOptMax: 2500, elevMax: 3400,
    slopeMax: 18,
    moistureBonus: true
  },
  {
    name: 'Erosion-control shrub/grass assisted regeneration',
    rainMin: 300, rainOptMin: 500, rainOptMax: 1300, rainMax: 2100,
    elevMin: 300, elevOptMin: 700, elevOptMax: 2800, elevMax: 3600,
    slopeMax: 35,
    moistureBonus: false
  }
];

// Data-only version: all plant/restoration options are selected.
var selectedPlants = {};
PLANTS.forEach(function(p) {
  selectedPlants[p.name] = true;
});

function plantSuitability(profile) {
  var rainScore = fuzzyRange(
    annualRain,
    profile.rainMin,
    profile.rainOptMin,
    profile.rainOptMax,
    profile.rainMax
  );

  var elevScore = fuzzyRange(
    elevation,
    profile.elevMin,
    profile.elevOptMin,
    profile.elevOptMax,
    profile.elevMax
  );

  var slopeScore = ee.Image(1)
    .subtract(slope.unitScale(profile.slopeMax - 8, profile.slopeMax).clamp(0, 1));

  var moistureScore = profile.moistureBonus
    ? ndmiFit
    : ee.Image(1).clip(aoi);

  return rainScore.multiply(0.45)
    .add(elevScore.multiply(0.35))
    .add(slopeScore.multiply(0.15))
    .add(moistureScore.multiply(0.05))
    .clamp(0, 1)
    .rename('plant_fit');
}

function combinedPlantFit() {
  var chosen = PLANTS.filter(function(p) {
    return selectedPlants[p.name];
  });

  if (chosen.length === 0) {
    return ee.Image(1).clip(aoi).rename('plant_fit');
  }

  var images = chosen.map(function(p) {
    return plantSuitability(p);
  });

  return ee.ImageCollection.fromImages(images)
    .max()
    .rename('plant_fit');
}

var plantFit = combinedPlantFit();


/***********************
17. FINAL SCORE RASTER
***********************/

var baseScore = carbonProxy.multiply(W_CARBON)
  .add(waterSoilProxy.multiply(W_WATER_SOIL))
  .add(biodiversityProxy.multiply(W_BIODIVERSITY))
  .add(livelihoodProxy.multiply(W_LIVELIHOOD))
  .add(degradationProxy.multiply(W_DEGRADATION))
  .clamp(0, 1)
  .rename('base_score');

var restorationScore = baseScore
  .multiply(plantFit)
  .updateMask(validRestorationMask)
  .rename('restoration_score');

var restorationScore100 = restorationScore
  .multiply(100)
  .rename('restoration_score');

var roiClassRaster = ee.Image(0)
  .where(restorationScore100.lt(MEDIUM_PRIORITY_THRESHOLD), 1)
  .where(
    restorationScore100.gte(MEDIUM_PRIORITY_THRESHOLD)
      .and(restorationScore100.lt(HIGH_PRIORITY_THRESHOLD)),
    2
  )
  .where(restorationScore100.gte(HIGH_PRIORITY_THRESHOLD), 3)
  .updateMask(restorationScore100.mask())
  .rename('roi_class_raster');

var exportScoreStack = restorationScore100
  .addBands(roiClassRaster)
  .addBands(carbonProxy.multiply(100).rename('carbon_proxy'))
  .addBands(waterSoilProxy.multiply(100).rename('water_soil_proxy'))
  .addBands(biodiversityProxy.multiply(100).rename('biodiversity_proxy'))
  .addBands(livelihoodProxy.multiply(100).rename('livelihood_proxy'))
  .addBands(degradationProxy.multiply(100).rename('degradation_proxy'))
  .addBands(plantFit.multiply(100).rename('plant_fit'))
  .addBands(annualRain.rename('annual_rain_mm'))
  .addBands(ndviCurrent.rename('current_ndvi'))
  .addBands(ndmiCurrent.rename('current_ndmi'))
  .addBands(ndviDecline.multiply(100).rename('ndvi_decline_proxy'))
  .addBands(vhStructure.multiply(100).rename('sentinel1_vh_structure_proxy'))
  .addBands(slope.rename('slope_deg'))
  .addBands(elevation.rename('elevation_m'))
  .addBands(carbon2010.rename('carbon_tonnes_per_ha_2010'))
  .addBands(plantAvailableWater.rename('soil_pawc_0_30cm_cm3cm3'))
  .addBands(popLocalMean5km.rename('population_local_mean_5km'))
  .addBands(settlementPressure1km.multiply(100).rename('settlement_pressure_1km_pct'))
  .addBands(protectedAreaShare.rename('protected_area_share'))
  .addBands(existingTreeShare.rename('existing_tree_cover_share'))
  .addBands(restorableShareBand.rename('restorable_land_share'))
  .addBands(builtUpShareBand.rename('built_up_share'))
  .addBands(waterWetlandShareBand.rename('water_wetland_mangrove_share'))
  .addBands(noPlantEmptyShareBand.rename('no_plant_empty_land_share'))
  .addBands(noPlantDisplayMask.rename('no_plant_display_mask'))
  .addBands(validRestorationLand.rename('valid_restoration_land'))
  .addBands(validRestorationMask.rename('valid_restoration_mask'));


/***********************
18. GRID DATA TABLE
***********************/

var grid = makeGrid(aoi, GRID_SIZE_M);

print('Grid created. Grid size in meters:', GRID_SIZE_M);
print('Analysis scale in meters:', SCORE_SCALE_M);

// Reduce only once. No visualization.
var gridStats = exportScoreStack.reduceRegions({
  collection: grid,
  reducer: ee.Reducer.mean(),
  scale: SCORE_SCALE_M,
  crs: ANALYSIS_PROJECTION,
  tileScale: 8
}).filter(ee.Filter.notNull(['restoration_score']));

gridStats = gridStats.map(function(f) {
  var s = ee.Number(f.get('restoration_score'));

  var roiClass = ee.String(
    ee.Algorithms.If(
      s.gte(HIGH_PRIORITY_THRESHOLD),
      'Green',
      ee.Algorithms.If(s.gte(MEDIUM_PRIORITY_THRESHOLD), 'Yellow', 'Red')
    )
  );

  var areaHa = f.geometry().area(1).divide(10000);

  var validShare = ee.Number(f.get('valid_restoration_land')).max(0).min(1);
  var restorableShare = ee.Number(f.get('restorable_land_share')).max(0).min(1);
  var builtShare = ee.Number(f.get('built_up_share')).max(0).min(1);
  var waterWetlandShare = ee.Number(f.get('water_wetland_mangrove_share')).max(0).min(1);
  var noPlantShare = ee.Number(f.get('no_plant_empty_land_share')).max(0).min(1);
  var settlementPressure = ee.Number(f.get('settlement_pressure_1km_pct'))
    .divide(100)
    .max(0)
    .min(1);
  var protectedShare = ee.Number(f.get('protected_area_share')).max(0).min(1);

  var validAreaHa = areaHa.multiply(validShare);
  var targetProjectAreaHa = validAreaHa.min(MAX_PROJECT_AREA_HA);
  var estimatedCostMillionEur = targetProjectAreaHa
    .multiply(COST_EUR_PER_HA)
    .divide(1000000);
  var environmentalRoi = s.divide(estimatedCostMillionEur.add(0.1));

  var noPlantTooLow = noPlantShare.lt(MIN_NO_PLANT_EMPTY_SHARE);

  var hardExclusion = settlementPressure.gt(MAX_SETTLEMENT_PRESSURE_MEAN)
    .or(builtShare.gt(MAX_BUILTUP_SHARE))
    .or(waterWetlandShare.gt(MAX_WATER_WETLAND_SHARE))
    .or(validShare.lt(MIN_VALID_RESTORATION_SHARE));

  if (REQUIRE_NO_PLANT_EMPTY_LAND_ONLY) {
    hardExclusion = hardExclusion.or(noPlantTooLow);
  }

  var candidateOk = ee.Number(ee.Algorithms.If(hardExclusion, 0, 1));

  var eligibilityStatus = ee.String(
    ee.Algorithms.If(
      noPlantTooLow,
      'Not recommended - plant/vegetation detected or too little empty land in cell',
      ee.Algorithms.If(
        settlementPressure.gt(MAX_SETTLEMENT_PRESSURE_MEAN),
        'Not recommended - high settlement pressure',
        ee.Algorithms.If(
          builtShare.gt(MAX_BUILTUP_SHARE),
          'Not recommended - high built-up share',
          ee.Algorithms.If(
            waterWetlandShare.gt(MAX_WATER_WETLAND_SHARE),
            'Not recommended - high water/wetland/mangrove share',
            ee.Algorithms.If(
              validShare.lt(MIN_VALID_RESTORATION_SHARE),
              'Not recommended - too little valid restoration land in cell',
              ee.Algorithms.If(
                protectedShare.gt(PROTECTED_AREA_REVIEW_SHARE),
                'Needs expert review - protected area safeguard',
                'Good candidate for expert validation'
              )
            )
          )
        )
      )
    )
  );

  return f.set({
    roi_class: roiClass,
    priority_category: scoreCategory(s),
    recommendation: recommendationText(s, candidateOk),
    eligibility_status: eligibilityStatus,
    candidate_ok: candidateOk,

    area_ha: areaHa,
    restorable_land_pct: restorableShare.multiply(100),
    valid_restoration_land_pct: validShare.multiply(100),
    built_up_pct: builtShare.multiply(100),
    water_wetland_mangrove_pct: waterWetlandShare.multiply(100),
    no_plant_empty_land_pct: noPlantShare.multiply(100),
    protected_area_pct: protectedShare.multiply(100),
    settlement_pressure_1km_pct_export: settlementPressure.multiply(100),

    target_project_area_ha: targetProjectAreaHa,
    estimated_cost_million_eur: estimatedCostMillionEur,
    environmental_roi: environmentalRoi,

    grid_size_m: GRID_SIZE_M,
    score_scale_m: SCORE_SCALE_M,
    high_priority_threshold: HIGH_PRIORITY_THRESHOLD,
    medium_priority_threshold: MEDIUM_PRIORITY_THRESHOLD,

    no_plant_rule: 'WorldCover bare/sparse land AND Sentinel-2 NDVI <= 0.25 AND Hansen tree cover <= 10% AND not built-up AND not water/wetland/mangrove',
    score_formula: 'ROI = carbon 25%, water/soil 25%, biodiversity 25%, livelihood 15%, degradation 10%, multiplied by selected plant suitability, masked by safeguards and empty/no-plant proxy',
    color_logic: 'Green >= 70, Yellow 45-69.9, Red < 45',
    explanation: 'Screening result only. Empty/no-plant is a remote-sensing proxy, not field confirmation of individual plants. Final decisions require local expert validation.'
  });
});

var eligibleGridStats = gridStats.filter(ee.Filter.eq('candidate_ok', 1));

var topCells = eligibleGridStats
  .sort('restoration_score', false)
  .limit(TOP_N_CELLS);

// Safe small prints only.
print('Total scored grid cell count:', gridStats.size());
print('Eligible empty/no-plant candidate cell count:', eligibleGridStats.size());
print('Top eligible empty/no-plant candidate cells:', topCells);


/***********************
19. EXPORT TASKS
***********************/

// Full table as CSV.
Export.table.toDrive({
  collection: gridStats,
  description: 'restoreai_ethiopia_no_plant_grid_scores_csv',
  fileNamePrefix: 'restoreai_ethiopia_no_plant_grid_scores',
  fileFormat: 'CSV'
});

// Eligible-only table as CSV.
Export.table.toDrive({
  collection: eligibleGridStats,
  description: 'restoreai_ethiopia_no_plant_eligible_cells_csv',
  fileNamePrefix: 'restoreai_ethiopia_no_plant_eligible_cells',
  fileFormat: 'CSV'
});

// Full table as GeoJSON.
Export.table.toDrive({
  collection: gridStats,
  description: 'restoreai_ethiopia_no_plant_grid_scores_geojson',
  fileNamePrefix: 'restoreai_ethiopia_no_plant_grid_scores',
  fileFormat: 'GeoJSON'
});

// Top cells as KML for Google Earth.
Export.table.toDrive({
  collection: topCells,
  description: 'restoreai_ethiopia_no_plant_top_cells_kml',
  fileNamePrefix: 'restoreai_ethiopia_no_plant_top_cells',
  fileFormat: 'KML'
});

// Score raster as GeoTIFF.
Export.image.toDrive({
  image: exportScoreStack.select([
    'restoration_score',
    'roi_class_raster',
    'no_plant_empty_land_share',
    'valid_restoration_land',
    'current_ndvi',
    'annual_rain_mm',
    'slope_deg'
  ]).toFloat(),
  description: 'restoreai_ethiopia_no_plant_score_raster_geotiff',
  fileNamePrefix: 'restoreai_ethiopia_no_plant_score_raster',
  region: aoi,
  scale: SCORE_SCALE_M,
  crs: 'EPSG:3857',
  maxPixels: 1e13,
  fileFormat: 'GeoTIFF',
  formatOptions: {
    cloudOptimized: true
  }
});

print('Export tasks created. Open the Tasks tab and click Run for each export.');