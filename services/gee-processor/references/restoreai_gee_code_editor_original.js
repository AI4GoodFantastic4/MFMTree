/***************************************************************
RESTOREAI ETHIOPIA RESTORATION ROI EXPLORER — FIXED COPY-PASTE VERSION
Google Earth Engine Code Editor JavaScript

Main fixes in this version:
- Fixed fuzzyRange() so it does not use Image.min(1) with a raw JS number.
- Converted SoilGrids volumetric water content from 10^-3 cm3/cm3 to cm3/cm3 before scoring.
- Aggregated 10 m WorldCover masks to the 250 m analysis scale for real share/proportion bands.
- Added a stable analysis projection for neighborhood operations and zonal stats.
- Added protected-area share instead of treating a cell mean as a binary flag.
- Reduced very heavy focal operations on 10 m masks by running them at analysis scale.
- Added CRS to reduceRegions/export for more stable, repeatable outputs.
- Kept the UI, plant filters, click inspector, ranking and export tasks.

IMPORTANT:
For exact "South Ethiopia" and "South West Ethiopia Peoples' Region"
boundaries, upload HDX/OCHA Admin boundaries as an Earth Engine asset,
then set USE_OCHA_HDX_ASSET = true and update the asset path + field names.
***************************************************************/


/***********************
1. USER CONFIGURATION
***********************/

// Use your uploaded HDX/OCHA Admin boundary asset for exact new regions.
var USE_OCHA_HDX_ASSET = false;

// Example after uploading HDX/OCHA shapefile:
// var OCHA_HDX_ASSET = 'users/YOUR_USERNAME/eth_adm1_ocha_hdx';
var OCHA_HDX_ASSET = 'users/YOUR_USERNAME/eth_adm1_ocha_hdx';

// Check your uploaded attribute table. Common possibilities:
// ADM1_EN, admin1Name, ADM1_NAME, ADM1_PCODE
var OCHA_ADM1_FIELD = 'ADM1_EN';

// Update these names after printing admin.first().
var TARGET_ADM1_NAMES = [
  'South Ethiopia',
  'South West Ethiopia Peoples',
  "South West Ethiopia Peoples'",
  'Southwest Ethiopia Peoples',
  "Southwest Ethiopia Peoples'",
  "South West Ethiopia People's Region",
  "Southwest Ethiopia People's Region"
];

// Grid and analysis scale.
var GRID_SIZE_M = 10000;       // 10 km grid cells for the decision map.
var SCORE_SCALE_M = 250;       // Analysis scale. Keep 250 m for speed.
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

// Score weights. Sum does not need to equal 1, but it is clearer if it does.
var W_CARBON       = 0.25;
var W_WATER_SOIL   = 0.25;
var W_BIODIVERSITY = 0.25;
var W_LIVELIHOOD   = 0.15;
var W_DEGRADATION  = 0.10;

var TOP_N_CELLS = 30;

// Dashboard / decision-support assumptions.
// These are screening assumptions, not final field-budget estimates.
var COST_EUR_PER_HA = 450;
var MAX_PROJECT_AREA_HA = 10000;

// Shared class thresholds.
// Keep these consistent across the map, inspector, exports and dashboard.
var HIGH_PRIORITY_THRESHOLD = 70;
var MEDIUM_PRIORITY_THRESHOLD = 45;

// Safeguard thresholds.
// These avoid presenting obviously unsuitable areas as strong restoration candidates.
var MAX_SETTLEMENT_PRESSURE_MEAN = 0.70;
var MAX_BUILTUP_SHARE = 0.20;
var MAX_WATER_WETLAND_SHARE = 0.20;
var MIN_VALID_RESTORATION_SHARE = 0.05;
var PROTECTED_AREA_REVIEW_SHARE = 0.05;


/***********************
2. AOI: ETHIOPIA OR HDX/OCHA REGIONS
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

  print('Filtered HDX/OCHA target regions:', aoiFc);
  print('Filtered target-region count:', aoiFc.size());

} else {
  print(
    'Using all Ethiopia as fallback. For exact South Ethiopia and South West Ethiopia Peoples regions, upload HDX/OCHA Admin boundaries and set USE_OCHA_HDX_ASSET = true.'
  );

  aoiFc = ethiopia0;
}

var aoi = aoiFc.geometry().dissolve(100);
Map.centerObject(aoiFc, 6);


/***********************
3. HELPER FUNCTIONS
***********************/

function clamp01(img) {
  return ee.Image(img).clamp(0, 1);
}

// Trapezoid fuzzy score:
// 0 outside [minVal, maxVal]
// 1 inside [optMin, optMax]
// linear ramp between minVal-optMin and optMax-maxVal.
function fuzzyRange(img, minVal, optMin, optMax, maxVal) {
  img = ee.Image(img);
  var left = img.subtract(minVal).divide(optMin - minVal);
  var right = ee.Image(maxVal).subtract(img).divide(maxVal - optMax);

  // Fixed: use image-image min and clamp. Do not use left.min(1).
  return left.min(right).clamp(0, 1);
}

// Aggregate a binary mask to the 250 m analysis grid as a true 0-1 share.
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

// Reproject simple masks/proxies to the common analysis projection.
function toAnalysisScale(img, bandName) {
  return ee.Image(img)
    .unmask(0)
    .toFloat()
    .reproject({
      crs: ANALYSIS_PROJECTION
    })
    .rename(bandName);
}

// Server-side score category used in exported tables.
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

// Server-side recommendation used in exported tables.
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

// Clear all map layers before recalculating.
function clearMapLayers() {
  var layers = Map.layers();
  for (var i = layers.length() - 1; i >= 0; i--) {
    layers.remove(layers.get(i));
  }
}

// Make a vector grid using Web Mercator at a fixed meter scale.
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
    tileScale: 4
  });

  return grid.filterBounds(region);
}


/***********************
4. SATELLITE IMAGERY: SENTINEL-2
***********************/

function maskS2sr(img) {
  var scl = img.select('SCL');

  // Mask cloud shadow, medium cloud, high cloud, cirrus and snow.
  var mask = scl.neq(3)
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));

  var sr = img.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
    .multiply(0.0001);

  // Important: copyProperties() can change the client-side object type,
  // so updateMask() must be applied before copyProperties().
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
5. HISTORICAL CHANGE: LANDSAT COLLECTION 2
***********************/

function landsatMask(img) {
  var qa = img.select('QA_PIXEL');

  // Bits: dilated cloud, cirrus, cloud, cloud shadow, snow.
  var mask = qa.bitwiseAnd(1 << 1).eq(0)
    .and(qa.bitwiseAnd(1 << 2).eq(0))
    .and(qa.bitwiseAnd(1 << 3).eq(0))
    .and(qa.bitwiseAnd(1 << 4).eq(0))
    .and(qa.bitwiseAnd(1 << 5).eq(0));

  return mask;
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

  var ndvi = merged.map(function(img) {
      return img.normalizedDifference(['nir', 'red'])
        .rename('ndvi')
        .copyProperties(img, ['system:time_start']);
    })
    .median()
    .clip(aoi);

  return ndvi;
}

var ndviBase = landsatNdviComposite(
  LANDSAT_BASE_START,
  LANDSAT_BASE_END
).rename('landsat_ndvi_2000_2004');

var ndviRecent = landsatNdviComposite(
  LANDSAT_RECENT_START,
  LANDSAT_RECENT_END
).rename('landsat_ndvi_2021_2024');

// Higher value = stronger vegetation decline signal.
var ndviDecline = ndviBase.subtract(ndviRecent)
  .unitScale(0.05, 0.35)
  .clamp(0, 1)
  .rename('ndvi_decline');


/***********************
6. ALL-WEATHER IMAGERY: SENTINEL-1 SAR
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

// VH proxy for vegetation structure / moisture signal.
var vhStructure = s1.select('VH')
  .unitScale(-25, -12)
  .clamp(0, 1)
  .rename('sentinel1_vh_structure');


/***********************
7. LAND COVER: ESA WORLDCOVER
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

// First MVP restoration target:
// degraded/restorable shrubland, grassland, cropland, and bare/sparse land.
// Avoid built-up, water, wetlands, mangroves, snow/ice, moss/lichen.
var restorableRaw = shrubRaw.or(grassRaw).or(croplandRaw).or(bareRaw)
  .rename('restorable_land_raw');

var waterOrWetlandRaw = waterRaw.or(wetlandRaw).or(mangroveRaw)
  .rename('water_wetland_mangrove_raw');

var builtUpRaw = builtRaw.rename('built_up_raw');

// True 0-1 cell shares at analysis scale.
var restorableShareBand = fractionAtAnalysisScale(restorableRaw, 'restorable_land_share', WORLD_COVER_PROJECTION);
var builtUpShareBand = fractionAtAnalysisScale(builtUpRaw, 'built_up_share', WORLD_COVER_PROJECTION);
var waterWetlandShareBand = fractionAtAnalysisScale(waterOrWetlandRaw, 'water_wetland_mangrove_share', WORLD_COVER_PROJECTION);

/***********************
8. FOREST CHANGE: HANSEN GLOBAL FOREST CHANGE
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

var lossYear = gfc.select('lossyear')
  .rename('forest_loss_year');

// lossyear = 1 means 2001, 25 means 2025.
var forestLossRecent = lossYear.gte(18)
  .rename('forest_loss_2018_2025');

var lowCurrentVegetation = ee.Image(1)
  .subtract(ndviCurrent.unitScale(0.25, 0.75).clamp(0, 1))
  .rename('low_current_vegetation');

var degradationProxy = ndviDecline.max(forestLoss.multiply(0.8))
  .rename('degradation_proxy');


/***********************
9. CARBON STORAGE BASELINE / OPPORTUNITY
***********************/

var carbon2010 = ee.Image('WCMC/biomass_carbon_density/v1_0/2010')
  .select('carbon_tonnes_per_ha')
  .clip(aoi);

// For restoration ROI, low existing biomass carbon + restorable land
// is treated as carbon opportunity, not as current carbon value.
var lowExistingCarbon = ee.Image(1)
  .subtract(carbon2010.unitScale(5, 150).clamp(0, 1))
  .rename('low_existing_carbon');

var carbonProxy = restorableShareBand
  .multiply(lowExistingCarbon)
  .multiply(lowCurrentVegetation)
  .rename('carbon_proxy');


/***********************
10. RAINFALL: CHIRPS
***********************/

var chirps = ee.ImageCollection('UCSB-CHC/CHIRPS/V3/DAILY_RNL')
  .filterBounds(aoi)
  .filterDate(RAIN_START, RAIN_END)
  .select('precipitation');

var annualRain = chirps.sum()
  .divide(RAIN_YEARS)
  .rename('annual_rain_mm')
  .clip(aoi);

// Broad rainfall suitability for restoration establishment.
// Tune these thresholds with local ecological expertise.
var rainfallFit = fuzzyRange(
  annualRain,
  300,   // too dry below this
  650,   // good starts
  1600,  // good ends
  2400   // too wet / different ecology above this
).rename('rainfall_fit');


/***********************
11. SOILS: SOILGRIDS WATER HOLDING PROXY
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

// SoilGrids water values are stored in 10^-3 cm3/cm3.
// Convert to cm3/cm3 before applying 0.04-0.18 thresholds.
var plantAvailableWater = fieldCapacity33Raw
  .subtract(wiltingPoint1500Raw)
  .multiply(0.001)
  .rename('soil_pawc_0_30cm_cm3cm3');

var soilWaterFit = plantAvailableWater
  .unitScale(0.04, 0.18)
  .clamp(0, 1)
  .rename('soil_water_fit');


/***********************
12. TERRAIN: SRTM
***********************/

var elevation = ee.Image('USGS/SRTMGL1_003')
  .select('elevation')
  .clip(aoi);

var slope = ee.Terrain.slope(elevation)
  .rename('slope_deg');

// Accessibility / feasibility proxy.
// Lower slopes are easier; very steep slopes are penalized.
var terrainFit = ee.Image(1)
  .subtract(slope.unitScale(8, 30).clamp(0, 1))
  .rename('terrain_access_fit');

// Erosion opportunity: moderate slopes on restorable land.
var erosionOpportunity = slope.unitScale(5, 25)
  .clamp(0, 1)
  .multiply(restorableShareBand)
  .rename('erosion_opportunity');


/***********************
13. SAFEGUARDS: WDPA + POPULATION
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

// Near protected area = possible biodiversity corridor / buffer opportunity.
// This is not a permission layer; it is a screening layer.
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

var existingTreeMaskRaw = treeRaw.or(treeCover2000.gt(0.30))
  .rename('existing_tree_cover_raw');

var existingTreeShare = fractionAtAnalysisScale(
  existingTreeMaskRaw,
  'existing_tree_cover_share'
);

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

// Population proxy for livelihood impact.
// We favor places near people but avoid dense settlement pressure.
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
14. BIODIVERSITY + WATER/SOIL PROXIES
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

// Final validity mask.
// This avoids clearly unsuitable places for first-pass tree/restoration investment.
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
  'valid_restoration_land'
);

var validRestorationMask = validRestorationLand
  .gte(MIN_VALID_RESTORATION_SHARE)
  .rename('valid_restoration_mask');


/***********************
15. PLANT / RESTORATION OPTION FILTERS
***********************/

// These are MVP ecological screening ranges, not final prescriptions.
// Replace them with CIFOR-ICRAF / MEFCC-WRI species suitability rasters when available.
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

  var fit = rainScore.multiply(0.45)
    .add(elevScore.multiply(0.35))
    .add(slopeScore.multiply(0.15))
    .add(moistureScore.multiply(0.05))
    .clamp(0, 1)
    .rename('plant_fit');

  return fit;
}

function combinedPlantFit() {
  var chosen = PLANTS.filter(function(p) {
    return selectedPlants[p.name];
  });

  // If nothing is selected, treat plant suitability as neutral.
  if (chosen.length === 0) {
    return ee.Image(1).clip(aoi).rename('plant_fit');
  }

  var images = chosen.map(function(p) {
    return plantSuitability(p);
  });

  // Max means: show best matching selected option for each location.
  return ee.ImageCollection.fromImages(images)
    .max()
    .rename('plant_fit');
}


/***********************
16. UI PANEL
***********************/

var panel = ui.Panel({
  style: {
    width: '390px',
    padding: '8px'
  }
});

ui.root.insert(0, panel);

panel.add(ui.Label({
  value: 'Restoration ROI Explorer — Ethiopia MVP',
  style: {
    fontWeight: 'bold',
    fontSize: '18px',
    margin: '0 0 8px 0'
  }
}));

panel.add(ui.Label(
  'Goal: prioritize restoration grid cells by ecological ROI: carbon, soil/water, biodiversity, degradation, plant suitability and livelihood access.'
));

panel.add(ui.Label({
  value: 'Color logic: Green = high priority / good candidate, Yellow = medium, Red = lower priority.',
  style: {
    fontWeight: 'bold',
    margin: '6px 0 6px 0'
  }
}));

panel.add(ui.Label({
  value: 'Plant / restoration filters',
  style: {
    fontWeight: 'bold',
    margin: '10px 0 4px 0'
  }
}));

var searchBox = ui.Textbox({
  placeholder: 'Search plant / option...',
  onChange: function(text) {
    redrawPlantList(text);
  },
  style: {
    stretch: 'horizontal'
  }
});

panel.add(searchBox);

var plantListPanel = ui.Panel({
  style: {
    maxHeight: '190px',
    stretch: 'horizontal'
  }
});

panel.add(plantListPanel);

function redrawPlantList(filterText) {
  plantListPanel.clear();

  var q = String(filterText || '').toLowerCase();

  PLANTS.forEach(function(p) {
    if (p.name.toLowerCase().indexOf(q) !== -1) {
      var cb = ui.Checkbox({
        label: p.name,
        value: selectedPlants[p.name],
        onChange: function(value) {
          selectedPlants[p.name] = value;
        }
      });
      plantListPanel.add(cb);
    }
  });
}

redrawPlantList('');

var buttonRow = ui.Panel({
  layout: ui.Panel.Layout.flow('horizontal'),
  style: {
    margin: '8px 0 8px 0'
  }
});

var selectAllButton = ui.Button({
  label: 'Select all',
  onClick: function() {
    PLANTS.forEach(function(p) {
      selectedPlants[p.name] = true;
    });
    redrawPlantList(searchBox.getValue());
  }
});

var selectNoneButton = ui.Button({
  label: 'Clear',
  onClick: function() {
    PLANTS.forEach(function(p) {
      selectedPlants[p.name] = false;
    });
    redrawPlantList(searchBox.getValue());
  }
});

var recalcButton = ui.Button({
  label: 'Recalculate map',
  onClick: updateMap,
  style: {
    stretch: 'horizontal'
  }
});

buttonRow.add(selectAllButton);
buttonRow.add(selectNoneButton);
panel.add(buttonRow);
panel.add(recalcButton);

var inspector = ui.Panel({
  style: {
    margin: '10px 0 0 0',
    padding: '6px',
    border: '1px solid #cccccc'
  }
});

inspector.add(ui.Label({
  value: 'Click a map cell to inspect score drivers.',
  style: {
    fontWeight: 'bold'
  }
}));

panel.add(inspector);


/***********************
17. MAIN MAP UPDATE
***********************/

var currentGridStats;
var currentScoreStack;

function updateMap() {
  clearMapLayers();

  var plantFit = combinedPlantFit();

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

  var scoreStack = restorationScore100
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
    .addBands(nearProtectedArea.rename('near_protected_area'))
    .addBands(existingTreeShare.rename('existing_tree_cover_share'))
    .addBands(nearExistingTreeCover.rename('near_existing_tree_cover'))
    .addBands(restorableShareBand.rename('restorable_land_share'))
    .addBands(builtUpShareBand.rename('built_up_share'))
    .addBands(waterWetlandShareBand.rename('water_wetland_mangrove_share'))
    .addBands(validRestorationLand.rename('valid_restoration_land'))
    .addBands(validRestorationMask.rename('valid_restoration_mask'));

  currentScoreStack = scoreStack;

  var grid = makeGrid(aoi, GRID_SIZE_M);

  var gridStats = scoreStack.reduceRegions({
    collection: grid,
    reducer: ee.Reducer.mean(),
    scale: SCORE_SCALE_M,
    crs: ANALYSIS_PROJECTION,
    tileScale: 4
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
    var settlementPressure = ee.Number(f.get('settlement_pressure_1km_pct')).divide(100).max(0).min(1);
    var protectedShare = ee.Number(f.get('protected_area_share')).max(0).min(1);

    var validAreaHa = areaHa.multiply(validShare);
    var targetProjectAreaHa = validAreaHa.min(MAX_PROJECT_AREA_HA);
    var estimatedCostMillionEur = targetProjectAreaHa.multiply(COST_EUR_PER_HA).divide(1000000);
    var environmentalRoi = s.divide(estimatedCostMillionEur.add(0.1));

    var hardExclusion = settlementPressure.gt(MAX_SETTLEMENT_PRESSURE_MEAN)
      .or(builtShare.gt(MAX_BUILTUP_SHARE))
      .or(waterWetlandShare.gt(MAX_WATER_WETLAND_SHARE))
      .or(validShare.lt(MIN_VALID_RESTORATION_SHARE));

    var candidateOk = ee.Number(ee.Algorithms.If(hardExclusion, 0, 1));

    var eligibilityStatus = ee.String(
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
      protected_area_pct: protectedShare.multiply(100),
      target_project_area_ha: targetProjectAreaHa,
      estimated_cost_million_eur: estimatedCostMillionEur,
      environmental_roi: environmentalRoi,

      grid_size_m: GRID_SIZE_M,
      score_scale_m: SCORE_SCALE_M,
      score_formula: 'ROI = carbon 25%, water/soil 25%, biodiversity 25%, livelihood 15%, degradation 10%, multiplied by selected plant suitability and masked by safeguards',
      color_logic: 'Green >= 70, Yellow 45-69.9, Red < 45. Green means stronger restoration candidate.',
      explanation: 'Screening result only. RestoreAI combines Sentinel-2, Sentinel-1, Landsat, ESA WorldCover, Hansen GFC, CHIRPS, SoilGrids, SRTM, WDPA, GHSL population and biomass carbon data. Final decisions require local expert validation.'
    });
  });

  currentGridStats = gridStats;

  var topCells = gridStats
    .sort('restoration_score', false)
    .limit(TOP_N_CELLS);

  print('Top candidate grid cells', topCells);

  // Visualization layers.
  Map.addLayer(
    s2Med,
    {
      bands: ['B4', 'B3', 'B2'],
      min: 0,
      max: 0.3
    },
    'Sentinel-2 RGB composite',
    false
  );

  Map.addLayer(
    ndviCurrent,
    {
      min: 0,
      max: 0.8,
      palette: ['8c510a', 'f6e8c3', '01665e']
    },
    'Current NDVI',
    false
  );

  Map.addLayer(
    worldCover,
    {
      min: 10,
      max: 100,
      palette: [
        '006400', 'ffbb22', 'ffff4c', 'f096ff', 'fa0000',
        'b4b4b4', 'f0f0f0', '0064c8', '0096a0', '00cf75',
        'fae6a0'
      ]
    },
    'ESA WorldCover 2021',
    false
  );

  Map.addLayer(
    annualRain,
    {
      min: 300,
      max: 2200,
      palette: ['8c510a', 'f6e8c3', '80cdc1', '01665e']
    },
    'CHIRPS mean annual rainfall',
    false
  );

  Map.addLayer(
    carbon2010,
    {
      min: 0,
      max: 180,
      palette: ['f7fcf5', 'c7e9c0', '74c476', '238b45', '00441b']
    },
    'Carbon stock 2010, tonnes C/ha',
    false
  );

  Map.addLayer(
    protectedAreaShare.updateMask(protectedAreaShare.gt(0)),
    {
      min: 0,
      max: 1,
      palette: ['b3cde3', '2c7bb6']
    },
    'WDPA protected area share',
    true
  );

  Map.addLayer(
    restorationScore100,
    {
      min: 0,
      max: 100,
      palette: ['d73027', 'fee08b', '1a9850']
    },
    'Restoration ROI score raster',
    true
  );

  Map.addLayer(
    gridStats
      .filter(ee.Filter.gte('restoration_score', HIGH_PRIORITY_THRESHOLD))
      .style({
        color: '006837',
        fillColor: '1a985066',
        width: 1
      }),
    {},
    'GREEN cells: high priority',
    true
  );

  Map.addLayer(
    gridStats
      .filter(ee.Filter.and(
        ee.Filter.gte('restoration_score', MEDIUM_PRIORITY_THRESHOLD),
        ee.Filter.lt('restoration_score', HIGH_PRIORITY_THRESHOLD)
      ))
      .style({
        color: 'fdae61',
        fillColor: 'fee08b66',
        width: 1
      }),
    {},
    'YELLOW cells: medium priority',
    true
  );

  Map.addLayer(
    gridStats
      .filter(ee.Filter.lt('restoration_score', MEDIUM_PRIORITY_THRESHOLD))
      .style({
        color: 'a50026',
        fillColor: 'd7302766',
        width: 1
      }),
    {},
    'RED cells: lower priority',
    false
  );

  Map.addLayer(
    topCells.style({
      color: '00ffff',
      fillColor: '00000000',
      width: 3
    }),
    {},
    'Top candidate cells',
    true
  );

  Map.addLayer(
    aoiFc.style({
      color: 'ffffff',
      fillColor: '00000000',
      width: 2
    }),
    {},
    'AOI boundary',
    true
  );

  inspector.clear();
  inspector.add(ui.Label({
    value: 'Map recalculated. Click a cell to inspect score drivers.',
    style: {
      fontWeight: 'bold'
    }
  }));
  inspector.add(ui.Label('Exports include ROI class, eligibility status, recommendation, project area, estimated cost and environmental ROI.'));
}


/***********************
18. MAP CLICK INSPECTOR
***********************/

function fmt(value, digits) {
  if (value === null || value === undefined) return 'n/a';
  return Number(value).toFixed(digits);
}

Map.onClick(function(coords) {
  if (!currentScoreStack) {
    return;
  }

  inspector.clear();
  inspector.add(ui.Label('Loading clicked location...'));

  var point = ee.Geometry.Point([coords.lon, coords.lat]);

  var values = currentScoreStack.reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: point,
    scale: SCORE_SCALE_M,
    crs: ANALYSIS_PROJECTION,
    maxPixels: 1e6
  });

  values.evaluate(function(d) {
    inspector.clear();

    if (!d || d.restoration_score === null || d.restoration_score === undefined) {
      inspector.add(ui.Label('No valid restoration score at this location.'));
      return;
    }

    var score = Number(d.restoration_score);
    var cls = score >= HIGH_PRIORITY_THRESHOLD ? 'GREEN' : score >= MEDIUM_PRIORITY_THRESHOLD ? 'YELLOW' : 'RED';

    inspector.add(ui.Label({
      value: 'Clicked location score: ' + fmt(score, 1) + ' / 100 — ' + cls,
      style: {
        fontWeight: 'bold'
      }
    }));

    inspector.add(ui.Label('Plant fit: ' + fmt(d.plant_fit, 1)));
    inspector.add(ui.Label('Carbon proxy: ' + fmt(d.carbon_proxy, 1)));
    inspector.add(ui.Label('Soil/water proxy: ' + fmt(d.water_soil_proxy, 1)));
    inspector.add(ui.Label('Biodiversity proxy: ' + fmt(d.biodiversity_proxy, 1)));
    inspector.add(ui.Label('Livelihood proxy: ' + fmt(d.livelihood_proxy, 1)));
    inspector.add(ui.Label('Degradation proxy: ' + fmt(d.degradation_proxy, 1)));
    inspector.add(ui.Label('Mean annual rainfall mm: ' + fmt(d.annual_rain_mm, 0)));
    inspector.add(ui.Label('Current NDVI: ' + fmt(d.current_ndvi, 2)));
    inspector.add(ui.Label('Current NDMI: ' + fmt(d.current_ndmi, 2)));
    inspector.add(ui.Label('Slope degrees: ' + fmt(d.slope_deg, 1)));
    inspector.add(ui.Label('Elevation m: ' + fmt(d.elevation_m, 0)));
    inspector.add(ui.Label('Soil PAWC 0-30 cm cm3/cm3: ' + fmt(d.soil_pawc_0_30cm_cm3cm3, 3)));
    inspector.add(ui.Label('Carbon t C/ha 2010: ' + fmt(d.carbon_tonnes_per_ha_2010, 1)));
    inspector.add(ui.Label('Protected-area share: ' + fmt(Number(d.protected_area_share) * 100, 1) + '%'));
    inspector.add(ui.Label('Valid restoration land share: ' + fmt(Number(d.valid_restoration_land) * 100, 1) + '%'));
    inspector.add(ui.Label('Restorable land share: ' + fmt(Number(d.restorable_land_share) * 100, 1) + '%'));
    inspector.add(ui.Label('Built-up share: ' + fmt(Number(d.built_up_share) * 100, 1) + '%'));
    inspector.add(ui.Label('Water/wetland/mangrove share: ' + fmt(Number(d.water_wetland_mangrove_share) * 100, 1) + '%'));
  });
});


/***********************
19. EXPORT BUTTON
***********************/

var exportButton = ui.Button({
  label: 'Create export tasks',
  onClick: function() {
    if (!currentGridStats || !currentScoreStack) {
      print('Run Recalculate map first.');
      return;
    }

    var exportCollection = currentGridStats.sort('restoration_score', false);
    var topExportCells = exportCollection
      .filter(ee.Filter.eq('candidate_ok', 1))
      .limit(TOP_N_CELLS);

    Export.table.toDrive({
      collection: exportCollection,
      description: 'restoreai_ethiopia_roi_grid_scores_csv',
      fileNamePrefix: 'restoreai_ethiopia_roi_grid_scores',
      fileFormat: 'CSV'
    });

    Export.table.toDrive({
      collection: exportCollection,
      description: 'restoreai_ethiopia_roi_grid_scores_geojson',
      fileNamePrefix: 'restoreai_ethiopia_roi_grid_scores',
      fileFormat: 'GeoJSON'
    });

    Export.table.toDrive({
      collection: topExportCells,
      description: 'restoreai_top_candidate_cells_google_earth_kml',
      fileNamePrefix: 'restoreai_top_candidate_cells_google_earth',
      fileFormat: 'KML'
    });

    Export.image.toDrive({
      image: currentScoreStack.select('restoration_score').toFloat(),
      description: 'restoreai_ethiopia_roi_score_raster_geotiff',
      fileNamePrefix: 'restoreai_ethiopia_roi_score_raster',
      region: aoi,
      scale: SCORE_SCALE_M,
      crs: 'EPSG:3857',
      maxPixels: 1e13,
      fileFormat: 'GeoTIFF',
      formatOptions: {
        cloudOptimized: true
      }
    });

    print('Export tasks created: CSV, GeoJSON, KML and GeoTIFF. Open the Tasks tab and click Run.');
  },
  style: {
    stretch: 'horizontal',
    margin: '8px 0 0 0'
  }
});

panel.add(exportButton);


/***********************
20. INITIAL RUN
***********************/

updateMap();