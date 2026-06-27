resource "aws_ecr_repository" "gis_processor" {
  name                 = "${local.name_prefix}-gis-processor"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecs_cluster" "gis" {
  name = "${local.name_prefix}-gis"
}

resource "aws_cloudwatch_log_group" "gis_processor" {
  name              = "/ecs/${local.name_prefix}-gis-processor"
  retention_in_days = 14
}

resource "aws_ecs_task_definition" "gis_processor" {
  family                   = "${local.name_prefix}-gis-processor"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "1024"
  memory                   = "2048"
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "gis-processor"
      image     = "${aws_ecr_repository.gis_processor.repository_url}:latest"
      essential = true
      environment = [
        {
          name  = "RAW_BUCKET"
          value = aws_s3_bucket.raw_data.bucket
        },
        {
          name  = "PROCESSED_BUCKET"
          value = aws_s3_bucket.processed_data.bucket
        },
        {
          name  = "TARGET_REGION"
          value = "ethiopia"
        },
        {
          name  = "OUTPUT_KEY"
          value = "processed/scored_areas.json"
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.gis_processor.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "processor"
        }
      }
    }
  ])
}
