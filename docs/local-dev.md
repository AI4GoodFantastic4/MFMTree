# Local Development

## Prerequisites

- Terraform 1.6+
- AWS CLI configured through your shell, AWS profile, SSO, or CI
- Python 3.11+
- Docker

Do not put AWS credentials in this repository.

## Environment

```bash
cp .env.example .env
```

The Terraform defaults are also set in `infra/variables.tf`.

## Lambda

Run a local smoke test:

```bash
make api-smoke
```

Run unit tests:

```bash
make test
```

Build the Lambda deployment zip:

```bash
make lambda-package
```

The zip is written to:

```text
services/api/dist/lambda.zip
```

## GIS Processor

Run the processor locally:

```bash
make processor-smoke
```

This writes a local `/tmp/scored_areas.json` and attempts an S3 upload only if
valid AWS access is available.

Build the container:

```bash
docker build -t mfmtree-gis-processor services/gis-processor
```

Run the container:

```bash
docker run --rm \
  -e RAW_BUCKET=local-raw \
  -e PROCESSED_BUCKET=local-processed \
  -e TARGET_REGION=ethiopia \
  -e OUTPUT_KEY=processed/scored_areas.json \
  mfmtree-gis-processor
```

## Terraform

Initialize:

```bash
make tf-init
```

Validate:

```bash
make lambda-package
make tf-validate
```

Plan:

```bash
make tf-plan
```

Apply:

```bash
make tf-apply
```

Outputs include:

- `raw_data_bucket_name`
- `processed_data_bucket_name`
- `api_base_url`
- `ecr_repository_url`
- `step_function_arn`

## Test Deployed Endpoints

After `terraform apply`, use the `api_base_url` output:

```bash
API_BASE_URL="$(terraform -chdir=infra output -raw api_base_url)"

curl "$API_BASE_URL/health"
curl "$API_BASE_URL/areas"
curl "$API_BASE_URL/areas/ET-001"
curl -X POST "$API_BASE_URL/areas/ET-001/explain"
curl "$API_BASE_URL/areas/ET-001/cost-estimate"
curl -X POST "$API_BASE_URL/areas/ET-001/field-brief"
curl -X POST "$API_BASE_URL/cost-estimate" \
  -H "content-type: application/json" \
  -d '{"areaId":"CUSTOM","totalAreaHa":100,"plantableFraction":0.5}'
curl -X POST "$API_BASE_URL/budget-plan" \
  -H "content-type: application/json" \
  -d '{"budget":100000,"currency":"EUR","riskTolerance":"medium","minimumCarbonCreditReadiness":"medium"}'
curl -X POST "$API_BASE_URL/scenario" \
  -H "content-type: application/json" \
  -d '{"areaIds":["ET-001","ET-002"]}'
curl -X POST "$API_BASE_URL/field-brief" \
  -H "content-type: application/json" \
  -d '{"areaId":"ET-001"}'
```

## Mocked MVP Pieces

- `processed/scored_areas.json` is generated from fixed example data.
- Lambda falls back to mock areas when S3 data is absent.
- Cost estimates use mock indicators and placeholder configurable assumptions.
- Bedrock falls back to deterministic text when disabled or unavailable.
- EventBridge trigger is present as a disabled rule.
- Step Functions does not yet start a real ECS task.
- The frontend is not included in this skeleton.
