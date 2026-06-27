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

output "frontend_bucket_name" {
  description = "S3 bucket for frontend static assets."
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution id for the frontend."
  value       = aws_cloudfront_distribution.frontend.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain for the frontend."
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_url" {
  description = "HTTPS URL for the frontend."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}
