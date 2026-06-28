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
  default     = "us.amazon.nova-lite-v1:0"
}

variable "allow_mock_data" {
  description = "Whether the API may fall back to mock geometry/data when processed GeoJSON is missing."
  type        = bool
  default     = true
}

variable "elevenlabs_secret_name" {
  description = "AWS Secrets Manager secret name that stores the ElevenLabs API key. Leave empty to use the project default."
  type        = string
  default     = ""
}

variable "elevenlabs_voice_name" {
  description = "ElevenLabs voice name used for HabtamuAI read-aloud generation."
  type        = string
  default     = "Eric"
}

variable "elevenlabs_voice_id" {
  description = "Optional ElevenLabs voice id. If empty, the API resolves elevenlabs_voice_name."
  type        = string
  default     = ""
}

variable "elevenlabs_model_id" {
  description = "ElevenLabs model id used for timestamped TTS."
  type        = string
  default     = "eleven_turbo_v2_5"
}

variable "elevenlabs_timestamps_enabled" {
  description = "Whether Lambda should call the slower ElevenLabs timestamp endpoint. When false, it generates faster audio and estimates word timings."
  type        = bool
  default     = false
}

variable "tts_enabled" {
  description = "Whether Lambda should attempt ElevenLabs TTS. When false it returns estimated text alignment only."
  type        = bool
  default     = true
}
