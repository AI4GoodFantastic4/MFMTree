/***************************************************************
RESTOREAI ETHIOPIA — LOW-COMPUTE ECOLOGICAL INVESTOR INPUTS

Goal:
- All Ethiopia
- 15 km grid
- 500 m analysis scale
- One GeoJSON export
- No final investment score in GEE
- No hardcoded plant species
- Loveable app performs dynamic scoring

Performance design:
- Uses Geometry.coveringGrid instead of reduceToVectors grid creation
- Removes long Sentinel-2 time-series standard deviation
- Removes annual CHIRPS variability loop
- Removes focal population calculations
- Removes WDPA / RESOLVE painting for this low-compute version
- Avoids many reduceResolution/reproject operations
- Splits reduceRegions into small thematic blocks
- Removes long per-feature explanation strings
***************************************************************/


/***********************
0. CONFIGURATION
***********************/

var COUNTRY_NAME = 'Ethiopia';

var GRID_SIZE_M = 15000;
var ANALYSIS_SCALE_M = 500;
var ANALYSIS_PROJECTION = ee.Projection('EPSG:3857').atScale(ANALYSIS_SCALE_M);

var CURRENT_YEAR = 2025;
var MIN_YEARS_SINCE_FOREST_LOSS = 10;

// Sentinel-2: short recent window only.
var S2_START = '2023-01-01';
var S2_END   = '2025-01-01';

// Rainfall: 5-year recent mean to reduce compute.
var RAIN_START = '2020-01-01';
var RAIN_END   = '2025-01-01';
var RAIN_YEARS = 5;

// Safeguard thresholds.
var MAX_BUILTUP_SHARE = 0.10;
var MAX_WATER_WETLAND_SHARE = 0.05;
var MAX_STEEP_SLOPE_SHARE = 0.35;
var MAX_SETTLEMENT_PRESSURE = 0.70;

var MIN_VALID_CANDIDATE_SHARE = 0.10;

var CROPLAND_REVIEW_SHARE = 0.10;
var OPEN_ECOSYSTEM_REVIEW_SHARE = 0.30;
var LOW_VEGETATION_REVIEW_SHARE = 0.20;
var HIGH_UNCERTAINTY_THRESHOLD = 0.60;


/***********************
1. AOI — ALL ETHIOPIA
***********************/

var aoi = ee.FeatureCollection('FAO/GAUL/2015/level0')
  .filter(ee.Filter.eq('ADM0_NAME', COUNTRY_NAME))
  .geometry()
  .dissolve(100);


/***********************
2. HELPERS
***********************/

function fuzzyRange(img, minVal, optMin, optMax, maxVal) {
  img = ee.Image(img);
  var left = img.subtract(minVal).divide(optMin - minVal);
  var right = ee.Image(maxVal).subtract(img).divide(maxVal - optMax);
  return left.min(right).clamp(0, 1);
}

function pct(mask, name) {
  return ee.Image(mask)
    .unmask(0)
    .toFloat()
    .multiply(100)
    .rename(name);
}

function unit(mask, name) {
  return ee.Image(mask)
    .unmask(0)
    .toFloat()
    .rename(name);
}

function makeGrid(region, scaleMeters) {
  var proj = ee.Projection('EPSG:3857').atScale(scaleMeters);

  var rawGrid = ee.FeatureCollection(
    region.coveringGrid(proj, scaleMeters)
  ).filterBounds(region);

  return rawGrid.map(function(f) {
    var geom = f.geometry().intersection(region, 100);

    var centroid = geom.centroid(100).coordinates();
    var lonId = ee.Number(centroid.get(0)).multiply(10000).round().format();
    var latId = ee.Number(centroid.get(1)).multiply(10000).round().format();

    var gridId = ee.String(lonId).cat('_').cat(latId);

    return ee.Feature(geom).set({
      grid_id: gridId
    });
  });
}

function addMeanBands(fc, image) {
  return ee.Image(image).reduceRegions({
    collection: fc,
    reducer: ee.Reducer.mean(),
    scale: ANALYSIS_SCALE_M,
    crs: ANALYSIS_PROJECTION,
    tileScale: 16,
    maxPixelsPerRegion: 4096
  });
}


/***********************
3. SENTINEL-2 CURRENT VEGETATION
***********************/

function maskS2(img) {
  var scl = img.select('SCL');

  var mask = scl.neq(3)
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));

  return img.select(['B4', 'B8', 'B11'])
    .multiply(0.0001)
    .updateMask(mask)
    .copyProperties(img, ['system:time_start']);
}

var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(S2_START, S2_END)
  .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', 80))
  .map(maskS2);

var s2Median = s2.median().clip(aoi);

var ndviCurrent = s2Median.normalizedDifference(['B8', 'B4'])
  .rename('ndvi_current');

var ndmiCurrent = s2Median.normalizedDifference(['B8', 'B11'])
  .rename('ndmi_current');

var s2ObservationCount = s2.select('B4')
  .count()
  .clip(aoi)
  .rename('s2_observation_count');


/***********************
4. ESA WORLDCOVER
***********************/

var worldCover = ee.ImageCollection('ESA/WorldCover/v200')
  .first()
  .select('Map')
  .clip(aoi);

var tree = worldCover.eq(10);
var shrub = worldCover.eq(20);
var grass = worldCover.eq(30);
var cropland = worldCover.eq(40);
var built = worldCover.eq(50);
var bare = worldCover.eq(60);
var snowIce = worldCover.eq(70);
var waterWetland = worldCover.eq(80)
  .or(worldCover.eq(90))
  .or(worldCover.eq(95));
var moss = worldCover.eq(100);

var openEcosystem = shrub.or(grass);
var ecologicalRestorable = shrub.or(grass).or(bare);


/***********************
5. HANSEN FOREST HISTORY — 10 YEAR CLEARED LAND
***********************/

var gfc = ee.Image('UMD/hansen/global_forest_change_2025_v1_13')
  .clip(aoi);

var lossYear = gfc.select('lossyear').unmask(0);

var forestLossYear = lossYear
  .where(lossYear.gt(0), lossYear.add(2000))
  .rename('forest_loss_year');

var yearsSinceForestLoss = ee.Image(CURRENT_YEAR)
  .subtract(forestLossYear)
  .updateMask(lossYear.gt(0))
  .rename('years_since_forest_loss');

var oldForestLoss10y = lossYear.gt(0)
  .and(yearsSinceForestLoss.gte(MIN_YEARS_SINCE_FOREST_LOSS))
  .rename('old_forest_loss_10y');

var currentNonForestEvidence = tree.not()
  .and(ndviCurrent.lte(0.45))
  .and(built.not())
  .and(waterWetland.not())
  .rename('current_non_forest_evidence');

var lowRegrowthProbability = ee.Image(1)
  .subtract(ndviCurrent.unitScale(0.45, 0.75).clamp(0, 1))
  .rename('low_regrowth_probability');

var forestRegrowthProbability = ndviCurrent
  .unitScale(0.45, 0.75)
  .clamp(0, 1)
  .rename('forest_regrowth_probability');

var longTermClearedRaw = oldForestLoss10y
  .and(currentNonForestEvidence)
  .rename('long_term_cleared_raw');

var longTermClearedConfidence = oldForestLoss10y.toFloat().multiply(0.50)
  .add(currentNonForestEvidence.toFloat().multiply(0.35))
  .add(lowRegrowthProbability.multiply(0.15))
  .clamp(0, 1)
  .rename('long_term_cleared_confidence');


/***********************
6. CLIMATE, SOIL, TERRAIN
***********************/

var chirps = ee.ImageCollection('UCSB-CHG/CHIRPS/DAILY')
  .filterBounds(aoi)
  .filterDate(RAIN_START, RAIN_END)
  .select('precipitation');

var annualRain = chirps.sum()
  .divide(RAIN_YEARS)
  .clip(aoi)
  .rename('annual_rain_mm');

var rainfallFit = fuzzyRange(
  annualRain,
  250,
  600,
  1600,
  2600
).rename('rainfall_fit');

var soilBands = [
  'val_0_5cm_mean',
  'val_5_15cm_mean',
  'val_15_30cm_mean'
];

var fieldCapacity = ee.Image('ISRIC/SoilGrids250m/v2_0/wv0033')
  .select(soilBands)
  .reduce(ee.Reducer.mean());

var wiltingPoint = ee.Image('ISRIC/SoilGrids250m/v2_0/wv1500')
  .select(soilBands)
  .reduce(ee.Reducer.mean());

var soilPAWC = fieldCapacity.subtract(wiltingPoint)
  .multiply(0.001)
  .rename('soil_pawc_0_30cm');

var soilWaterFit = soilPAWC
  .unitScale(0.04, 0.18)
  .clamp(0, 1)
  .rename('soil_water_fit');

var elevation = ee.Image('USGS/SRTMGL1_003')
  .select('elevation')
  .clip(aoi);

var slope = ee.Terrain.slope(elevation)
  .rename('slope_deg');

var terrainFit = ee.Image(1)
  .subtract(slope.unitScale(8, 30).clamp(0, 1))
  .rename('terrain_fit');


/***********************
7. CARBON
***********************/

var carbon2010 = ee.Image('WCMC/biomass_carbon_density/v1_0/2010')
  .select('carbon_tonnes_per_ha')
  .clip(aoi);

var lowExistingCarbon = ee.Image(1)
  .subtract(carbon2010.unitScale(5, 150).clamp(0, 1))
  .rename('low_existing_carbon');


/***********************
8. POPULATION / SETTLEMENT PRESSURE
No focal_mean to reduce compute.
***********************/

var pop2025 = ee.Image('JRC/GHSL/P2023A/GHS_POP/2025')
  .select('population_count')
  .unmask(0)
  .clip(aoi);

var settlementPressure = pop2025
  .unitScale(10, 50)
  .clamp(0, 1)
  .rename('settlement_pressure');


/***********************
9. ECOLOGICAL VALIDITY MASKS
***********************/

var lowVegetationSparseRaw = ecologicalRestorable
  .and(ndviCurrent.lte(0.35))
  .and(tree.not())
  .and(built.not())
  .and(waterWetland.not())
  .and(snowIce.not())
  .and(moss.not())
  .rename('low_vegetation_sparse_raw');

var validRestorationRaw = ecologicalRestorable
  .and(built.not())
  .and(waterWetland.not())
  .and(snowIce.not())
  .and(moss.not())
  .and(slope.lte(35))
  .and(annualRain.gte(250))
  .and(annualRain.lte(2600))
  .rename('valid_restoration_raw');

// This is the strict candidate mask:
// ecologically restorable AND forest cleared 10+ years ago AND still non-forest today.
var validCandidate10yClearedRaw = validRestorationRaw
  .and(longTermClearedRaw)
  .rename('valid_candidate_10y_cleared_raw');


/***********************
10. OPEN ECOSYSTEM CONVERSION RISK
Ecological safeguard against planting trees in naturally open systems.
***********************/

var openEcosystemConversionRiskRaw = openEcosystem
  .and(lossYear.eq(0))
  .and(tree.not())
  .and(ndviCurrent.lte(0.45))
  .rename('open_ecosystem_conversion_risk_raw');


/***********************
11. GEE-DERIVED RESTORATION SYSTEMS
No hardcoded plant species.
***********************/

var drylandSystem = annualRain.lt(700)
  .and(elevation.lt(1800))
  .rename('dryland_system');

var highlandSystem = elevation.gte(1800)
  .and(annualRain.gte(650))
  .rename('highland_system');

var moistSystem = annualRain.gte(900)
  .and(ndmiCurrent.gte(0.05))
  .rename('moist_system');

var riparianWaterSensitiveSystem = waterWetland
  .or(ndmiCurrent.gte(0.20))
  .rename('riparian_water_sensitive_system');

var erosionControlSystem = slope.gte(12)
  .or(ndviCurrent.lte(0.25))
  .rename('erosion_control_system');

var agroforestryReviewSystem = cropland
  .rename('agroforestry_review_system');

var restorationSystemFit = rainfallFit.multiply(0.35)
  .add(soilWaterFit.multiply(0.25))
  .add(terrainFit.multiply(0.20))
  .add(ndmiCurrent.unitScale(-0.20, 0.35).clamp(0, 1).multiply(0.10))
  .add(longTermClearedConfidence.multiply(0.10))
  .clamp(0, 1)
  .rename('restoration_system_fit');


/***********************
12. RESTORATION GAIN INPUTS
These are not final investment scores.
***********************/

var vegetationGain = ee.Image(1)
  .subtract(ndviCurrent.unitScale(0.15, 0.75).clamp(0, 1))
  .multiply(validCandidate10yClearedRaw)
  .rename('vegetation_gain');

var carbonGain = lowExistingCarbon
  .multiply(validCandidate10yClearedRaw)
  .rename('carbon_gain');

var soilWaterGain = rainfallFit
  .multiply(soilWaterFit)
  .multiply(terrainFit)
  .multiply(validCandidate10yClearedRaw)
  .rename('soil_water_gain');

var degradationRecovery = vegetationGain
  .multiply(longTermClearedConfidence)
  .rename('degradation_recovery');

var habitatRecoveryGain = restorationSystemFit
  .multiply(ee.Image(1).subtract(settlementPressure))
  .multiply(ee.Image(1).subtract(unit(openEcosystemConversionRiskRaw, 'tmp_open_risk')))
  .multiply(validCandidate10yClearedRaw)
  .rename('habitat_recovery_gain');

var restorationGain = vegetationGain
  .add(carbonGain)
  .add(soilWaterGain)
  .add(degradationRecovery)
  .add(habitatRecoveryGain)
  .divide(5)
  .clamp(0, 1)
  .rename('restoration_gain');

var restorationAdditionality = restorationGain
  .multiply(longTermClearedConfidence)
  .multiply(ee.Image(1).subtract(forestRegrowthProbability))
  .rename('restoration_additionality');


/***********************
13. DATA CONFIDENCE / MRV READINESS
Low-compute version.
***********************/

var dataCompleteness = s2ObservationCount
  .unitScale(10, 50)
  .clamp(0, 1)
  .rename('data_completeness');

var remoteSensingUncertainty = ee.Image(1)
  .subtract(dataCompleteness.multiply(0.60))
  .add(unit(openEcosystemConversionRiskRaw, 'tmp_open_uncertainty').multiply(0.20))
  .add(unit(cropland, 'tmp_cropland_uncertainty').multiply(0.20))
  .clamp(0, 1)
  .rename('remote_sensing_uncertainty');

var mrvReadiness = dataCompleteness
  .multiply(ee.Image(1).subtract(remoteSensingUncertainty))
  .rename('mrv_readiness');


/***********************
14. THEMATIC EXPORT STACKS
Small stacks reduce memory pressure.
***********************/

var gainStack = ee.Image.cat([
  restorationGain.multiply(100).rename('restoration_gain_pct'),
  vegetationGain.multiply(100).rename('vegetation_gain_pct'),
  carbonGain.multiply(100).rename('carbon_gain_pct'),
  soilWaterGain.multiply(100).rename('soil_water_gain_pct'),
  habitatRecoveryGain.multiply(100).rename('habitat_recovery_gain_pct'),
  degradationRecovery.multiply(100).rename('degradation_recovery_pct'),
  restorationAdditionality.multiply(100).rename('restoration_additionality_pct')
]);

var landHistoryStack = ee.Image.cat([
  pct(oldForestLoss10y, 'forest_loss_10y_plus_pct'),
  pct(currentNonForestEvidence, 'current_non_forest_evidence_pct'),
  pct(longTermClearedRaw, 'long_term_cleared_pct'),
  longTermClearedConfidence.multiply(100).rename('long_term_cleared_confidence_pct'),
  forestRegrowthProbability.multiply(100).rename('forest_regrowth_probability_pct')
]);

var biophysicalStack = ee.Image.cat([
  annualRain.rename('annual_rain_mm'),
  rainfallFit.multiply(100).rename('rainfall_fit_pct'),
  ndviCurrent.rename('ndvi_current'),
  ndmiCurrent.rename('ndmi_current'),
  soilWaterFit.multiply(100).rename('soil_water_fit_pct'),
  terrainFit.multiply(100).rename('terrain_fit_pct'),
  pct(slope.gt(35), 'steep_slope_pct'),
  lowExistingCarbon.multiply(100).rename('low_existing_carbon_pct')
]);

var landCoverRiskStack = ee.Image.cat([
  pct(ecologicalRestorable, 'ecological_restorable_pct'),
  pct(validRestorationRaw, 'valid_restoration_pct'),
  pct(validCandidate10yClearedRaw, 'valid_candidate_10y_cleared_pct'),
  pct(lowVegetationSparseRaw, 'low_vegetation_sparse_pct'),

  pct(tree, 'tree_pct'),
  pct(shrub, 'shrubland_pct'),
  pct(grass, 'grassland_pct'),
  pct(bare, 'bare_sparse_pct'),
  pct(cropland, 'cropland_pct'),
  pct(built, 'built_up_pct'),
  pct(waterWetland, 'water_wetland_pct'),
  pct(openEcosystem, 'open_ecosystem_pct'),
  pct(openEcosystemConversionRiskRaw, 'open_ecosystem_conversion_risk_pct'),

  settlementPressure.multiply(100).rename('settlement_pressure_pct')
]);

var restorationSystemStack = ee.Image.cat([
  restorationSystemFit.multiply(100).rename('restoration_system_fit_pct'),
  unit(drylandSystem, 'dryland_system'),
  unit(highlandSystem, 'highland_system'),
  unit(moistSystem, 'moist_system'),
  unit(riparianWaterSensitiveSystem, 'riparian_water_sensitive_system'),
  unit(erosionControlSystem, 'erosion_control_system'),
  unit(agroforestryReviewSystem, 'agroforestry_review_system')
]);

var confidenceStack = ee.Image.cat([
  s2ObservationCount.rename('s2_observation_count'),
  dataCompleteness.multiply(100).rename('data_completeness_pct'),
  remoteSensingUncertainty.multiply(100).rename('remote_sensing_uncertainty_pct'),
  mrvReadiness.multiply(100).rename('mrv_readiness_pct')
]);


/***********************
15. GRID REDUCTION — MODULAR
***********************/

var grid = makeGrid(aoi, GRID_SIZE_M);

var gridStats = grid;
gridStats = addMeanBands(gridStats, gainStack);
gridStats = addMeanBands(gridStats, landHistoryStack);
gridStats = addMeanBands(gridStats, biophysicalStack);
gridStats = addMeanBands(gridStats, landCoverRiskStack);
gridStats = addMeanBands(gridStats, restorationSystemStack);
gridStats = addMeanBands(gridStats, confidenceStack);

gridStats = gridStats.filter(
  ee.Filter.notNull(['restoration_gain_pct'])
);


/***********************
16. FLAGS AND SMALL APP-FRIENDLY METADATA
No long strings per feature.
***********************/

gridStats = gridStats.map(function(f) {
  var validCandidatePct = ee.Number(f.get('valid_candidate_10y_cleared_pct')).max(0).min(100);
  var builtPct = ee.Number(f.get('built_up_pct')).max(0).min(100);
  var waterPct = ee.Number(f.get('water_wetland_pct')).max(0).min(100);
  var steepPct = ee.Number(f.get('steep_slope_pct')).max(0).min(100);
  var settlementPct = ee.Number(f.get('settlement_pressure_pct')).max(0).min(100);

  var croplandPct = ee.Number(f.get('cropland_pct')).max(0).min(100);
  var openEcoPct = ee.Number(f.get('open_ecosystem_pct')).max(0).min(100);
  var openRiskPct = ee.Number(f.get('open_ecosystem_conversion_risk_pct')).max(0).min(100);
  var lowVegPct = ee.Number(f.get('low_vegetation_sparse_pct')).max(0).min(100);

  var clearedConfidencePct = ee.Number(f.get('long_term_cleared_confidence_pct')).max(0).min(100);
  var regrowthPct = ee.Number(f.get('forest_regrowth_probability_pct')).max(0).min(100);
  var uncertaintyPct = ee.Number(f.get('remote_sensing_uncertainty_pct')).max(0).min(100);

  var hardExclusion = builtPct.gt(MAX_BUILTUP_SHARE * 100)
    .or(waterPct.gt(MAX_WATER_WETLAND_SHARE * 100))
    .or(steepPct.gt(MAX_STEEP_SLOPE_SHARE * 100))
    .or(settlementPct.gt(MAX_SETTLEMENT_PRESSURE * 100))
    .or(validCandidatePct.lt(MIN_VALID_CANDIDATE_SHARE * 100));

  var ecologicalReview = openEcoPct.gt(OPEN_ECOSYSTEM_REVIEW_SHARE * 100)
    .or(openRiskPct.gt(40));

  var socialReview = croplandPct.gt(CROPLAND_REVIEW_SHARE * 100)
    .or(settlementPct.gt(35));

  var landHistoryReview = clearedConfidencePct.lt(50)
    .or(regrowthPct.gt(50));

  var lowVegetationReview = lowVegPct.lt(LOW_VEGETATION_REVIEW_SHARE * 100);

  var mrvReview = uncertaintyPct.gt(HIGH_UNCERTAINTY_THRESHOLD * 100);

  var dryland = ee.Number(f.get('dryland_system'));
  var highland = ee.Number(f.get('highland_system'));
  var moist = ee.Number(f.get('moist_system'));
  var riparian = ee.Number(f.get('riparian_water_sensitive_system'));
  var erosion = ee.Number(f.get('erosion_control_system'));
  var agroforestry = ee.Number(f.get('agroforestry_review_system'));

  var restorationSystemCode = ee.String(
    ee.Algorithms.If(
      agroforestry.gt(0.30),
      'AGROFORESTRY_REVIEW',
      ee.Algorithms.If(
        riparian.gt(0.30),
        'RIPARIAN_WATER_SENSITIVE',
        ee.Algorithms.If(
          erosion.gt(0.30),
          'EROSION_CONTROL_ANR',
          ee.Algorithms.If(
            moist.gt(0.30),
            'MOIST_RESTORATION',
            ee.Algorithms.If(
              highland.gt(0.30),
              'HIGHLAND_RESTORATION',
              ee.Algorithms.If(
                dryland.gt(0.30),
                'DRYLAND_RESTORATION',
                'MIXED_REVIEW'
              )
            )
          )
        )
      )
    )
  );

  var areaHa = f.geometry().area(100).divide(10000);
  var validCandidateAreaHa = areaHa.multiply(validCandidatePct).divide(100);

  return f.set({
    country: COUNTRY_NAME,
    grid_size_m: GRID_SIZE_M,
    analysis_scale_m: ANALYSIS_SCALE_M,
    area_ha: areaHa,
    valid_candidate_10y_cleared_area_ha: validCandidateAreaHa,

    hard_exclusion: ee.Number(ee.Algorithms.If(hardExclusion, 1, 0)),
    ecological_review_required: ee.Number(ee.Algorithms.If(ecologicalReview, 1, 0)),
    social_review_required: ee.Number(ee.Algorithms.If(socialReview, 1, 0)),
    land_history_review_required: ee.Number(ee.Algorithms.If(landHistoryReview, 1, 0)),
    low_vegetation_review_required: ee.Number(ee.Algorithms.If(lowVegetationReview, 1, 0)),
    mrv_review_required: ee.Number(ee.Algorithms.If(mrvReview, 1, 0)),

    restoration_system_code: restorationSystemCode
  });
});


/***********************
17. SINGLE GEOJSON EXPORT
***********************/

Export.table.toDrive({
  collection: gridStats,
  description: 'restoreai_ethiopia_15km_500m_low_compute_geojson',
  fileNamePrefix: 'restoreai_ethiopia_15km_500m_low_compute_inputs',
  fileFormat: 'GeoJSON'
});

// Keep prints minimal. Avoid gridStats.limit() preview, because it triggers extra computation.
print('Export task created.');
print('Run task: restoreai_ethiopia_15km_500m_low_compute_geojson');