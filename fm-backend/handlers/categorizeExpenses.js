/**
 * Categorize Expenses Lambda handler
 * Processes categorization queue, categorizes expenses in batches of up to 100
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, BatchGetCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { categorizeBatch } = require('./services/expenseCategorizer');
const { getUserCategories } = require('./services/categoryManager');

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
  
  // 4. Get user's available categories (extract from their existing expenses)
  // Query a sample of user's categorized expenses to extract user-defined categories
  let userExpenses = [];
  try {
    // Query up to 100 categorized expenses to extract user-defined categories
    const queryResult = await dynamodb.send(new QueryCommand({
      TableName: EXPENSES_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      FilterExpression: 'attribute_exists(category)',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      Limit: 100, // Sample size
    }));
    userExpenses = queryResult.Items || [];
  } catch (error) {
    console.warn('Error querying user expenses for category extraction', {
      userId: userId,
      error: error.message,
    });
    // Continue with empty array - will use predefined categories only
  }
  
  const userCategories = getUserCategories(userId, userExpenses);
  const availableCategories = userCategories.all;
  
  console.log('Available categories for user', {
    userId: userId,
    predefinedCount: userCategories.predefined.length,
    userDefinedCount: userCategories.userDefined.length,
    totalCount: availableCategories.length,
  });
  
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
          if (!result.success || result.error) {
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
              UpdateExpression: 'SET aiCategorizationStatus = :status, aiCategorySuggestion = :suggestion, autoCategorizedAt = :autoCategorizedAt, updatedAt = :updatedAt',
              ExpressionAttributeValues: {
                ':status': 'completed',
                ':suggestion': result.suggestedCategory,
                ':autoCategorizedAt': new Date().toISOString(),
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
      
      if (!expenseId || !userId) {
        console.warn('Invalid message format', {
          messageId: record.messageId,
          messageBody: messageBody,
        });
        continue;
      }
      
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
