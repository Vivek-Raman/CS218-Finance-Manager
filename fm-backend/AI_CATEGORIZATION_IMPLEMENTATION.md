# AI Categorization Implementation Summary

## ✅ Completed Implementation

### Backend Services Created

1. **`services/categoryManager.js`**
   - Manages pre-defined and user-defined categories
   - Extracts user-defined categories from existing expenses
   - Validates categories against available list

2. **`services/expenseCategorizer.js`**
   - Uses OpenAI SDK for AI categorization
   - Processes batches of up to 100 expenses
   - Implements retry logic with exponential backoff
   - Validates and parses JSON responses from OpenAI
   - Falls back to "Other" category if AI returns invalid category

### Handlers Updated

1. **`handlers/ingest.js`**
   - ✅ Accepts `aiCategorizationEnabled` flag from form fields
   - ✅ Passes flag to SQS message for processing

2. **`handlers/processExpense.js`**
   - ✅ Handles `aiCategorizationEnabled` flag from SQS messages
   - ✅ Sets `aiCategorizationStatus` to 'pending' when enabled
   - ✅ Sends expense to categorization queue after saving to DynamoDB
   - ✅ Includes helper function `sendToCategorizationQueue()`

3. **`handlers/expenses.js`**
   - ✅ POST endpoint accepts `aiCategorizationEnabled` flag
   - ✅ Sets AI categorization fields when flag is true
   - ✅ Sends to categorization queue asynchronously
   - ✅ New endpoint: `POST /api/expenses/categorize/validate`
   - ✅ Validation endpoint allows users to accept/reject AI suggestions

4. **`handlers/categorizeExpenses.js`** (NEW)
   - ✅ Processes categorization queue
   - ✅ Batches expenses by userId
   - ✅ Processes up to 100 expenses per batch
   - ✅ Updates expense status: pending → processing → completed/failed
   - ✅ Extracts user-defined categories from existing expenses
   - ✅ Calls OpenAI API for categorization
   - ✅ Updates expenses with AI suggestions

### Dependencies Updated

- ✅ Added `openai` package (v4.20.0) to `package.json`

## 📋 Infrastructure Changes Required

The following infrastructure updates are needed in `infra/deploy.tf`:

### 1. Add SQS Queues

```hcl
resource "aws_sqs_queue" "categorization_dlq" {
  name                      = "${var.app_name}-categorization-dlq"
  message_retention_seconds = 1209600

  tags = {
    Name = "finance-manager"
  }
}

resource "aws_sqs_queue" "categorization_queue" {
  name                      = "${var.app_name}-categorization-queue"
  message_retention_seconds = 345600
  visibility_timeout_seconds = 300  # 5 minutes for batch processing

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.categorization_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "finance-manager"
  }
}
```

### 2. Add Environment Variables

**For `processExpense` Lambda:**
```hcl
resource "aws_lambda_function" "process_expense" {
  environment {
    variables = {
      APP_NAME                = var.app_name
      EXPENSES_TABLE          = aws_dynamodb_table.expenses.name
      CATEGORIZATION_QUEUE_URL = aws_sqs_queue.categorization_queue.url  # ADD THIS
    }
  }
}
```

**For `expenses` Lambda:**
```hcl
resource "aws_lambda_function" "expenses" {
  environment {
    variables = {
      APP_NAME                = var.app_name
      EXPENSES_TABLE          = aws_dynamodb_table.expenses.name
      ANALYSIS_TABLE          = aws_dynamodb_table.analysis.name
      CATEGORIZATION_QUEUE_URL = aws_sqs_queue.categorization_queue.url  # ADD THIS
    }
  }
}
```

**For new `categorizeExpenses` Lambda:**
```hcl
resource "aws_lambda_function" "categorize_expenses" {
  environment {
    variables = {
      APP_NAME                = var.app_name
      EXPENSES_TABLE          = aws_dynamodb_table.expenses.name
      OPENAI_API_KEY          = var.openai_api_key  # ADD THIS
      OPENAI_MODEL            = var.openai_model    # ADD THIS (default: "gpt-3.5-turbo")
      OPENAI_TEMPERATURE      = "0.3"               # Optional
      OPENAI_MAX_TOKENS       = "200"                # Optional
    }
  }
}
```

### 3. Add Terraform Variables

In `infra/variables.tf`:
```hcl
variable "openai_api_key" {
  description = "OpenAI API key for AI categorization"
  type        = string
  sensitive   = true
}

variable "openai_model" {
  description = "OpenAI model to use for categorization"
  type        = string
  default     = "gpt-3.5-turbo"
}
```

### 4. Update SQS IAM Policy

Add categorization queues to SQS access policy:
```hcl
resource "aws_iam_role_policy" "sqs_access" {
  policy = jsonencode({
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
          aws_sqs_queue.analysis_dlq.arn,
          aws_sqs_queue.categorization_queue.arn,      # ADD THIS
          aws_sqs_queue.categorization_dlq.arn,        # ADD THIS
        ]
      }
    ]
  })
}
```

### 5. Add Lambda Build Steps

In `data.external.build_lambda_packages`, add:
```bash
# Build categorizeExpenses package
mkdir -p "$INFRA_DIR/.terraform/lambda-packages/categorizeExpenses" || { echo '{"error":"Failed to create categorizeExpenses directory"}' >&2; exit 1; }
cp handlers/categorizeExpenses.js "$INFRA_DIR/.terraform/lambda-packages/categorizeExpenses/" || { echo '{"error":"Failed to copy categorizeExpenses.js"}' >&2; exit 1; }
cp -r node_modules "$INFRA_DIR/.terraform/lambda-packages/categorizeExpenses/" 2>/dev/null || { echo '{"error":"Failed to copy node_modules for categorizeExpenses"}' >&2; exit 1; }
cp -r services "$INFRA_DIR/.terraform/lambda-packages/categorizeExpenses/" 2>/dev/null || { echo '{"error":"Failed to copy services directory"}' >&2; exit 1; }
```

Add verification:
```bash
[ -d "$INFRA_DIR/.terraform/lambda-packages/categorizeExpenses" ] || { echo '{"error":"categorizeExpenses directory not found after creation"}' >&2; exit 1; }
```

### 6. Add Archive File

```hcl
data "archive_file" "categorize_expenses_zip" {
  depends_on = [data.external.build_lambda_packages]
  type        = "zip"
  source_dir  = "${path.module}/.terraform/lambda-packages/categorizeExpenses"
  output_path = "${path.module}/.terraform/categorizeExpenses.zip"
}
```

### 7. Create categorizeExpenses Lambda Function

```hcl
resource "aws_lambda_function" "categorize_expenses" {
  depends_on      = [data.external.build_lambda_packages]
  filename         = data.archive_file.categorize_expenses_zip.output_path
  function_name    = "${var.app_name}-categorize-expenses"
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "categorizeExpenses.handler"
  source_code_hash = data.archive_file.categorize_expenses_zip.output_base64sha256
  runtime         = "nodejs20.x"
  timeout         = 300  # 5 minutes for batch processing
  memory_size     = 512  # 512 MB for processing batches

  environment {
    variables = {
      APP_NAME                = var.app_name
      EXPENSES_TABLE          = aws_dynamodb_table.expenses.name
      OPENAI_API_KEY          = var.openai_api_key
      OPENAI_MODEL            = var.openai_model
    }
  }

  tags = {
    Name = "finance-manager"
  }
}
```

### 8. Add Event Source Mapping

```hcl
resource "aws_lambda_event_source_mapping" "categorize_expenses_sqs" {
  event_source_arn = aws_sqs_queue.categorization_queue.arn
  function_name    = aws_lambda_function.categorize_expenses.arn
  batch_size       = 10  # Process up to 10 SQS messages at a time
  maximum_batching_window_in_seconds = 5
}
```

### 9. Add API Gateway Route

```hcl
resource "aws_apigatewayv2_route" "expenses_categorize_validate_post" {
  api_id           = aws_apigatewayv2_api.main.id
  route_key        = "POST /api/expenses/categorize/validate"
  target           = "integrations/${aws_apigatewayv2_integration.expenses.id}"
  authorizer_id    = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}
```

## 🔧 Deployment Steps

1. **Install dependencies:**
   ```bash
   cd fm-backend
   npm install
   ```

2. **Update infrastructure:**
   - Add all the Terraform resources listed above
   - Set `openai_api_key` variable (use `tofu apply -var="openai_api_key=your-key"` or set in `.tfvars`)

3. **Deploy:**
   ```bash
   cd infra
   tofu plan
   tofu apply
   ```

## 📝 Usage

### Enable AI Categorization on Upload

**CSV Upload (ingest.js):**
- Add form field: `aiCategorizationEnabled: "true"`

**Manual POST (expenses.js):**
```json
{
  "summary": "Starbucks coffee",
  "amount": 5.50,
  "timestamp": "2024-01-15T10:00:00Z",
  "aiCategorizationEnabled": true
}
```

### Validate AI Suggestion

**POST /api/expenses/categorize/validate:**
```json
{
  "expenseId": "abc123...",
  "validated": true  // or false to reject
}
```

If `validated: false`, optionally provide different category:
```json
{
  "expenseId": "abc123...",
  "validated": false,
  "category": "Food & Dining"
}
```

## 🔍 Monitoring

- Check CloudWatch logs for categorization Lambda
- Monitor SQS queue metrics (messages in queue, DLQ)
- Track expense status fields:
  - `aiCategorizationStatus`: 'pending' | 'processing' | 'completed' | 'failed'
  - `aiCategorySuggestion`: The AI's suggested category
  - `aiCategoryValidated`: true/false (user validation)

## ⚠️ Notes

- OpenAI API key must be set as Terraform variable
- Batch processing handles up to 100 expenses at a time
- Failed categorizations go to DLQ after 3 retries
- User-defined categories are extracted from user's existing categorized expenses
- All changes are backward compatible - existing functionality unchanged
