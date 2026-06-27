locals {
  name_prefix = lower("${var.project_name}-${var.environment}")

  lambda_zip_path = "${path.module}/../services/api/dist/lambda.zip"

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}
