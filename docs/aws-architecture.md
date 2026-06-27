# AWS Architecture

## MVP Flow

```text
External Data Sources
  -> S3 Raw Data Lake
  -> S3 upload / EventBridge trigger placeholder
  -> Step Functions orchestration skeleton
  -> ECS Fargate GIS processing container
  -> Reforestation scoring output
  -> S3 Processed Data
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
7. The processor writes `processed/scored_areas.json` to the processed bucket.

The GIS processor currently creates deterministic mock scored areas. It includes
TODOs for GeoPandas, Rasterio, GDAL, Shapely, Pandas, and NumPy.

## User Interaction Flow

1. The 3D web app requests scored areas through API Gateway.
2. Lambda reads `processed/scored_areas.json` from S3.
3. If the S3 object is missing, Lambda falls back to mock data.
4. The user clicks an area in the 3D map.
5. The app requests area details and an explanation.
6. The scoring fields remain authoritative.
7. Bedrock explains the scoring output using only supplied evidence.
8. Experts validate the recommendation onsite before any final decision.

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
- Dataset lineage, scoring run metadata, and approval workflows
- AuthN/AuthZ for NGO staff and expert reviewers
- Frontend hosting through S3/CloudFront or Amplify

RDS/PostGIS is intentionally not deployed yet.
