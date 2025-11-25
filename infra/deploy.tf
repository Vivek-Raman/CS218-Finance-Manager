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
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

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

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_dynamodb_table" "expenses" {
  name         = "${var.app_name}-expenses"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  global_secondary_index {
    name            = "userId-index"
    hash_key        = "userId"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = false
  }

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_dynamodb_table" "analysis" {
  name         = "${var.app_name}-analysis"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "analyticTag"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "analyticTag"
    type = "S"
  }

  point_in_time_recovery {
    enabled = false
  }

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_s3_bucket" "csv_uploads" {
  bucket = "${var.app_name}-csv-uploads-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_s3_bucket_versioning" "csv_uploads" {
  bucket = aws_s3_bucket.csv_uploads.id

  versioning_configuration {
    status = "Disabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "csv_uploads" {
  bucket = aws_s3_bucket.csv_uploads.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

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
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.expenses.arn,
          "${aws_dynamodb_table.expenses.arn}/index/*",
          aws_dynamodb_table.analysis.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "lambda_invoke_access" {
  name = "${var.app_name}-lambda-invoke-access"
  role = aws_iam_role.lambda_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction"
        ]
        Resource = [
          aws_lambda_function.analyze_expenses.arn
        ]
      }
    ]
  })
}

resource "aws_sqs_queue" "ingest_dlq" {
  name                      = "${var.app_name}-ingest-dlq"
  message_retention_seconds = 1209600

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_sqs_queue" "ingest_queue" {
  name                      = "${var.app_name}-ingest-queue"
  message_retention_seconds = 345600
  visibility_timeout_seconds = 60

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.ingest_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_sqs_queue" "analysis_dlq" {
  name                      = "${var.app_name}-analysis-dlq"
  message_retention_seconds = 1209600

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_sqs_queue" "analysis_delay_queue" {
  name                      = "${var.app_name}-analysis-delay-queue"
  message_retention_seconds = 345600
  visibility_timeout_seconds = 60
  delay_seconds             = 300  # 5 minutes delay

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.analysis_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "finance-manager"
  }
}

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
          aws_sqs_queue.ingest_dlq.arn,
          aws_sqs_queue.analysis_delay_queue.arn,
          aws_sqs_queue.analysis_dlq.arn
        ]
      }
    ]
  })
}

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

data "external" "build_lambda_packages" {
  program = ["sh", "-c", <<-EOT
    set -e  # Exit on error
    BACKEND_DIR="${abspath(path.module)}/../fm-backend"
    INFRA_DIR="${abspath(path.module)}"
    
    cd "$BACKEND_DIR" || { echo '{"error":"Failed to cd to backend directory"}' >&2; exit 1; }
    
    # Install dependencies if node_modules doesn't exist or package.json changed
    if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
      npm install --production >&2 || { echo '{"error":"npm install failed"}' >&2; exit 1; }
    fi
    
    # Create build directories
    mkdir -p "$INFRA_DIR/.terraform/lambda-packages" || { echo '{"error":"Failed to create packages directory"}' >&2; exit 1; }
    
    # Build health package
    mkdir -p "$INFRA_DIR/.terraform/lambda-packages/health" || { echo '{"error":"Failed to create health directory"}' >&2; exit 1; }
    cp handlers/health.js "$INFRA_DIR/.terraform/lambda-packages/health/" || { echo '{"error":"Failed to copy health.js"}' >&2; exit 1; }
    cp -r node_modules "$INFRA_DIR/.terraform/lambda-packages/health/" 2>/dev/null || { echo '{"error":"Failed to copy node_modules for health"}' >&2; exit 1; }
    
    # Build expenses package
    mkdir -p "$INFRA_DIR/.terraform/lambda-packages/expenses" || { echo '{"error":"Failed to create expenses directory"}' >&2; exit 1; }
    cp handlers/expenses.js "$INFRA_DIR/.terraform/lambda-packages/expenses/" || { echo '{"error":"Failed to copy expenses.js"}' >&2; exit 1; }
    cp -r node_modules "$INFRA_DIR/.terraform/lambda-packages/expenses/" 2>/dev/null || { echo '{"error":"Failed to copy node_modules for expenses"}' >&2; exit 1; }
    
    # Build ingest package
    mkdir -p "$INFRA_DIR/.terraform/lambda-packages/ingest" || { echo '{"error":"Failed to create ingest directory"}' >&2; exit 1; }
    cp handlers/ingest.js "$INFRA_DIR/.terraform/lambda-packages/ingest/" || { echo '{"error":"Failed to copy ingest.js"}' >&2; exit 1; }
    cp -r node_modules "$INFRA_DIR/.terraform/lambda-packages/ingest/" 2>/dev/null || { echo '{"error":"Failed to copy node_modules for ingest"}' >&2; exit 1; }
    
    # Build processExpense package
    mkdir -p "$INFRA_DIR/.terraform/lambda-packages/processExpense" || { echo '{"error":"Failed to create processExpense directory"}' >&2; exit 1; }
    cp handlers/processExpense.js "$INFRA_DIR/.terraform/lambda-packages/processExpense/" || { echo '{"error":"Failed to copy processExpense.js"}' >&2; exit 1; }
    cp -r node_modules "$INFRA_DIR/.terraform/lambda-packages/processExpense/" 2>/dev/null || { echo '{"error":"Failed to copy node_modules for processExpense"}' >&2; exit 1; }
    
    # Build analyzeExpenses package
    mkdir -p "$INFRA_DIR/.terraform/lambda-packages/analyzeExpenses" || { echo '{"error":"Failed to create analyzeExpenses directory"}' >&2; exit 1; }
    cp handlers/analyzeExpenses.js "$INFRA_DIR/.terraform/lambda-packages/analyzeExpenses/" || { echo '{"error":"Failed to copy analyzeExpenses.js"}' >&2; exit 1; }
    cp -r node_modules "$INFRA_DIR/.terraform/lambda-packages/analyzeExpenses/" 2>/dev/null || { echo '{"error":"Failed to copy node_modules for analyzeExpenses"}' >&2; exit 1; }
    
    # Verify directories were created
    [ -d "$INFRA_DIR/.terraform/lambda-packages/health" ] || { echo '{"error":"Health directory not found after creation"}' >&2; exit 1; }
    [ -d "$INFRA_DIR/.terraform/lambda-packages/expenses" ] || { echo '{"error":"Expenses directory not found after creation"}' >&2; exit 1; }
    [ -d "$INFRA_DIR/.terraform/lambda-packages/ingest" ] || { echo '{"error":"Ingest directory not found after creation"}' >&2; exit 1; }
    [ -d "$INFRA_DIR/.terraform/lambda-packages/processExpense" ] || { echo '{"error":"ProcessExpense directory not found after creation"}' >&2; exit 1; }
    [ -d "$INFRA_DIR/.terraform/lambda-packages/analyzeExpenses" ] || { echo '{"error":"AnalyzeExpenses directory not found after creation"}' >&2; exit 1; }
    
    # Return JSON output (required by external data source)
    echo '{"status":"success"}'
  EOT
  ]
}

data "archive_file" "health_zip" {
  depends_on = [data.external.build_lambda_packages]
  type        = "zip"
  source_dir  = "${path.module}/.terraform/lambda-packages/health"
  output_path = "${path.module}/.terraform/health.zip"
}

data "archive_file" "expenses_zip" {
  depends_on = [data.external.build_lambda_packages]
  type        = "zip"
  source_dir  = "${path.module}/.terraform/lambda-packages/expenses"
  output_path = "${path.module}/.terraform/expenses.zip"
}

data "archive_file" "ingest_zip" {
  depends_on = [data.external.build_lambda_packages]
  type        = "zip"
  source_dir  = "${path.module}/.terraform/lambda-packages/ingest"
  output_path = "${path.module}/.terraform/ingest.zip"
}

data "archive_file" "process_expense_zip" {
  depends_on = [data.external.build_lambda_packages]
  type        = "zip"
  source_dir  = "${path.module}/.terraform/lambda-packages/processExpense"
  output_path = "${path.module}/.terraform/processExpense.zip"
}

data "archive_file" "analyze_expenses_zip" {
  depends_on = [data.external.build_lambda_packages]
  type        = "zip"
  source_dir  = "${path.module}/.terraform/lambda-packages/analyzeExpenses"
  output_path = "${path.module}/.terraform/analyzeExpenses.zip"
}

resource "aws_lambda_function" "health" {
  depends_on      = [data.external.build_lambda_packages]
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

resource "aws_lambda_function" "expenses" {
  depends_on      = [data.external.build_lambda_packages]
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
      ANALYSIS_TABLE  = aws_dynamodb_table.analysis.name
    }
  }

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_lambda_function" "ingest" {
  depends_on      = [data.external.build_lambda_packages]
  filename         = data.archive_file.ingest_zip.output_path
  function_name    = "${var.app_name}-ingest"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "ingest.handler"
  source_code_hash = data.archive_file.ingest_zip.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = 300  # 5 minutes for large CSV processing
  memory_size     = 512  # 512 MB for parsing large CSV files

  environment {
    variables = {
      APP_NAME         = var.app_name
      SQS_QUEUE_URL    = aws_sqs_queue.ingest_queue.url
      S3_BUCKET_NAME   = aws_s3_bucket.csv_uploads.bucket
      ANALYSIS_QUEUE_URL = aws_sqs_queue.analysis_delay_queue.url
    }
  }

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_lambda_function" "process_expense" {
  depends_on      = [data.external.build_lambda_packages]
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
    }
  }

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_lambda_function" "analyze_expenses" {
  depends_on      = [data.external.build_lambda_packages]
  filename         = data.archive_file.analyze_expenses_zip.output_path
  function_name    = "${var.app_name}-analyze-expenses"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "analyzeExpenses.handler"
  source_code_hash = data.archive_file.analyze_expenses_zip.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = 60

  environment {
    variables = {
      APP_NAME       = var.app_name
      EXPENSES_TABLE = aws_dynamodb_table.expenses.name
      ANALYSIS_TABLE = aws_dynamodb_table.analysis.name
    }
  }

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_lambda_event_source_mapping" "process_expense_sqs" {
  event_source_arn = aws_sqs_queue.ingest_queue.arn
  function_name    = aws_lambda_function.process_expense.arn
  batch_size       = 10
  maximum_batching_window_in_seconds = 5
}

resource "aws_lambda_event_source_mapping" "analyze_expenses_sqs" {
  event_source_arn = aws_sqs_queue.analysis_delay_queue.arn
  function_name    = aws_lambda_function.analyze_expenses.arn
  batch_size       = 1
  maximum_batching_window_in_seconds = 0
}

resource "aws_cognito_user_pool" "main" {
  name = "${var.app_name}-user-pool"
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your verification code"
    email_message        = "Your verification code is {####}"
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = false
    mutable             = true
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = false
    mutable             = true
  }

  tags = {
    Name = "finance-manager"
  }

  lifecycle {
    ignore_changes = [schema]
  }
}

resource "aws_cognito_user_pool_client" "main" {
  name         = "${var.app_name}-client"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                   = ["code"]
  allowed_oauth_scopes                 = ["openid"]
  supported_identity_providers = ["COGNITO"]

  callback_urls = [
    "${var.cognito_callback_url}/auth/callback",
    "http://localhost:5173/auth/callback"
  ]

  logout_urls = [
    "${var.cognito_callback_url}/",
    "http://localhost:5173/"
  ]

  prevent_user_existence_errors = "ENABLED"

  lifecycle {
    ignore_changes = [callback_urls, logout_urls]
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.app_name}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.main.id
}

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

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${var.app_name}-cognito-authorizer"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.main.id]
    issuer   = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}

resource "aws_apigatewayv2_integration" "health" {
  api_id = aws_apigatewayv2_api.main.id

  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.health.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "expenses" {
  api_id = aws_apigatewayv2_api.main.id

  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.expenses.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_integration" "ingest" {
  api_id = aws_apigatewayv2_api.main.id

  integration_type   = "AWS_PROXY"
  integration_uri    = aws_lambda_function.ingest.invoke_arn
  integration_method = "POST"
}

resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /api/health"
  target    = "integrations/${aws_apigatewayv2_integration.health.id}"
}

resource "aws_apigatewayv2_route" "expenses_get" {
  api_id           = aws_apigatewayv2_api.main.id
  route_key        = "GET /api/expenses"
  target           = "integrations/${aws_apigatewayv2_integration.expenses.id}"
  authorizer_id    = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "expenses_post" {
  api_id           = aws_apigatewayv2_api.main.id
  route_key        = "POST /api/expenses"
  target           = "integrations/${aws_apigatewayv2_integration.expenses.id}"
  authorizer_id    = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "expenses_put" {
  api_id           = aws_apigatewayv2_api.main.id
  route_key        = "PUT /api/expenses"
  target           = "integrations/${aws_apigatewayv2_integration.expenses.id}"
  authorizer_id    = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "expenses_analysis_get" {
  api_id           = aws_apigatewayv2_api.main.id
  route_key        = "GET /api/expenses/analysis"
  target           = "integrations/${aws_apigatewayv2_integration.expenses.id}"
  authorizer_id    = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "expenses_analysis_all_time_get" {
  api_id           = aws_apigatewayv2_api.main.id
  route_key        = "GET /api/expenses/analysis/all-time"
  target           = "integrations/${aws_apigatewayv2_integration.expenses.id}"
  authorizer_id    = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "expenses_analysis_monthly_trend_get" {
  api_id           = aws_apigatewayv2_api.main.id
  route_key        = "GET /api/expenses/analysis/monthly-trend"
  target           = "integrations/${aws_apigatewayv2_integration.expenses.id}"
  authorizer_id    = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "expenses_analysis_refresh_post" {
  api_id           = aws_apigatewayv2_api.main.id
  route_key        = "POST /api/expenses/analysis/refresh"
  target           = "integrations/${aws_apigatewayv2_integration.expenses.id}"
  authorizer_id    = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "ingest_post" {
  api_id           = aws_apigatewayv2_api.main.id
  route_key        = "POST /api/ingest"
  target           = "integrations/${aws_apigatewayv2_integration.ingest.id}"
  authorizer_id    = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_lambda_permission" "health_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.health.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "expenses_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.expenses.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

resource "aws_lambda_permission" "ingest_api_gw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

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

  custom_rule {
    source = "/<*>"
    status = "200"
    target = "/index.html"
  }

  environment_variables = {
    REACT_APP_API_URL = aws_apigatewayv2_api.main.api_endpoint
    VITE_API_URL      = aws_apigatewayv2_api.main.api_endpoint
    VITE_COGNITO_USER_POOL_ID = aws_cognito_user_pool.main.id
    VITE_COGNITO_CLIENT_ID    = aws_cognito_user_pool_client.main.id
    VITE_COGNITO_DOMAIN       = aws_cognito_user_pool_domain.main.domain
    VITE_COGNITO_REGION       = data.aws_region.current.name
    VITE_COGNITO_HOSTED_UI_URL = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.name}.amazoncognito.com"
    VITE_COGNITO_REDIRECT_URI = "${var.cognito_callback_url}/auth/callback"
  }

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.frontend.id
  branch_name = var.amplify_branch

  enable_auto_build = true
  enable_pull_request_preview = false

  tags = {
    Name = "finance-manager"
  }
}

resource "null_resource" "update_cognito_callbacks" {
  depends_on = [aws_amplify_app.frontend, aws_cognito_user_pool_client.main, aws_amplify_branch.main]

  triggers = {
    amplify_domain = aws_amplify_app.frontend.default_domain
    cognito_client_id = aws_cognito_user_pool_client.main.id
    user_pool_id = aws_cognito_user_pool.main.id
    amplify_app_id = aws_amplify_app.frontend.id
  }

  provisioner "local-exec" {
    command = <<-EOT
      set -e
      
      USER_POOL_ID="${aws_cognito_user_pool.main.id}"
      CLIENT_ID="${aws_cognito_user_pool_client.main.id}"
      AMPLIFY_APP_ID="${aws_amplify_app.frontend.id}"
      REGION="${data.aws_region.current.name}"
      BRANCH="${var.amplify_branch}"
      API_URL="${aws_apigatewayv2_api.main.api_endpoint}"
      COGNITO_DOMAIN="${aws_cognito_user_pool_domain.main.domain}"
      
      # Get Amplify app details to construct URL
      AMPLIFY_DOMAIN=$(aws amplify get-app --app-id "$AMPLIFY_APP_ID" --region "$REGION" --query 'app.defaultDomain' --output text 2>/dev/null || echo "")
      
      if [ -z "$AMPLIFY_DOMAIN" ]; then
        echo "Error: Could not get Amplify domain"
        exit 1
      fi
      
      AMPLIFY_URL="https://$BRANCH.$AMPLIFY_DOMAIN"
      CALLBACK_URL="$AMPLIFY_URL/auth/callback"
      LOGOUT_URL="$AMPLIFY_URL/"
      
      echo "Updating Cognito callback URLs with: $CALLBACK_URL"
      echo "Setting callback URLs: $CALLBACK_URL and http://localhost:5173/auth/callback"
      aws cognito-idp update-user-pool-client \
        --user-pool-id "$USER_POOL_ID" \
        --client-id "$CLIENT_ID" \
        --callback-urls "$CALLBACK_URL" "http://localhost:5173/auth/callback" \
        --logout-urls "$LOGOUT_URL" "http://localhost:5173/" \
        --allowed-o-auth-flows code \
        --allowed-o-auth-flows-user-pool-client \
        --allowed-o-auth-scopes openid \
        --supported-identity-providers COGNITO \
        --region "$REGION" || {
          echo "Error: Failed to update Cognito client. Retrying..."
          exit 1
        }
      
      echo "Successfully updated Cognito callback URLs"
      echo "Updating Amplify environment variable VITE_COGNITO_REDIRECT_URI"
      aws amplify update-app \
        --app-id "$AMPLIFY_APP_ID" \
        --environment-variables "REACT_APP_API_URL=$API_URL,VITE_API_URL=$API_URL,VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID,VITE_COGNITO_CLIENT_ID=$CLIENT_ID,VITE_COGNITO_DOMAIN=$COGNITO_DOMAIN,VITE_COGNITO_REGION=$REGION,VITE_COGNITO_HOSTED_UI_URL=https://$COGNITO_DOMAIN.auth.$REGION.amazoncognito.com,VITE_COGNITO_REDIRECT_URI=$CALLBACK_URL" \
        --region "$REGION" || echo "Warning: Could not update Amplify environment variables"
      
      echo "Successfully updated Amplify environment variables"
    EOT
  }
}

