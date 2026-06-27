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

Returns scored areas. Lambda first tries
`s3://<processed-bucket>/processed/scored_areas.json`; if that read fails it
returns mock data.

```json
{
  "areas": [],
  "source": "s3"
}
```

`source` is either `s3` or `mock`.

### `GET /areas/{areaId}`

Returns one area by id.

### `POST /areas/{areaId}/explain`

Returns a concise Bedrock or fallback explanation.

```json
{
  "areaId": "ET-001",
  "explanation": "..."
}
```

The prompt instructs Bedrock to avoid invented scores, use only provided
evidence, explain uncertainty, frame the output as pre-screening, mention onsite
expert validation, and keep language NGO-friendly.

### `POST /scenario`

Compares two areas when the request includes two ids:

```json
{
  "name": "Southwest comparison",
  "areaIds": ["ET-001", "ET-002"]
}
```

Response:

```json
{
  "scenario": "Southwest comparison",
  "areaIds": ["ET-001", "ET-002"],
  "analysis": "..."
}
```

If no two ids are provided, the endpoint returns a mock ranking by
`priorityScore`.

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

## What Is Mocked

- Area scoring data when no processed S3 object exists
- Bedrock output when `BEDROCK_ENABLED=false` or a Bedrock call fails
- Scenario modelling beyond simple area comparison or priority ranking
