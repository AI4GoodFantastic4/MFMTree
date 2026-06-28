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
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      RAW_DATA_BUCKET        = aws_s3_bucket.raw_data.bucket
      PROCESSED_BUCKET       = aws_s3_bucket.processed_data.bucket
      PROCESSED_DATA_BUCKET  = aws_s3_bucket.processed_data.bucket
      GEOMETRY_KEY           = "geometry/areas.geojson"
      INDICATORS_KEY         = "indicators/latest.json"
      DATA_SOURCES_KEY       = "metadata/data_sources.json"
      ALLOW_MOCK_DATA        = tostring(var.allow_mock_data)
      BEDROCK_ENABLED        = tostring(var.bedrock_enabled)
      BEDROCK_MODEL_ID       = var.bedrock_model_id
      TTS_ENABLED            = tostring(var.tts_enabled)
      ELEVENLABS_SECRET_NAME = local.elevenlabs_secret_name
      ELEVENLABS_MODEL_ID    = var.elevenlabs_model_id
      ELEVENLABS_VOICE_ID    = var.elevenlabs_voice_id
      ELEVENLABS_VOICE_NAME  = var.elevenlabs_voice_name
    }
  }

  depends_on = [
    aws_cloudwatch_log_group.api_lambda,
    aws_iam_role_policy.lambda
  ]
}
