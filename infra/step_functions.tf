resource "aws_sfn_state_machine" "gis_pipeline" {
  name     = "${local.name_prefix}-gis-pipeline"
  role_arn = aws_iam_role.step_functions.arn

  definition = jsonencode({
    Comment = "MVP skeleton for S3-triggered GIS scoring orchestration. Replace Pass states with ECS RunTask once networking is selected."
    StartAt = "ValidateUpload"
    States = {
      ValidateUpload = {
        Type   = "Pass"
        Result = "Upload event accepted"
        Next   = "RunGisProcessorPlaceholder"
      }
      RunGisProcessorPlaceholder = {
        Type = "Pass"
        Parameters = {
          ClusterArn        = aws_ecs_cluster.gis.arn
          TaskDefinitionArn = aws_ecs_task_definition.gis_processor.arn
          Note              = "TODO: wire states:::ecs:runTask.sync with private subnets or public subnet assignment. No NAT Gateway is created in this MVP."
        }
        Next = "PublishScoredAreas"
      }
      PublishScoredAreas = {
        Type   = "Pass"
        Result = "processed/scored_areas.json"
        End    = true
      }
    }
  })
}

resource "aws_cloudwatch_event_rule" "raw_s3_object_created" {
  name        = "${local.name_prefix}-raw-s3-object-created"
  description = "Disabled MVP placeholder for raw S3 uploads starting the GIS pipeline."
  state       = "DISABLED"

  event_pattern = jsonencode({
    source      = ["aws.s3"]
    detail-type = ["Object Created"]
    detail = {
      bucket = {
        name = [aws_s3_bucket.raw_data.bucket]
      }
    }
  })
}

resource "aws_cloudwatch_event_target" "raw_s3_to_sfn" {
  rule     = aws_cloudwatch_event_rule.raw_s3_object_created.name
  arn      = aws_sfn_state_machine.gis_pipeline.arn
  role_arn = aws_iam_role.eventbridge_to_sfn.arn
}
