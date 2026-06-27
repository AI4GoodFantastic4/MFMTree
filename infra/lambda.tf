resource "aws_cloudwatch_log_group" "api_lambda" {
  name              = "/aws/lambda/${local.name_prefix}-api"
  retention_in_days = 14
}

resource "aws_lambda_function" "api" {
  function_name    = "${local.name_prefix}-api"
  role             = aws_iam_role.lambda.arn
  handler          = "app.lambda_handler"
  runtime          = "python3.11"
  filename         = local.lambda_zip_path
  source_code_hash = filebase64sha256(local.lambda_zip_path)
  timeout          = 20
  memory_size      = 256

  environment {
    variables = {
      RAW_DATA_BUCKET       = aws_s3_bucket.raw_data.bucket
      PROCESSED_DATA_BUCKET = aws_s3_bucket.processed_data.bucket
      BEDROCK_ENABLED       = tostring(var.bedrock_enabled)
      BEDROCK_MODEL_ID      = var.bedrock_model_id
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.api_lambda,
    aws_iam_role_policy.lambda
  ]
}
