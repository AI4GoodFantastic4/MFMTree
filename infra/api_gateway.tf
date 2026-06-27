resource "aws_apigatewayv2_api" "http_api" {
  name          = "${local.name_prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = false
    allow_headers     = ["content-type", "authorization"]
    allow_methods     = ["GET", "POST", "OPTIONS"]
    allow_origins     = [var.frontend_origin]
    max_age           = 300
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

locals {
  api_routes = toset([
    "GET /health",
    "GET /areas",
    "GET /areas/{areaId}",
    "GET /areas/{areaId}/cost-estimate",
    "GET /data-sources",
    "GET /data-sources/{sourceId}",
    "GET /scores",
    "POST /areas/{areaId}/explain",
    "POST /areas/{areaId}/field-brief",
    "POST /areas/{areaId}/carbon-readiness",
    "POST /cost-estimate",
    "POST /budget-plan",
    "POST /compare-areas",
    "POST /scenario",
    "POST /field-brief"
  ])
}

resource "aws_apigatewayv2_route" "routes" {
  for_each = local.api_routes

  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = each.value
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowExecutionFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}
