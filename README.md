# MFMTree

Minimal Terraform-first AWS skeleton for a hackathon 3D GIS web app that helps
Menschen fuer Menschen staff pre-screen areas in Ethiopia for reforestation and
tree-planting projects.

Core principle:

```text
Scoring Engine decides.
Bedrock explains.
Experts validate.
```

## Architecture

```text
External Data Sources
  -> S3 Raw Data Lake
  -> S3 upload / EventBridge trigger
  -> Step Functions orchestration
  -> ECS Fargate GIS processing container
  -> Reforestation scoring output
  -> S3 Processed Data
  -> API Gateway + Lambda backend
  -> Amazon Bedrock reasoning layer
  -> 3D web app
```

This repository intentionally starts small. It deploys the data buckets, Lambda
API, HTTP API Gateway, ECR repository, ECS task definition skeleton, Step
Functions skeleton, and IAM placeholders needed for the MVP. RDS/PostGIS is a
future production extension and is not deployed yet.

## Repository Layout

```text
infra/                  Terraform infrastructure
frontend/               Vite + React demo frontend
services/api/           Python Lambda backend and Bedrock wrapper
services/gis-processor/ Docker-based GIS processor skeleton
services/gee-processor/ Google Earth Engine Python processor container
docs/                   Architecture, API, and local development notes
scripts/                Helper scripts
```

## Quick Start

Prerequisites:

- Terraform 1.6+
- AWS CLI with credentials configured outside this repo
- Python 3.11+
- Docker, for the GIS processor image

Copy environment defaults:

```bash
cp .env.example .env
```

Run local checks:

```bash
make check
```

Package the Lambda and inspect Terraform:

```bash
make lambda-package
make tf-init
make tf-plan
```

Deploy when ready:

```bash
make tf-apply
```

## Local API Smoke Test

The Lambda handler can be exercised without AWS:

```bash
make api-smoke
```

Run unit tests:

```bash
make test
```

Run the frontend locally:

```bash
cp frontend/.env.example frontend/.env
make frontend-install
make frontend-dev
```

## What Is Deployable

- S3 raw and processed buckets
- Python Lambda backend behind API Gateway HTTP API
- CloudWatch log group and Lambda execution role
- ECR repository for the GIS processor image
- ECS cluster, task definition, and execution role skeleton
- Step Functions state machine skeleton
- IAM placeholders for Bedrock and orchestration
- Deterministic cost-estimation API using configurable assumptions
- Containerized Google Earth Engine processor skeleton for GCS exports
- Private S3 + CloudFront frontend hosting

## What Is Mocked

- GIS scoring uses deterministic mock scored areas.
- Cost estimates use mock GIS indicators and placeholder assumptions.
- The Earth Engine processor builds the computation graph, but real exports require GEE credentials and explicit non-dry-run execution.
- Bedrock responses fall back to deterministic text when disabled or failing.
- EventBridge/S3 trigger is a placeholder variable-ready module section.
- The 3D frontend is not included yet.

See [docs/aws-architecture.md](docs/aws-architecture.md),
[docs/api-contract.md](docs/api-contract.md),
[docs/cost-estimation.md](docs/cost-estimation.md),
[docs/frontend-cloudfront.md](docs/frontend-cloudfront.md), and
[docs/local-dev.md](docs/local-dev.md) for details.
