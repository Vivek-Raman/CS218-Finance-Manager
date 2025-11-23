terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Data source to get current AWS account ID
data "aws_caller_identity" "current" {}

# Data source to get current AWS region
data "aws_region" "current" {}

# IAM role for Lambda execution
resource "aws_iam_role" "lambda_execution_role" {
  name = "${var.app_name}-lambda-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "finance-manager"
  }
}

# Attach basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# DynamoDB table for expenses
resource "aws_dynamodb_table" "expenses" {
  name         = "${var.app_name}-expenses"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = false
  }

  tags = {
    Name = "finance-manager"
  }
}

# S3 bucket for CSV file storage
resource "aws_s3_bucket" "csv_uploads" {
  bucket = "${var.app_name}-csv-uploads-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "finance-manager"
  }
}

# S3 bucket versioning (optional, for file history)
resource "aws_s3_bucket_versioning" "csv_uploads" {
  bucket = aws_s3_bucket.csv_uploads.id

  versioning_configuration {
    status = "Disabled"
  }
}

# S3 bucket server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "csv_uploads" {
  bucket = aws_s3_bucket.csv_uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# IAM policy for DynamoDB access
resource "aws_iam_role_policy" "dynamodb_access" {
  name = "${var.app_name}-dynamodb-access"
  role = aws_iam_role.lambda_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = aws_dynamodb_table.expenses.arn
      }
    ]
  })
}

# SQS Dead-Letter Queue
resource "aws_sqs_queue" "ingest_dlq" {
  name                      = "${var.app_name}-ingest-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Name = "finance-manager"
  }
}

# SQS Queue for ingest
resource "aws_sqs_queue" "ingest_queue" {
  name                      = "${var.app_name}-ingest-queue"
  message_retention_seconds = 345600 # 4 days
  visibility_timeout_seconds = 60

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ingest_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "finance-manager"
  }
}

# IAM policy for SQS access
resource "aws_iam_role_policy" "sqs_access" {
  name = "${var.app_name}-sqs-access"
  role = aws_iam_role.lambda_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          aws_sqs_queue.ingest_queue.arn,
          aws_sqs_queue.ingest_dlq.arn
        ]
      }
    ]
  })
}

# IAM policy for S3 access
resource "aws_iam_role_policy" "s3_access" {
  name = "${var.app_name}-s3-access"
  role = aws_iam_role.lambda_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.csv_uploads.arn}/*"
      }
    ]
  })
}

# Archive health handler
data "archive_file" "health_zip" {
  type        = "zip"
  source_file = "${path.module}/../backend/handlers/health.js"
  output_path = "${path.module}/.terraform/health.zip"
}

# Archive expenses handler
data "archive_file" "expenses_zip" {
  type        = "zip"
  source_file = "${path.module}/../backend/handlers/expenses.js"
  output_path = "${path.module}/.terraform/expenses.zip"
}

# Archive ingest handler
data "archive_file" "ingest_zip" {
  type        = "zip"
  source_file = "${path.module}/../backend/handlers/ingest.js"
  output_path = "${path.module}/.terraform/ingest.zip"
}

# Archive processExpense handler
data "archive_file" "process_expense_zip" {
  type        = "zip"
  source_file = "${path.module}/../backend/handlers/processExpense.js"
  output_path = "${path.module}/.terraform/processExpense.zip"
}

# Lambda function for health check
resource "aws_lambda_function" "health" {
  filename         = data.archive_file.health_zip.output_path
  function_name    = "${var.app_name}-health"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "health.handler"
  source_code_hash = data.archive_file.health_zip.output_base64sha256
  runtime         = "nodejs20.x"

  environment {
    variables = {
      APP_NAME = var.app_name
    }
  }

  tags = {
    Name = "finance-manager"
  }
}

# Lambda function for expenses
resource "aws_lambda_function" "expenses" {
  filename         = data.archive_file.expenses_zip.output_path
  function_name    = "${var.app_name}-expenses"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "expenses.handler"
  source_code_hash = data.archive_file.expenses_zip.output_base64sha256
  runtime         = "nodejs20.x"

  environment {
    variables = {
      APP_NAME        = var.app_name
      EXPENSES_TABLE  = aws_dynamodb_table.expenses.name
    }
  }

  tags = {
    Name = "finance-manager"
  }
}

# Lambda function for ingest
resource "aws_lambda_function" "ingest" {
  filename         = data.archive_file.ingest_zip.output_path
  function_name    = "${var.app_name}-ingest"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "ingest.handler"
  source_code_hash = data.archive_file.ingest_zip.output_base64sha256
  runtime         = "nodejs20.x"

  environment {
    variables = {
      APP_NAME      = var.app_name
      SQS_QUEUE_URL = aws_sqs_queue.ingest_queue.url
      S3_BUCKET_NAME = aws_s3_bucket.csv_uploads.bucket
    }
  }

  tags = {
    Name = "finance-manager"
  }
}

# Lambda function for processExpense
resource "aws_lambda_function" "process_expense" {
  filename         = data.archive_file.process_expense_zip.output_path
  function_name    = "${var.app_name}-process-expense"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "processExpense.handler"
  source_code_hash = data.archive_file.process_expense_zip.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = 60

  environment {
    variables = {
      APP_NAME       = var.app_name
      EXPENSES_TABLE = aws_dynamodb_table.expenses.name
      DLQ_URL        = aws_sqs_queue.ingest_dlq.url
    }
  }

  tags = {
    Name = "finance-manager"
  }
}

# SQS event source mapping for processExpense Lambda
resource "aws_lambda_event_source_mapping" "process_expense_sqs" {
  event_source_arn = aws_sqs_queue.ingest_queue.arn
  function_name    = aws_lambda_function.process_expense.arn
  batch_size       = 10
  maximum_batching_window_in_seconds = 5
}

# API Gateway HTTP API
resource "aws_apigatewayv2_api" "main" {
  name          = "${var.app_name}-api"
  protocol_type = "HTTP"
  description   = "API Gateway for ${var.app_name}"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["*"]
    max_age       = 300
  }

  tags = {
    Name = "finance-manager"
  }
}

# API Gateway integration for health Lambda
resource "aws_apigatewayv2_integration" "health" {
  api_id = aws_apigatewayv2_api.main.id

  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.health.invoke_arn
  integration_method = "POST"
}

# API Gateway integration for expenses Lambda
resource "aws_apigatewayv2_integration" "expenses" {
  api_id = aws_apigatewayv2_api.main.id

  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.expenses.invoke_arn
  integration_method = "POST"
}

# API Gateway integration for ingest Lambda
resource "aws_apigatewayv2_integration" "ingest" {
  api_id = aws_apigatewayv2_api.main.id

  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.ingest.invoke_arn
  integration_method = "POST"
}

# API Gateway route for health
resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /api/health"
  target    = "integrations/${aws_apigatewayv2_integration.health.id}"
}

# API Gateway route for expenses GET
resource "aws_apigatewayv2_route" "expenses_get" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /api/expenses"
  target    = "integrations/${aws_apigatewayv2_integration.expenses.id}"
}

# API Gateway route for expenses POST
resource "aws_apigatewayv2_route" "expenses_post" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /api/expenses"
  target    = "integrations/${aws_apigatewayv2_integration.expenses.id}"
}

# API Gateway route for ingest POST
resource "aws_apigatewayv2_route" "ingest_post" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "POST /api/ingest"
  target    = "integrations/${aws_apigatewayv2_integration.ingest.id}"
}

# API Gateway stage
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  tags = {
    Name = "finance-manager"
  }
}

# Lambda permissions for API Gateway to invoke health Lambda
resource "aws_lambda_permission" "health_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.health.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# Lambda permissions for API Gateway to invoke expenses Lambda
resource "aws_lambda_permission" "expenses_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.expenses.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# Lambda permissions for API Gateway to invoke ingest Lambda
resource "aws_lambda_permission" "ingest_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# Note: HTTP APIs (API Gateway v2) are public by default and don't support resource policies.
# For stricter access control, consider using:
# - AWS WAF rules attached to the API Gateway
# - CORS configuration to restrict origins (already configured above)
# - API keys and usage plans
# - IAM authorization on Lambda functions

# Amplify App
resource "aws_amplify_app" "frontend" {
  name       = "${var.app_name}-frontend"
  repository = var.amplify_repository != "" ? var.amplify_repository : null

  build_spec = <<-EOT
    version: 1
    frontend:
      phases:
        preBuild:
          commands:
            - npm ci
        build:
          commands:
            - npm run build
      artifacts:
        baseDirectory: dist
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
  EOT

  # Custom rules for SPA routing
  custom_rule {
    source = "/<*>"
    status = "200"
    target = "/index.html"
  }

  environment_variables = {
    REACT_APP_API_URL = aws_apigatewayv2_api.main.api_endpoint
    VITE_API_URL      = aws_apigatewayv2_api.main.api_endpoint
  }

  tags = {
    Name = "finance-manager"
  }
}

# Amplify Branch
resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.frontend.id
  branch_name = var.amplify_branch

  enable_auto_build = true
  enable_pull_request_preview = false

  tags = {
    Name = "finance-manager"
  }
}

