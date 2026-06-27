variable "project_name" {
  description = "Short project name used for AWS resource names."
  type        = string
  default     = "mfmtree"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region for all resources."
  type        = string
  default     = "eu-central-1"
}

variable "frontend_origin" {
  description = "Allowed CORS origin for the future 3D frontend."
  type        = string
  default     = "http://localhost:5173"
}

variable "bedrock_enabled" {
  description = "Whether the Lambda should call Amazon Bedrock. When false it returns deterministic mock explanations."
  type        = bool
  default     = false
}

variable "bedrock_model_id" {
  description = "Bedrock model id used by the reasoning layer."
  type        = string
  default     = "anthropic.claude-3-5-sonnet-20240620-v1:0"
}
