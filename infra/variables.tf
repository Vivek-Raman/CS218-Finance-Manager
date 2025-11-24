variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-west-1"
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "finance-manager"
}

variable "amplify_repository" {
  description = "Repository URL for Amplify (if using Git-based deployment)"
  type        = string
  default     = ""
}

variable "amplify_branch" {
  description = "Branch name for Amplify deployment"
  type        = string
  default     = "main"
}

variable "cognito_callback_url" {
  description = "Base URL for Cognito OAuth callbacks (will be set automatically after Amplify deployment)"
  type        = string
  default     = "http://localhost:5173"
}

