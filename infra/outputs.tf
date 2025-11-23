# Environment outputs (loaded by Make for local development)
output "env_api_gateway_url" {
  description = "API Gateway endpoint URL"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "env_dynamodb_table_name" {
  description = "DynamoDB expenses table name"
  value       = aws_dynamodb_table.expenses.name
}

# Infrastructure outputs (not loaded as environment variables)
output "api_gateway_url" {
  description = "API Gateway endpoint URL (legacy, use env_api_gateway_url)"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "amplify_app_url" {
  description = "Amplify app URL"
  value       = "https://${var.amplify_branch}.${aws_amplify_app.frontend.default_domain}"
}

output "health_lambda_arn" {
  description = "Health Lambda function ARN"
  value       = aws_lambda_function.health.arn
}

output "expenses_lambda_arn" {
  description = "Expenses Lambda function ARN"
  value       = aws_lambda_function.expenses.arn
}

output "amplify_app_id" {
  description = "Amplify app ID"
  value       = aws_amplify_app.frontend.id
}

output "dynamodb_table_name" {
  description = "DynamoDB expenses table name (legacy, use env_dynamodb_table_name)"
  value       = aws_dynamodb_table.expenses.name
}

output "dynamodb_table_arn" {
  description = "DynamoDB expenses table ARN"
  value       = aws_dynamodb_table.expenses.arn
}

