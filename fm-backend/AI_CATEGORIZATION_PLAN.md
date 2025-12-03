# AI Expense Categorization Feature - Implementation Plan (Updated)

## Overview
This document outlines the implementation plan for adding AI-powered automatic expense categorization using OpenRouter API. The feature uses async queue-based processing, supports per-expense AI categorization flags, tracks user validation, and works with both pre-defined and user-defined categories.

## Current System Analysis

### Backend Architecture
- **Lambda Functions**: Node.js 20.x runtime
- **Database**: DynamoDB (expenses table with userId-index)
- **API Gateway**: HTTP API with JWT authentication via Cognito
- **Queues**: SQS for async processing (ingest_queue, analysis_delay_queue)
- **Current Expense Schema**:
  ```javascript
  {
    id: string;                    // SHA256 hash of userId|summary|timestamp
    userId: string;                // Cognito user ID
    summary: string;               // Expense description
    amount: number;                // Expense amount
    timestamp: string;             // ISO timestamp
    category?: string;             // Optional category
    categorizedAt?: string;        // ISO timestamp when categorized
    createdAt: string;            // ISO timestamp
    updatedAt: string;            // ISO timestamp
  }
  ```

### Current Categorization Flow
1. Expenses are created without categories (via CSV ingest or manual entry)
2. Users manually categorize expenses via `PUT /api/expenses` endpoint
3. Categorized expenses are used in analysis calculations

### Key Files
- `handlers/expenses.js` - Main expense CRUD operations
- `handlers/processExpense.js` - Processes SQS messages to create expenses
- `handlers/ingest.js` - Handles CSV uploads
- `handlers/analyzeExpenses.js` - Calculates category breakdowns

## Requirements

### Functional Requirements
1. **Async Categorization**: Categorization happens asynchronously via SQS queue
2. **Per-Expense Flag**: Each expense has `aiCategorizationEnabled` flag set during upload
3. **Batch Processing**: Process up to 100 expenses at a time
4. **Validation Tracking**: Track whether user validated AI categorization
5. **Category Management**: Support both pre-defined and user-defined categories
6. **JSON Response**: AI must return structured JSON response
7. **System Prompt**: Comprehensive prompt with constraints and problem statement

### Non-Functional Requirements
1. **Self-contained Module**: Categorization logic in separate, reusable module
2. **OpenRouter SDK**: Use official OpenRouter SDK (not fetch)
3. **Cost Efficiency**: Batch requests to minimize API calls
4. **Rate Limiting**: Handle OpenRouter rate limits appropriately
5. **Performance**: Process batches within Lambda timeout (60s default)
6. **Extensibility**: Easy to add new category sources or modify constraints

## Updated Expense Schema

### New Fields
```javascript
{
  // ... existing fields ...
  aiCategorizationEnabled?: boolean;    // Set during upload, defaults to false
  aiCategorizationStatus?: string;     // Status: 'pending' | 'processing' | 'completed' | 'failed'
  aiCategorySuggestion?: string;        // AI's suggested category
  aiCategoryValidated?: boolean;        // Whether user validated (true) or rejected (false)
  aiCategorizedAt?: string;            // ISO timestamp when AI categorized
}
```

### Field Usage
- **aiCategorizationEnabled**: Set to `true` when expense is uploaded with AI categorization requested
- **aiCategorizationStatus**: 
  - `'pending'`: Expense queued for categorization but not yet processed
  - `'processing'`: Currently being processed by AI categorization Lambda
  - `'completed'`: AI categorization completed successfully (has `aiCategorySuggestion`)
  - `'failed'`: AI categorization failed (error occurred)
  - `undefined`: AI categorization not enabled for this expense
- **aiCategorySuggestion**: Stores the category suggested by AI (set by categorization Lambda)
- **aiCategoryValidated**: 
  - `undefined/null`: Not yet validated by user
  - `true`: User confirmed the suggestion
  - `false`: User rejected the suggestion (can manually set different category)
- **aiCategorizedAt**: Timestamp when AI categorization was completed

### Status Flow
1. **Upload**: If `aiCategorizationEnabled=true`, set `aiCategorizationStatus='pending'` and send to queue
2. **Queue Processing**: When Lambda picks up from queue, set `aiCategorizationStatus='processing'`
3. **Completion**: After AI categorization succeeds, set `aiCategorizationStatus='completed'` and populate `aiCategorySuggestion`
4. **Failure**: If categorization fails, set `aiCategorizationStatus='failed'`

### Category Field Behavior (Backward Compatible)
- **Existing behavior preserved**: `category` and `categorizedAt` fields work exactly as before
- If `aiCategoryValidated === true`, the `category` field should match `aiCategorySuggestion`
- If `aiCategoryValidated === false`, user can set a different `category`
- If `aiCategoryValidated === undefined`, expense is pending user validation
- **Backward compatibility**: Expenses without AI categorization fields behave exactly as before

## Implementation Plan

### Phase 1: Category Management System

#### 1.1 Category Storage
**Option 1: DynamoDB Table** (Recommended for scalability)
- New table: `user-categories` or store in existing `analysis` table
- Structure:
  ```javascript
  {
    userId: string,              // Partition key
    categoryType: string,        // Sort key: 'predefined' | 'user-defined'
    categories: string[],        // Array of category names
    lastUpdated: string          // ISO timestamp
  }
  ```

**Option 2: Extract from Existing Expenses** (Simpler, no new table)
- Query user's categorized expenses
- Extract unique categories from `category` field
- Combine with pre-defined categories

**Implementation**: Start with Option 2, can migrate to Option 1 later if needed.

#### 1.2 Pre-defined Categories
**File**: `services/categoryManager.js` (NEW)

```javascript
const PREDEFINED_CATEGORIES = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Bills & Utilities',
  'Entertainment',
  'Healthcare',
  'Travel',
  'Education',
  'Personal Care',
  'Other'
];

/**
 * Get all available categories for a user (pre-defined + user-defined)
 * @param {string} userId - User ID
 * @param {Array} userExpenses - User's categorized expenses (optional, for extracting user-defined)
 * @returns {Promise<{predefined: string[], userDefined: string[], all: string[]}>}
 */
async function getUserCategories(userId, userExpenses = null) { ... }

/**
 * Extract user-defined categories from their expenses
 * @param {Array} expenses - User's categorized expenses
 * @returns {string[]} - Array of user-defined category names
 */
function extractUserDefinedCategories(expenses) { ... }
```

### Phase 2: Core Categorization Module

#### 2.1 Create Categorization Service Module
**File**: `services/expenseCategorizer.js`

**Module Structure** (CommonJS, matching existing code style):
- Module-level constants from `process.env`
- Exported functions (not a class, matching existing pattern)
- Uses OpenRouter SDK

**Module-Level Constants** (matching existing pattern):
```javascript
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo';
const OPENROUTER_TEMPERATURE = parseFloat(process.env.OPENROUTER_TEMPERATURE) || 0.3;
const OPENROUTER_MAX_TOKENS = parseInt(process.env.OPENROUTER_MAX_TOKENS) || 200;
const OPENROUTER_RETRY_ATTEMPTS = parseInt(process.env.OPENROUTER_RETRY_ATTEMPTS) || 3;
```

**Dependencies**:
```json
{
  "@openrouter/sdk": "^1.0.0"
}
```

**Exported Functions**:
```javascript
/**
 * Categorize a batch of expenses (up to 100)
 * @param {Array<Expense>} expenses - Array of expenses to categorize
 * @param {Array<string>} availableCategories - All available categories (pre-defined + user-defined)
 * @returns {Promise<BatchCategorizationResult>}
 */
async function categorizeBatch(expenses, availableCategories) { ... }
```

**Private Helper Functions**:
```javascript
function buildSystemPrompt(availableCategories)
function buildUserPrompt(expense)
async function callOpenRouterAPI(messages, options)
function parseCategoryResponse(response, availableCategories)
function validateCategory(category, availableCategories)
```

#### 2.2 System Prompt Design

**System Prompt Structure**:
```
You are an expense categorization assistant. Your task is to categorize expenses based on their description, amount, and date.

CONSTRAINTS:
1. You MUST select a category from the provided list of available categories
2. You MUST return ONLY valid JSON in the following format:
   {
     "category": "Category Name",
     "confidence": 0.95,
     "reasoning": "Brief explanation"
   }
3. The category name MUST exactly match one of the available categories (case-sensitive)
4. Confidence must be a number between 0 and 1
5. Reasoning should be a brief explanation (max 50 words)

AVAILABLE CATEGORIES:
{list of categories}

PROBLEM STATEMENT:
Given an expense with description, amount, and timestamp, determine the most appropriate category from the available list. Consider:
- The nature of the expense (what was purchased/service used)
- The amount (may indicate type of expense)
- The context (date/time may provide clues)
- User's existing categorization patterns (if available)

If the expense doesn't clearly fit any category, choose the closest match or "Other" if truly unclassifiable.

RESPONSE FORMAT:
Return ONLY valid JSON. No additional text, no markdown, no explanations outside the JSON.
```

**User Prompt Structure** (per expense):
```
Categorize this expense:
- Description: {summary}
- Amount: ${amount}
- Date: {timestamp}

Return JSON with category, confidence, and reasoning.
```

#### 2.3 OpenRouter SDK Integration

**Installation**:
```bash
npm install @openrouter/sdk
```

**Usage** (matching existing code style - CommonJS):
```javascript
const { OpenRouter } = require('@openrouter/sdk');

// Initialize OpenRouter client (module-level, matching existing pattern)
const openRouter = new OpenRouter({
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL || 'https://finance-manager.app', // Optional
    'X-Title': 'Finance Manager', // Optional
  },
});

async function callOpenRouterAPI(messages, options) {
  try {
    const completion = await openRouter.chat.send({
      model: OPENROUTER_MODEL,
      messages: messages,
      temperature: OPENROUTER_TEMPERATURE,
      max_tokens: OPENROUTER_MAX_TOKENS,
      stream: false,
      // If SDK supports JSON mode, add: response_format: { type: 'json_object' }
    });
    
    return completion;
  } catch (error) {
    console.error('OpenRouter API error', {
      error: error.message,
      statusCode: error.status || error.statusCode,
      stack: error.stack,
    });
    throw error;
  }
}
```

**Note**: The OpenRouter SDK uses `chat.send()` method. The response structure is `completion.choices[0].message.content`. The system prompt enforces JSON format, so we parse the content string as JSON.

**Complete Module Example** (`services/expenseCategorizer.js` structure):
```javascript
const { OpenRouter } = require('@openrouter/sdk');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo';
const OPENROUTER_TEMPERATURE = parseFloat(process.env.OPENROUTER_TEMPERATURE) || 0.3;
const OPENROUTER_MAX_TOKENS = parseInt(process.env.OPENROUTER_MAX_TOKENS) || 200;

// Initialize OpenRouter client (module-level, matching existing pattern)
const openRouter = new OpenRouter({
  apiKey: OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL || 'https://finance-manager.app',
    'X-Title': 'Finance Manager',
  },
});

async function callOpenRouterAPI(messages) {
  try {
    const completion = await openRouter.chat.send({
      model: OPENROUTER_MODEL,
      messages: messages,
      temperature: OPENROUTER_TEMPERATURE,
      max_tokens: OPENROUTER_MAX_TOKENS,
      stream: false,
    });
    
    return completion;
  } catch (error) {
    console.error('OpenRouter API error', {
      error: error.message,
      statusCode: error.status || error.statusCode,
      stack: error.stack,
    });
    throw error;
  }
}

// ... other helper functions ...

module.exports = {
  categorizeBatch,
};
```

**JSON Response Parsing**:
```javascript
function parseCategoryResponse(completion, availableCategories) {
  try {
    // OpenRouter SDK returns completion.choices[0].message.content
    const content = completion.choices[0].message.content;
    
    // Parse JSON from content string
    const parsed = JSON.parse(content);
    
    // Validate structure
    if (!parsed.category || typeof parsed.category !== 'string') {
      throw new Error('Invalid response: missing or invalid category field');
    }
    
    // Validate category is in available list
    const category = validateCategory(parsed.category, availableCategories);
    
    return {
      category: category,
      confidence: parsed.confidence || 0.5,
      reasoning: parsed.reasoning || '',
    };
  } catch (error) {
    console.error('Error parsing category response', {
      error: error.message,
      content: completion.choices[0]?.message?.content,
      stack: error.stack,
    });
    throw error;
  }
}
```

### Phase 3: Queue-Based Async Processing

#### 3.1 Update Expense Creation
**File**: `handlers/processExpense.js`

**Changes**:
1. Accept `aiCategorizationEnabled` flag from SQS message
2. Set `aiCategorizationEnabled` and `aiCategorizationStatus` fields on expense
3. If `aiCategorizationEnabled === true`, set status to `'pending'` and send expense to categorization queue immediately

**Updated Message Format** (from ingest.js):
```javascript
{
  userId: string,
  summary: string,
  amount: number,
  timestamp: string,
  aiCategorizationEnabled?: boolean,  // NEW: Optional flag
  s3Key?: string,
  category?: string,  // Existing: if category provided, skip AI
}
```

**Updated processExpense.js Logic**:
```javascript
// Create expense item
const expense = {
  id: expenseId,
  userId: userId,
  summary: summary,
  amount: parsedAmount,
  timestamp: timestamp,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Handle AI categorization flag
if (messageBody.aiCategorizationEnabled && !category) {
  expense.aiCategorizationEnabled = true;
  expense.aiCategorizationStatus = 'pending';  // Initial status
} else {
  // If category provided or AI not enabled, don't set AI fields (backward compatible)
  if (category) {
    expense.category = category.trim();
    expense.categorizedAt = new Date().toISOString();
  }
}

// Save to DynamoDB first
await dynamodb.send(new PutCommand({
  TableName: TABLE_NAME,
  Item: expense,
}));

// After saving, if AI categorization enabled, send to queue
if (expense.aiCategorizationEnabled && expense.aiCategorizationStatus === 'pending') {
  try {
    await sendToCategorizationQueue({
      expenseId: expense.id,
      userId: expense.userId,
    });
    console.log('Expense sent to categorization queue', {
      expenseId: expense.id,
      userId: expense.userId,
    });
  } catch (queueError) {
    // Log error but don't fail expense creation
    console.error('Error sending to categorization queue', {
      expenseId: expense.id,
      error: queueError.message,
    });
    // Optionally update status to 'failed' if queue send fails
    // For now, leave as 'pending' - will be retried
  }
}
```

**Helper Function** (add to processExpense.js):
```javascript
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const sqs = new SQSClient({});
const CATEGORIZATION_QUEUE_URL = process.env.CATEGORIZATION_QUEUE_URL;

async function sendToCategorizationQueue(message) {
  if (!CATEGORIZATION_QUEUE_URL) {
    throw new Error('CATEGORIZATION_QUEUE_URL environment variable is not set');
  }
  
  await sqs.send(new SendMessageCommand({
    QueueUrl: CATEGORIZATION_QUEUE_URL,
    MessageBody: JSON.stringify({
      expenseId: message.expenseId,
      userId: message.userId,
      timestamp: new Date().toISOString(),
    }),
  }));
}
```

#### 3.2 Categorization Queue
**File**: `infra/deploy.tf`

**New SQS Queue**:
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
  visibility_timeout_seconds = 300  # 5 minutes for batch processing (100 expenses)

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.categorization_dlq.arn
    maxReceiveCount     = 3
  })

  tags = {
    Name = "finance-manager"
  }
}
```

**Note**: Visibility timeout of 300 seconds (5 minutes) allows Lambda to process batches of up to 100 expenses. If processing takes longer, messages will become visible again and be retried.

**Queue Message Format**:
```javascript
{
  expenseId: string,
  userId: string,
  timestamp: string,  // When queued
}
```

#### 3.3 Categorization Lambda Handler
**File**: `handlers/categorizeExpenses.js` (NEW)

**Purpose**: Process categorization queue, categorize expenses in batches of up to 100

**Structure** (matching existing handler pattern):
```javascript
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, BatchGetCommand } = require('@aws-sdk/lib-dynamodb');
const { categorizeBatch } = require('../services/expenseCategorizer');
const { getUserCategories } = require('../services/categoryManager');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const EXPENSES_TABLE = process.env.EXPENSES_TABLE;
const MAX_BATCH_SIZE = 100;

// Validate environment variables
if (!EXPENSES_TABLE) {
  throw new Error('EXPENSES_TABLE environment variable is not set');
}

/**
 * Process categorization for a batch of expenses (up to MAX_BATCH_SIZE)
 */
async function processCategorizationBatch(expenseIds, userId) {
  console.log('Processing categorization batch', {
    userId: userId,
    expenseCount: expenseIds.length,
    expenseIds: expenseIds.slice(0, 10), // Log first 10 for debugging
  });
  
  // 1. Fetch expenses from DynamoDB (BatchGetCommand)
  const expenseKeys = expenseIds.map(id => ({ id }));
  const batchGetResult = await dynamodb.send(new BatchGetCommand({
    RequestItems: {
      [EXPENSES_TABLE]: {
        Keys: expenseKeys,
      },
    },
  }));
  
  const expenses = batchGetResult.Responses[EXPENSES_TABLE] || [];
  
  // 2. Filter to only expenses with aiCategorizationEnabled=true and status='pending'
  const eligibleExpenses = expenses.filter(expense => 
    expense.aiCategorizationEnabled === true && 
    expense.aiCategorizationStatus === 'pending' &&
    !expense.category  // Don't categorize if already has category
  );
  
  if (eligibleExpenses.length === 0) {
    console.log('No eligible expenses for categorization', {
      userId: userId,
      totalExpenses: expenses.length,
    });
    return {
      totalProcessed: expenses.length,
      successful: 0,
      failed: 0,
      skipped: expenses.length,
    };
  }
  
  // 3. Update status to 'processing' before starting
  const updatePromises = eligibleExpenses.map(expense =>
    dynamodb.send(new UpdateCommand({
      TableName: EXPENSES_TABLE,
      Key: { id: expense.id },
      UpdateExpression: 'SET aiCategorizationStatus = :status, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':status': 'processing',
        ':updatedAt': new Date().toISOString(),
      },
    }))
  );
  
  await Promise.all(updatePromises);
  console.log('Updated expenses to processing status', {
    userId: userId,
    count: eligibleExpenses.length,
  });
  
  // 4. Get user's available categories
  const userCategories = await getUserCategories(userId, null);
  const availableCategories = userCategories.all;
  
  // 5. Process in chunks of MAX_BATCH_SIZE (100)
  const results = [];
  for (let i = 0; i < eligibleExpenses.length; i += MAX_BATCH_SIZE) {
    const batch = eligibleExpenses.slice(i, i + MAX_BATCH_SIZE);
    
    try {
      // 6. Call categorizeBatch() - processes up to 100 expenses
      const categorizationResult = await categorizeBatch(batch, availableCategories);
      
      // 7. Update expenses with results
      const updateResults = await Promise.allSettled(
        categorizationResult.results.map(result => {
          if (result.error) {
            // Update to failed status
            return dynamodb.send(new UpdateCommand({
              TableName: EXPENSES_TABLE,
              Key: { id: result.expenseId },
              UpdateExpression: 'SET aiCategorizationStatus = :status, updatedAt = :updatedAt',
              ExpressionAttributeValues: {
                ':status': 'failed',
                ':updatedAt': new Date().toISOString(),
              },
            }));
          } else {
            // Update to completed status with suggestion
            return dynamodb.send(new UpdateCommand({
              TableName: EXPENSES_TABLE,
              Key: { id: result.expenseId },
              UpdateExpression: 'SET aiCategorizationStatus = :status, aiCategorySuggestion = :suggestion, aiCategorizedAt = :categorizedAt, updatedAt = :updatedAt',
              ExpressionAttributeValues: {
                ':status': 'completed',
                ':suggestion': result.suggestedCategory,
                ':categorizedAt': new Date().toISOString(),
                ':updatedAt': new Date().toISOString(),
              },
            }));
          }
        })
      );
      
      const successful = updateResults.filter(r => r.status === 'fulfilled').length;
      const failed = updateResults.filter(r => r.status === 'rejected').length;
      
      results.push({
        batchStart: i,
        batchEnd: Math.min(i + MAX_BATCH_SIZE, eligibleExpenses.length),
        categorized: categorizationResult.successful,
        failed: categorizationResult.failed + failed,
        updateSuccessful: successful,
        updateFailed: failed,
      });
      
      console.log('Batch categorization completed', {
        userId: userId,
        batchIndex: Math.floor(i / MAX_BATCH_SIZE) + 1,
        totalBatches: Math.ceil(eligibleExpenses.length / MAX_BATCH_SIZE),
        categorized: categorizationResult.successful,
        failed: categorizationResult.failed,
      });
    } catch (error) {
      console.error('Error processing categorization batch', {
        userId: userId,
        batchStart: i,
        batchEnd: Math.min(i + MAX_BATCH_SIZE, eligibleExpenses.length),
        error: error.message,
        stack: error.stack,
      });
      
      // Mark all expenses in this batch as failed
      await Promise.allSettled(
        batch.map(expense =>
          dynamodb.send(new UpdateCommand({
            TableName: EXPENSES_TABLE,
            Key: { id: expense.id },
            UpdateExpression: 'SET aiCategorizationStatus = :status, updatedAt = :updatedAt',
            ExpressionAttributeValues: {
              ':status': 'failed',
              ':updatedAt': new Date().toISOString(),
            },
          }))
        )
      );
      
      results.push({
        batchStart: i,
        batchEnd: Math.min(i + MAX_BATCH_SIZE, eligibleExpenses.length),
        categorized: 0,
        failed: batch.length,
      });
    }
  }
  
  // 8. Return aggregated results
  return {
    totalProcessed: expenses.length,
    eligible: eligibleExpenses.length,
    successful: results.reduce((sum, r) => sum + r.categorized, 0),
    failed: results.reduce((sum, r) => sum + r.failed, 0),
    skipped: expenses.length - eligibleExpenses.length,
  };
}

exports.handler = async (event) => {
  // Process SQS records
  // Group by userId for batch processing
  // Process up to MAX_BATCH_SIZE expenses per batch
  // Handle errors and retries
};
```

**Batch Processing Logic**:
```javascript
exports.handler = async (event) => {
  const startTime = Date.now();
  const recordCount = event.Records?.length || 0;
  
  console.log('Categorize expenses handler invoked', {
    recordCount: recordCount,
    timestamp: new Date().toISOString(),
  });
  
  // Group expenses by userId for efficient batch processing
  const expensesByUser = {};
  
  for (const record of event.Records) {
    try {
      const messageBody = JSON.parse(record.body);
      const { expenseId, userId } = messageBody;
      
      if (!expensesByUser[userId]) {
        expensesByUser[userId] = [];
      }
      expensesByUser[userId].push(expenseId);
    } catch (error) {
      console.error('Error parsing queue message', {
        error: error.message,
        messageId: record.messageId,
      });
    }
  }
  
  // Process each user's expenses in batches
  const results = [];
  for (const [userId, expenseIds] of Object.entries(expensesByUser)) {
    // Process in chunks of MAX_BATCH_SIZE
    for (let i = 0; i < expenseIds.length; i += MAX_BATCH_SIZE) {
      const batch = expenseIds.slice(i, i + MAX_BATCH_SIZE);
      try {
        const result = await processCategorizationBatch(batch, userId);
        results.push(result);
      } catch (error) {
        console.error('Error processing categorization batch', {
          userId: userId,
          batchSize: batch.length,
          error: error.message,
        });
        // Individual failures logged, continue with next batch
      }
    }
  }
  
  const duration = Date.now() - startTime;
  console.log('Categorization handler completed', {
    totalProcessed: results.reduce((sum, r) => sum + r.totalProcessed, 0),
    successful: results.reduce((sum, r) => sum + r.successful, 0),
    failed: results.reduce((sum, r) => sum + r.failed, 0),
    duration: `${duration}ms`,
  });
  
  return {
    statusCode: 200,
    processed: results.length,
    results: results,
  };
};
```

### Phase 4: Integration with Expenses Handler

#### 4.1 Update Ingest Handler
**File**: `handlers/ingest.js`

**Changes**: Accept `aiCategorizationEnabled` flag in field mapping or form data

**Updated Message Format**:
```javascript
const messageBodyObj = {
  userId: userId,
  summary: mapped.summary,
  amount: mapped.amount,
  timestamp: mapped.timestamp,
  aiCategorizationEnabled: fields.aiCategorizationEnabled === 'true',  // NEW
  s3Key: s3Key,
};
```

#### 4.2 Update Expenses POST Endpoint
**File**: `handlers/expenses.js`

**Changes**: Accept `aiCategorizationEnabled` in POST body, set status, trigger queue

**Backward Compatibility**: 
- If `aiCategorizationEnabled` not provided, expense behaves exactly as before
- All existing fields (`category`, `categorizedAt`) work as before
- Response includes new fields but existing UI can ignore them

```javascript
case 'POST': {
  const body = event.body ? JSON.parse(event.body) : {};
  
  // ... existing validation ...
  
  const expense = {
    id: expenseId,
    userId: userId,
    summary: body.summary,
    amount: parseFloat(body.amount),
    timestamp: body.timestamp,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Handle category (existing behavior - backward compatible)
  if (body.category && typeof body.category === 'string' && body.category.trim() !== '') {
    expense.category = body.category.trim();
    expense.categorizedAt = new Date().toISOString();
  }
  
  // Handle AI categorization (new behavior - optional)
  if (body.aiCategorizationEnabled === true && !expense.category) {
    expense.aiCategorizationEnabled = true;
    expense.aiCategorizationStatus = 'pending';  // Initial status
  }
  // If aiCategorizationEnabled not provided or false, don't set fields (backward compatible)
  
  // Save to DynamoDB
  await dynamodb.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: expense,
  }));
  
  // If AI categorization enabled, send to queue (async, don't block response)
  if (expense.aiCategorizationEnabled && expense.aiCategorizationStatus === 'pending') {
    // Send to queue asynchronously (don't await - return response immediately)
    sendToCategorizationQueue({
      expenseId: expense.id,
      userId: expense.userId,
    }).catch(error => {
      // Log error but don't fail the request
      console.error('Error sending to categorization queue', {
        expenseId: expense.id,
        error: error.message,
      });
    });
  }
  
  // Return response with all fields (backward compatible - existing UI ignores new fields)
  return {
    statusCode: 201,
    headers,
    body: JSON.stringify({
      message: 'Expense created successfully',
      data: expense,  // Includes aiCategorizationStatus if enabled
    }),
  };
}
```

**Helper Function** (add to expenses.js):
```javascript
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const sqs = new SQSClient({});
const CATEGORIZATION_QUEUE_URL = process.env.CATEGORIZATION_QUEUE_URL;

async function sendToCategorizationQueue(message) {
  if (!CATEGORIZATION_QUEUE_URL) {
    console.warn('CATEGORIZATION_QUEUE_URL not configured, skipping queue send');
    return;
  }
  
  await sqs.send(new SendMessageCommand({
    QueueUrl: CATEGORIZATION_QUEUE_URL,
    MessageBody: JSON.stringify({
      expenseId: message.expenseId,
      userId: message.userId,
      timestamp: new Date().toISOString(),
    }),
  }));
}
```

#### 4.3 Validation Endpoint
**File**: `handlers/expenses.js`

**New Endpoint**: `POST /api/expenses/categorize/validate`

**Purpose**: Allow user to validate or reject AI categorization

**Request Body**:
```javascript
{
  expenseId: string,
  validated: boolean,  // true = accept, false = reject
  category?: string,   // Optional: if validated=false, user can provide different category
}
```

**Handler Function**:
```javascript
/**
 * Handle AI categorization validation
 */
async function handleCategorizeValidateRequest(userId) {
  const body = event.body ? JSON.parse(event.body) : {};
  
  // Validate
  if (!body.expenseId || body.validated === undefined) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        message: 'Missing required fields: expenseId and validated are required',
      }),
    };
  }
  
  // Get expense
  const expense = await dynamodb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { id: body.expenseId },
  }));
  
  // Verify ownership
  if (expense.Item.userId !== userId) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        message: 'Forbidden: You do not have permission to validate this expense',
      }),
    };
  }
  
  // Update expense
  if (body.validated === true) {
    // Accept AI suggestion
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id: body.expenseId },
      UpdateExpression: 'SET aiCategoryValidated = :validated, category = :category, categorizedAt = :categorizedAt, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':validated': true,
        ':category': expense.Item.aiCategorySuggestion,
        ':categorizedAt': new Date().toISOString(),
        ':updatedAt': new Date().toISOString(),
      },
    }));
  } else {
    // Reject AI suggestion, use user-provided category or leave uncategorized
    const updateExpression = body.category 
      ? 'SET aiCategoryValidated = :validated, category = :category, categorizedAt = :categorizedAt, updatedAt = :updatedAt'
      : 'SET aiCategoryValidated = :validated, updatedAt = :updatedAt';
    
    const expressionValues = {
      ':validated': false,
      ':updatedAt': new Date().toISOString(),
    };
    
    if (body.category) {
      expressionValues[':category'] = body.category;
      expressionValues[':categorizedAt'] = new Date().toISOString();
    }
    
    await dynamodb.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id: body.expenseId },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionValues,
    }));
  }
  
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      message: 'Categorization validation updated successfully',
    }),
  };
}
```

**Path Routing**:
```javascript
if (method === 'POST' && (path.endsWith('/categorize/validate') || path.includes('/expenses/categorize/validate'))) {
  return await handleCategorizeValidateRequest(userId);
}
```

### Phase 5: Infrastructure Updates

#### 5.1 Environment Variables
**File**: `infra/deploy.tf`

**Terraform Variables** (add to `variables.tf`):
```hcl
variable "openrouter_api_key" {
  description = "OpenRouter API key for AI categorization"
  type        = string
}

variable "openrouter_model" {
  description = "OpenRouter model to use"
  type        = string
  default     = "openai/gpt-3.5-turbo"
}
```

**Lambda Environment Variables**:
```hcl
# Update expenses Lambda
resource "aws_lambda_function" "expenses" {
  environment {
    variables = {
      APP_NAME                = var.app_name
      EXPENSES_TABLE          = aws_dynamodb_table.expenses.name
      ANALYSIS_TABLE          = aws_dynamodb_table.analysis.name
      CATEGORIZATION_QUEUE_URL = aws_sqs_queue.categorization_queue.url
    }
  }
}

# Update processExpense Lambda (needs queue URL to send messages)
resource "aws_lambda_function" "process_expense" {
  environment {
    variables = {
      APP_NAME                = var.app_name
      EXPENSES_TABLE          = aws_dynamodb_table.expenses.name
      CATEGORIZATION_QUEUE_URL = aws_sqs_queue.categorization_queue.url
    }
  }
}

# New categorizeExpenses Lambda
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
      OPENROUTER_API_KEY      = var.openrouter_api_key
      OPENROUTER_MODEL        = var.openrouter_model
    }
  }

  tags = {
    Name = "finance-manager"
  }
}
```

#### 5.2 SQS Permissions
**File**: `infra/deploy.tf`

**Update IAM Policy**:
```hcl
resource "aws_iam_role_policy" "sqs_access" {
  # ... existing policy ...
  policy = jsonencode({
    Statement = [
      # ... existing statements ...
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
          aws_sqs_queue.categorization_queue.arn,      # NEW
          aws_sqs_queue.categorization_dlq.arn,        # NEW
        ]
      }
    ]
  })
}
```

#### 5.3 Lambda Event Source Mapping
**File**: `infra/deploy.tf`

```hcl
resource "aws_lambda_event_source_mapping" "categorize_expenses_sqs" {
  event_source_arn = aws_sqs_queue.categorization_queue.arn
  function_name    = aws_lambda_function.categorize_expenses.arn
  batch_size       = 10  # Process up to 10 SQS messages at a time
  maximum_batching_window_in_seconds = 5
}
```

#### 5.4 API Gateway Routes
**File**: `infra/deploy.tf`

```hcl
resource "aws_apigatewayv2_route" "expenses_categorize_validate_post" {
  api_id           = aws_apigatewayv2_api.main.id
  route_key        = "POST /api/expenses/categorize/validate"
  target           = "integrations/${aws_apigatewayv2_integration.expenses.id}"
  authorizer_id    = aws_apigatewayv2_authorizer.cognito.id
  authorization_type = "JWT"
}
```

### Phase 6: Package Dependencies

#### 6.1 Update package.json
**File**: `package.json`

```json
{
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.700.0",
    "@aws-sdk/client-lambda": "^3.700.0",
    "@aws-sdk/client-s3": "^3.700.0",
    "@aws-sdk/client-sqs": "^3.700.0",
    "@aws-sdk/lib-dynamodb": "^3.700.0",
    "@openrouter/sdk": "^1.0.0",
    "busboy": "^1.6.0",
    "csv-parse": "^6.1.0"
  }
}
```

## File Structure

```
fm-backend/
├── handlers/
│   ├── expenses.js                    # MODIFY: Add validate endpoint, update POST
│   ├── processExpense.js             # MODIFY: Add queue sending logic
│   ├── ingest.js                     # MODIFY: Accept aiCategorizationEnabled flag
│   └── categorizeExpenses.js        # NEW: Queue processor Lambda
├── services/
│   ├── expenseCategorizer.js         # NEW: Core categorization module
│   └── categoryManager.js            # NEW: Category management
├── package.json                       # MODIFY: Add @openrouter/node-sdk
└── infra/
    ├── variables.tf                   # MODIFY: Add openrouter variables
    └── deploy.tf                      # MODIFY: Add queue, Lambda, routes
```

## Implementation Order

1. **Step 1**: Create category management module
   - `services/categoryManager.js` with pre-defined categories
   - Functions to get user categories

2. **Step 2**: Create categorization service module
   - `services/expenseCategorizer.js`
   - Install `@openrouter/sdk` package
   - Initialize OpenRouter client with API key and default headers
   - Implement system prompt with constraints
   - Implement batch categorization using `openRouter.chat.send()`
   - Implement JSON response parsing from `completion.choices[0].message.content`

3. **Step 3**: Update expense schema handling
   - Update `processExpense.js` to handle new fields
   - Update `ingest.js` to accept `aiCategorizationEnabled`
   - Update `expenses.js` POST to accept flag

4. **Step 4**: Create categorization queue and Lambda
   - Add SQS queue in Terraform
   - Create `handlers/categorizeExpenses.js`
   - Implement batch processing (max 100)

5. **Step 5**: Add validation endpoint
   - Add `handleCategorizeValidateRequest` to `expenses.js`
   - Add route in Terraform

6. **Step 6**: Update infrastructure
   - Add queue resources
   - Add Lambda function
   - Add environment variables
   - Add event source mapping
   - Deploy and test

## System Prompt Template

```
You are an expense categorization assistant. Your task is to categorize expenses based on their description, amount, and date.

CONSTRAINTS:
1. You MUST select a category from the provided list of available categories
2. You MUST return ONLY valid JSON in the following format:
   {
     "category": "Category Name",
     "confidence": 0.95,
     "reasoning": "Brief explanation"
   }
3. The category name MUST exactly match one of the available categories (case-sensitive)
4. Confidence must be a number between 0 and 1
5. Reasoning should be a brief explanation (max 50 words)
6. Do NOT include any text outside the JSON object
7. Do NOT use markdown formatting
8. Do NOT add comments or explanations

AVAILABLE CATEGORIES:
{list of categories, one per line}

PROBLEM STATEMENT:
Given an expense with description, amount, and timestamp, determine the most appropriate category from the available list. Consider:
- The nature of the expense (what was purchased/service used)
- The amount (may indicate type of expense)
- The context (date/time may provide clues)

If the expense doesn't clearly fit any category, choose the closest match or "Other" if truly unclassifiable.

RESPONSE FORMAT:
Return ONLY valid JSON. No additional text, no markdown, no explanations outside the JSON.
```

## Error Handling

1. **OpenRouter API Errors**:
   - Network errors: Retry with exponential backoff
   - Rate limiting: Log and retry later (SQS will retry)
   - Invalid responses: Log error, mark expense with error, continue processing

2. **Invalid Categories**:
   - If AI returns category not in available list, use "Other"
   - Log warning for monitoring

3. **Queue Processing**:
   - Failed expenses go to DLQ after 3 retries
   - Individual expense failures don't block batch processing

## Backward Compatibility

### Ensuring Existing UI Continues to Work

1. **Response Structure**: All endpoints return the same structure as before
   - New fields (`aiCategorizationStatus`, `aiCategorySuggestion`, etc.) are added but optional
   - Existing UI can ignore these fields and continue using `category` and `categorizedAt`

2. **Field Behavior**:
   - Expenses without `aiCategorizationEnabled` behave exactly as before
   - `category` and `categorizedAt` fields work identically to existing behavior
   - New fields only present when AI categorization is enabled

3. **API Endpoints**:
   - All existing endpoints work without changes
   - New fields are optional in request/response
   - GET endpoints return all fields (existing UI filters what it needs)

4. **Status Field**:
   - `aiCategorizationStatus` is only set when `aiCategorizationEnabled=true`
   - Frontend can check status to show "Processing..." indicator
   - If status field missing, assume no AI categorization (backward compatible)

### Frontend Integration Points

**Status Display**:
```javascript
// Frontend can check status to show processing indicator
if (expense.aiCategorizationStatus === 'processing') {
  // Show "AI categorizing..." indicator
} else if (expense.aiCategorizationStatus === 'completed') {
  // Show suggested category with validation buttons
} else if (expense.aiCategorizationStatus === 'failed') {
  // Show error message or allow manual categorization
}
```

**Backward Compatible Check**:
```javascript
// Existing UI continues to work
if (expense.category) {
  // Use category (works for both manual and AI-validated)
}
// New UI can also check:
if (expense.aiCategorizationStatus === 'completed' && !expense.aiCategoryValidated) {
  // Show AI suggestion for user validation
}
```

## Notes

- **Async Processing**: All categorization happens asynchronously via queue
- **Batch Size**: Maximum 100 expenses per batch to stay within Lambda limits and save tokens
- **Status Tracking**: Status field (`aiCategorizationStatus`) shows current state for frontend display
- **Immediate Trigger**: When expenses uploaded with `aiCategorizationEnabled=true`, status set to `'pending'` and queued immediately
- **Backward Compatible**: Existing UI continues to work without changes - new fields are optional
- **Validation**: Users must explicitly validate AI suggestions via validation endpoint
- **Extensibility**: Category system designed to easily add new sources (e.g., ML models, rules)
- **Code Style**: All code follows existing patterns (CommonJS, structured logging, etc.)
- **Token Efficiency**: Processing 100 expenses at a time reduces API calls and token usage
