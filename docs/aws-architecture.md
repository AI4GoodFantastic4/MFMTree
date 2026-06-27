# AWS Architecture

## MVP Flow

```text
External Data Sources
  -> S3 Raw Data Lake
  -> S3 upload / EventBridge trigger placeholder
  -> Step Functions orchestration skeleton
  -> ECS Fargate GIS processing container
  -> Area-level indicators and geometry
  -> S3 Processed Data
  -> Backend scoring engine
  -> API Gateway + Lambda backend
  -> Amazon Bedrock reasoning layer
  -> 3D web app
```

The MVP keeps the infrastructure small and deployable. Terraform creates two
private S3 buckets, an HTTP API, a Python Lambda backend, an ECR repository, an
ECS Fargate task definition, and a Step Functions state machine skeleton.

No NAT Gateway is created. No RDS/PostGIS database is deployed in this phase.

## Batch Processing Flow

1. External geospatial files are uploaded to the raw S3 data lake.
2. S3 EventBridge notifications are enabled on the raw bucket.
3. A disabled EventBridge rule documents the intended Object Created trigger.
4. Step Functions receives upload events once the rule is enabled.
5. The Step Functions MVP state machine currently uses Pass states.
6. The future production state will run the GIS processor as an ECS Fargate task.
7. The processor should write stable geometry and semi-static indicators to the
   processed bucket.
8. Lambda calculates dynamic scores from indicators and current assumptions.

The legacy GIS processor currently creates deterministic mock scored areas for
demo compatibility. The target layout is documented in
[`data-separation.md`](data-separation.md). Future processors should write
`geometry/areas.geojson`, `indicators/latest.json`, and run metadata rather than
baking final scenario-dependent investment decisions into map output.

## User Interaction Flow

1. The 3D web app requests areas through API Gateway.
2. Lambda reads `geometry/areas.geojson` and `indicators/latest.json` from S3.
3. If those objects are missing, Lambda falls back to legacy/mock data.
4. The user clicks an area in the 3D map.
5. The app requests area details and an explanation.
6. The backend scoring engine calculates current scores from indicators.
7. Bedrock explains the scoring output using only supplied evidence.
8. Experts validate the recommendation onsite before any final decision.

When users change scenario weights, budgets, cost assumptions, or risk
tolerance, the frontend calls the backend and receives updated scores keyed by
`areaId`. The frontend updates map colors/styles without regenerating geometry.

## MVP Architecture

Deployable now:

- S3 raw data bucket
- S3 processed data bucket
- API Gateway HTTP API
- Python Lambda backend
- Lambda IAM role and CloudWatch logs
- ECR repository for the GIS processor
- ECS cluster and Fargate task definition skeleton
- Step Functions state machine skeleton
- EventBridge/S3 trigger placeholder
- Bedrock IAM policy placeholder

## Future Production Architecture

Likely production additions:

- RDS/PostGIS for queryable area geometries and versioned scoring runs
- VPC design with private subnets and VPC endpoints
- ECS service or Step Functions ECS RunTask with selected network placement
- Real geospatial ETL using GDAL/Rasterio/GeoPandas
- Earth Engine processor Fargate task that starts GCS exports, writes metadata,
  then a future bridge syncs GCS outputs into the S3 processed-data bucket
- Dataset lineage, scoring run metadata, and approval workflows
- AuthN/AuthZ for NGO staff and expert reviewers
- Frontend hosting through S3/CloudFront or Amplify

RDS/PostGIS is intentionally not deployed yet.
