# API Contract

Base URL is emitted by Terraform as `api_base_url`.

All responses are JSON.

## Area Schema

```json
{
  "areaId": "ET-001",
  "name": "Example Woreda",
  "region": "Southwest Ethiopia",
  "priorityScore": 86,
  "carbonScore": 82,
  "treeSurvivalScore": 78,
  "costEfficiencyScore": 74,
  "carbonCreditReadiness": "medium",
  "livelihoodScore": 80,
  "biodiversityScore": 68,
  "riskScore": 22,
  "riskFlags": ["biodiversity proxy only", "field validation required"],
  "recommendedAction": "High-priority field validation",
  "evidence": [
    "moderate rainfall reliability",
    "nearby communities",
    "manageable slope",
    "no strong recent-deforestation signal"
  ],
  "uncertainties": [
    "land tenure unknown",
    "species suitability needs local validation"
  ]
}
```

## Endpoints

### `GET /health`

Returns service status.

```json
{
  "status": "ok",
  "service": "mfmtree-api"
}
```

### `GET /areas`

Returns area metadata plus the latest backend-calculated scores. Lambda first
tries to join:

- `s3://<processed-bucket>/geometry/areas.geojson`
- `s3://<processed-bucket>/indicators/latest.json`

If S3 geometry is missing, local development can use `LOCAL_GEOJSON_PATH`
(`data/sample/areas.geojson` by default). Mock geometry is used only when
`ALLOW_MOCK_DATA=true`.

```json
{
  "geojson": {
    "type": "FeatureCollection",
    "features": []
  },
  "areas": [],
  "source": "s3"
}
```

`source` can be `s3`, `local`, or `mock`. Set `ALLOW_MOCK_DATA=false` to return
an error instead of silently serving mock geometry when real geometry is absent.

### `GET /areas/{areaId}`

Returns one area by id, with stable metadata/geometry, indicators, and dynamic
scores merged for API convenience.

### `GET /scores`

Returns the latest default deterministic backend scores keyed by stable
`areaId`. This endpoint lets the frontend recolor existing map entities without
regenerating or refetching geometry.

```json
{
  "scoresByArea": {
    "ET-001": {
      "areaId": "ET-001",
      "priorityScore": 82,
      "carbonScore": 76,
      "treeSurvivalScore": 72,
      "costEfficiencyScore": 71,
      "carbonCreditReadiness": "medium",
      "riskScore": 23
    }
  },
  "source": "mock"
}
```

### `GET /data-sources`

Returns the data-source catalog used by the GEE/GIS pipeline. Lambda first tries
`s3://<processed-bucket>/metadata/data_sources.json`; if that object is absent,
it returns the built-in catalog extracted from the original Earth Engine script.

```json
{
  "dataSources": [
    {
      "sourceId": "sentinel2_surface_reflectance",
      "name": "Sentinel-2 Surface Reflectance Harmonized",
      "provider": "Copernicus",
      "geeAssetId": "COPERNICUS/S2_SR_HARMONIZED",
      "category": "satellite_optical",
      "status": "gee_available",
      "usedFor": ["current NDVI", "current NDMI", "vegetation condition"]
    }
  ],
  "source": "s3"
}
```

### `GET /data-sources/{sourceId}`

Returns one data-source catalog entry.

### `GET /areas/{areaId}/cost-estimate`

Returns the deterministic planning cost estimate for one mock or processed area.

```json
{
  "areaId": "ET-001",
  "estimatedPlantableHa": 1260,
  "plantingDensityPerHa": 1100,
  "estimatedSeedlingsRequired": 1386000,
  "expectedSurvivalRate": 0.72,
  "expectedSurvivingTrees": 997920,
  "estimatedBasePlantingCost": 705600,
  "estimatedMaintenanceCost": 434700,
  "estimatedLogisticsCost": 69552,
  "estimatedReplantingMortalityBuffer": 77616,
  "estimatedFieldValidationCost": 690,
  "estimatedMrvMonitoringSetupCost": 5000,
  "estimatedCarbonProjectDevelopmentCost": 15000,
  "contingency": 196223.7,
  "estimatedTotalCost": 1504381.7,
  "estimatedCostPerHa": 1193.95,
  "estimatedCostPerSurvivingTree": 1.51,
  "estimatedNetTCO2e": 52436.16,
  "estimatedCostPerTCO2e": 28.69,
  "currency": "EUR",
  "costConfidence": "high",
  "costDrivers": ["moderate distance to road", "manageable slope"],
  "costWarnings": ["Cost values are configurable planning estimates, not financial commitments."]
}
```

### `POST /cost-estimate`

Accepts an indicator payload and optional assumptions override.

```json
{
  "indicators": {
    "areaId": "CUSTOM",
    "totalAreaHa": 1800,
    "plantableFraction": 0.7,
    "distanceToRoadKm": 8,
    "meanSlopeDeg": 9,
    "rainfallReliability": "medium",
    "soilSuitability": "medium",
    "protectedAreaConcern": "low",
    "recentDeforestationRisk": "low",
    "expectedSurvivalRate": 0.72,
    "expectedTCO2ePerHa": 68
  },
  "assumptionsOverride": {
    "seedlingUnitCost": 0.3
  }
}
```

The same endpoint also accepts indicators directly at the top level for quick
testing.

### `POST /areas/{areaId}/explain`

Returns a concise Bedrock or fallback explanation.

```json
{
  "areaId": "ET-001",
  "summary": "This area is a strong candidate for field validation...",
  "explanation": "This area is a strong candidate for field validation...",
  "recommendation": "High-priority field validation",
  "evidenceBullets": [
    "medium rainfall reliability",
    "9 degree mean slope"
  ],
  "risks": [
    "field validation required",
    "land tenure unknown"
  ],
  "caveat": "This is a pre-screening result and requires onsite expert validation.",
  "carbonCreditReadiness": "medium",
  "costEstimate": {}
}
```

The prompt instructs Bedrock to avoid invented scores, use only provided
evidence, explain uncertainty, frame the output as pre-screening, mention onsite
expert validation, avoid invented cost numbers, and keep language NGO-friendly.

When a cost estimate is available, the explanation includes provided cost
drivers and assumptions that need field validation.

### `POST /areas/{areaId}/field-brief`

Returns a field brief for one area including cost-validation questions:

- confirm actual plantable hectares
- confirm local seedling cost
- confirm local labor availability and cost
- confirm road/access constraints
- confirm water/rainfall constraints
- confirm land tenure
- confirm recent deforestation history
- confirm whether the carbon-credit pathway is realistic

### `POST /areas/{areaId}/carbon-readiness`

Returns a deterministic MVP readiness screen based on recent deforestation risk,
plantable area size, monitoring feasibility, land tenure uncertainty,
protected-area concern, and carbon potential.

```json
{
  "areaId": "ET-001",
  "carbonReadiness": "medium",
  "currentLabel": "medium",
  "strengths": [],
  "blockers": [],
  "caveats": [
    "Deterministic MVP screen only.",
    "Not carbon-credit certification.",
    "Onsite expert validation and legal review are required."
  ]
}
```

### `POST /budget-plan`

Accepts:

```json
{
  "budget": 100000,
  "currency": "EUR",
  "riskTolerance": "medium",
  "minimumCarbonCreditReadiness": "medium",
  "objective": "maximize_risk_adjusted_carbon_roi"
}
```

Returns a deterministic validation/investigation shortlist:

```json
{
  "budget": 100000,
  "currency": "EUR",
  "selectedAreas": [
    {
      "areaId": "ET-001",
      "name": "Example Woreda",
      "estimatedValidationOrInitialCost": 50821.45,
      "estimatedTotalProjectCost": 1504381.7,
      "carbonRoiScore": 52,
      "reason": "Priority 86, carbon readiness medium, high cost confidence, main driver: moderate distance to road"
    },
    {
      "areaId": "ET-005",
      "name": "Balanced Woreda Candidate",
      "estimatedValidationOrInitialCost": 39691.27,
      "estimatedTotalProjectCost": 1133375.6,
      "carbonRoiScore": 47,
      "reason": "Priority 76, carbon readiness medium, high cost confidence, main driver: moderate distance to road"
    }
  ],
  "estimatedSpend": 90512.72,
  "remainingBudget": 9487.28,
  "caveats": [
    "Uses configurable planning assumptions.",
    "Not a final project budget.",
    "Requires onsite expert validation."
  ]
}
```

### `POST /scenario`

Recalculates deterministic scores from indicator inputs and scenario weights.
Geometry is not changed.

Compares two areas when the request includes two ids:

```json
{
  "name": "Southwest comparison",
  "areaIds": ["ET-001", "ET-002"],
  "weights": {
    "carbon": 0.4,
    "survival": 0.2,
    "costEfficiency": 0.25,
    "livelihood": 0.05,
    "biodiversity": 0.05,
    "riskPenalty": 0.1
  }
}
```

Response:

```json
{
  "scenario": "Southwest comparison",
  "areaIds": ["ET-001", "ET-002"],
  "scoresByArea": {
    "ET-001": {
      "areaId": "ET-001",
      "priorityScore": 82
    }
  },
  "topAreaIds": ["ET-001", "ET-005", "ET-002"],
  "analysis": "..."
}
```

If no two ids are provided, the endpoint returns recalculated scores for all
areas and a top-area ordering. The frontend should join `scoresByArea` to map
entities by `areaId`.

### `POST /compare-areas`

Compares two areas based on deterministic scores, cost/risk/readiness fields,
and evidence. It is an explicit alias for comparison flows; `/scenario` remains
the broader endpoint for score recalculation.

```json
{
  "areaIds": ["ET-001", "ET-002"]
}
```

Response includes a human-readable narrative for the HabtamuAI advisor plus
structured evidence for collapsible UI details:

```json
{
  "areaIds": ["ET-001", "ET-002"],
  "recommendedAreaId": "ET-001",
  "recommendedAreaName": "Example Woreda",
  "recommendation": "Validate Example Woreda first for field review.",
  "confidence": "medium",
  "summary": "Example Woreda should be validated first...",
  "narrativeSummary": "Example Woreda should be validated first...",
  "llmExplanation": "Example Woreda should be validated first...",
  "keyTradeoffs": ["Example Woreda has stronger cost efficiency..."],
  "comparisonBullets": ["Example Woreda has stronger cost efficiency..."],
  "riskFlags": ["field validation required"],
  "riskWarnings": ["field validation required"],
  "fieldValidationQuestions": ["Confirm actual plantable hectares..."],
  "decisionBasis": ["priority score", "carbon readiness", "cost efficiency", "risk flags"],
  "caveat": "This recommendation is based on available indicators and requires onsite expert validation.",
  "costEstimatesByArea": {},
  "scoresByArea": {},
  "analysis": "..."
}
```

### `POST /field-brief`

Request:

```json
{
  "areaId": "ET-001"
}
```

Response:

```json
{
  "areaId": "ET-001",
  "fieldBrief": "..."
}
```

This legacy endpoint is kept for compatibility. Prefer
`POST /areas/{areaId}/field-brief`.

### `POST /voice`

Generates read-aloud audio for HabtamuAI using ElevenLabs. The frontend sends
the narrative text; the backend reads the ElevenLabs API key from AWS Secrets
Manager and returns MP3 audio as base64 JSON.

Request:

```json
{
  "text": "HabtamuAI recommends validating Southwest Ethiopia · Candidate Area 08 first..."
}
```

Response:

```json
{
  "provider": "elevenlabs",
  "voiceName": "Eric",
  "contentType": "audio/mpeg",
  "audioBase64": "..."
}
```

If ElevenLabs is unavailable, the endpoint returns an error and the frontend
falls back to browser speech synthesis.

## What Is Mocked

- Area scoring data when no processed S3 object exists
- Bedrock output when `BEDROCK_ENABLED=false` or a Bedrock call fails
- Scenario modelling beyond deterministic weighted score recalculation
- Cost indicators and GIS-derived cost drivers until real geospatial extraction is integrated
