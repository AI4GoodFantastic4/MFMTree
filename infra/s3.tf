resource "random_id" "bucket_suffix" {
  byte_length = 4
}

resource "aws_s3_bucket" "raw_data" {
  bucket = "${local.name_prefix}-raw-data-${random_id.bucket_suffix.hex}"
}

resource "aws_s3_bucket" "processed_data" {
  bucket = "${local.name_prefix}-processed-data-${random_id.bucket_suffix.hex}"
}

resource "aws_s3_bucket_public_access_block" "raw_data" {
  bucket = aws_s3_bucket.raw_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "processed_data" {
  bucket = aws_s3_bucket.processed_data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "raw_data" {
  bucket = aws_s3_bucket.raw_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "processed_data" {
  bucket = aws_s3_bucket.processed_data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "raw_data" {
  bucket = aws_s3_bucket.raw_data.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_versioning" "processed_data" {
  bucket = aws_s3_bucket.processed_data.id

  versioning_configuration {
    status = "Enabled"
  }
}

# EventBridge notification is enabled so future S3 object-created events can
# start the scoring pipeline. The matching EventBridge rule is disabled for MVP.
resource "aws_s3_bucket_notification" "raw_data_eventbridge" {
  bucket      = aws_s3_bucket.raw_data.id
  eventbridge = true
}
