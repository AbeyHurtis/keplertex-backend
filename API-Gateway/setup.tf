provider "aws" {
  region = "us-east-1" # change as needed
}

# IAM role for Lambda
resource "aws_iam_role" "lambda_exec" {
  name = "keplertex-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

# Attach execution policy (basic Lambda logging + API Gateway)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda function for Keplertex API
resource "aws_lambda_function" "keplertex" {
  function_name = "keplertex-api"
  runtime       = "nodejs20.x" # or python3.12 etc.
  role          = aws_iam_role.lambda_exec.arn
  handler       = "index.handler"

  filename         = "lambda.zip"   # zip of your lambda code
  source_code_hash = filebase64sha256("lambda.zip")
}

# API Gateway REST API
resource "aws_api_gateway_rest_api" "keplertex" {
  name        = "KeplertexAPI"
  description = "API Gateway for Keplertex"
}

# API Resource (/keplertex)
resource "aws_api_gateway_resource" "keplertex_resource" {
  rest_api_id = aws_api_gateway_rest_api.keplertex.id
  parent_id   = aws_api_gateway_rest_api.keplertex.root_resource_id
  path_part   = "keplertex"
}

# Method (GET)
resource "aws_api_gateway_method" "get_method" {
  rest_api_id   = aws_api_gateway_rest_api.keplertex.id
  resource_id   = aws_api_gateway_resource.keplertex_resource.id
  http_method   = "GET"
  authorization = "NONE"
}

# Integration with Lambda
resource "aws_api_gateway_integration" "lambda_integration" {
  rest_api_id = aws_api_gateway_rest_api.keplertex.id
  resource_id = aws_api_gateway_resource.keplertex_resource.id
  http_method = aws_api_gateway_method.get_method.http_method
  type        = "AWS_PROXY"
  integration_http_method = "POST"
  uri         = aws_lambda_function.keplertex.invoke_arn
}

# Lambda permission so API Gateway can call it
resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.keplertex.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.keplertex.execution_arn}/*/*"
}

# Deployment
resource "aws_api_gateway_deployment" "keplertex" {
  depends_on = [aws_api_gateway_integration.lambda_integration]
  rest_api_id = aws_api_gateway_rest_api.keplertex.id
  stage_name  = "dev"
}

output "keplertex_api_invoke_url" {
  value = "${aws_api_gateway_deployment.keplertex.invoke_url}"
}
