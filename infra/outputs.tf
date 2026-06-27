output "raw_data_bucket_name" {
  description = "Raw external geospatial dataset bucket."
  value       = aws_s3_bucket.raw_data.bucket
}

output "processed_data_bucket_name" {
  description = "Processed scored area bucket."
  value       = aws_s3_bucket.processed_data.bucket
}

output "api_base_url" {
  description = "HTTP API base URL."
  value       = aws_apigatewayv2_api.http_api.api_endpoint
}

output "ecr_repository_url" {
  description = "ECR repository URL for the GIS processor image."
  value       = aws_ecr_repository.gis_processor.repository_url
}

output "step_function_arn" {
  description = "Step Functions GIS pipeline state machine ARN."
  value       = aws_sfn_state_machine.gis_pipeline.arn
}
