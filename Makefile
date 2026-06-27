PROJECT_NAME ?= mfmtree
ENVIRONMENT ?= dev
AWS_REGION ?= eu-central-1
FRONTEND_ORIGIN ?= http://localhost:5173
BEDROCK_ENABLED ?= false
BEDROCK_MODEL_ID ?= anthropic.claude-3-5-sonnet-20240620-v1:0
ALLOW_MOCK_DATA ?= true

TF_DIR := infra
API_DIR := services/api
LAMBDA_DIST := $(API_DIR)/dist/lambda.zip
FRONTEND_DIR := frontend

.PHONY: help check fmt test lambda-package api-smoke processor-smoke frontend-install frontend-dev frontend-build frontend-deploy tf-init tf-fmt tf-validate tf-plan tf-apply clean

help:
	@echo "Targets:"
	@echo "  make check             Run formatting and lightweight validation"
	@echo "  make lambda-package    Build Lambda zip at $(LAMBDA_DIST)"
	@echo "  make api-smoke         Exercise Lambda handler locally with mock events"
	@echo "  make test              Run unit tests"
	@echo "  make processor-smoke   Run GIS processor locally without S3 upload"
	@echo "  make frontend-install  Install frontend dependencies"
	@echo "  make frontend-dev      Run Vite dev server"
	@echo "  make frontend-build    Build frontend static assets"
	@echo "  make frontend-deploy   Build and deploy frontend to S3/CloudFront"
	@echo "  make tf-init           terraform init"
	@echo "  make tf-plan           terraform plan with default variables"
	@echo "  make tf-apply          terraform apply with default variables"

check: fmt test lambda-package api-smoke processor-smoke tf-fmt
	@python3 -m py_compile $(API_DIR)/*.py services/gis-processor/processor.py services/gee-processor/src/gee_processor/*.py
	@if command -v terraform >/dev/null 2>&1 && [ -d "$(TF_DIR)/.terraform" ]; then $(MAKE) tf-validate; else echo "terraform not initialized or not found; skipped tf-validate"; fi

fmt:
	@python3 -m compileall -q $(API_DIR) services/gis-processor services/gee-processor/src

test:
	@python3 -m unittest discover -s tests
	@python3 -m unittest discover -s services/gee-processor/tests

lambda-package:
	@./scripts/package_lambda.sh

api-smoke:
	@python3 $(API_DIR)/local_smoke.py

processor-smoke:
	@RAW_BUCKET=local-raw PROCESSED_BUCKET=local-processed TARGET_REGION=ethiopia OUTPUT_KEY=processed/scored_areas.json python3 services/gis-processor/processor.py

frontend-install:
	@npm --prefix $(FRONTEND_DIR) install

frontend-dev:
	@npm --prefix $(FRONTEND_DIR) run dev

frontend-build:
	@npm --prefix $(FRONTEND_DIR) run build

frontend-deploy:
	@./scripts/deploy_frontend.sh

tf-init:
	@terraform -chdir=$(TF_DIR) init

tf-fmt:
	@if command -v terraform >/dev/null 2>&1; then terraform -chdir=$(TF_DIR) fmt -recursive; else echo "terraform not found; skipped tf-fmt"; fi

tf-validate:
	@terraform -chdir=$(TF_DIR) validate

tf-plan: lambda-package
	@terraform -chdir=$(TF_DIR) plan \
		-var="project_name=$(PROJECT_NAME)" \
		-var="environment=$(ENVIRONMENT)" \
		-var="aws_region=$(AWS_REGION)" \
		-var="frontend_origin=$(FRONTEND_ORIGIN)" \
		-var="bedrock_enabled=$(BEDROCK_ENABLED)" \
		-var="bedrock_model_id=$(BEDROCK_MODEL_ID)" \
		-var="allow_mock_data=$(ALLOW_MOCK_DATA)"

tf-apply: lambda-package
	@terraform -chdir=$(TF_DIR) apply \
		-var="project_name=$(PROJECT_NAME)" \
		-var="environment=$(ENVIRONMENT)" \
		-var="aws_region=$(AWS_REGION)" \
		-var="frontend_origin=$(FRONTEND_ORIGIN)" \
		-var="bedrock_enabled=$(BEDROCK_ENABLED)" \
		-var="bedrock_model_id=$(BEDROCK_MODEL_ID)" \
		-var="allow_mock_data=$(ALLOW_MOCK_DATA)"

clean:
	@rm -rf $(API_DIR)/build $(API_DIR)/dist $(FRONTEND_DIR)/dist
