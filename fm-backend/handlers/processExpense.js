/**
 * Process Expense Lambda handler
 * Triggered by SQS events, processes each CSV row and saves to DynamoDB
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const crypto = require('crypto');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const sqs = new SQSClient({});
const TABLE_NAME = process.env.EXPENSES_TABLE;
const CATEGORIZATION_QUEUE_URL = process.env.CATEGORIZATION_QUEUE_URL;

// Validate environment variables
if (!TABLE_NAME) {
  throw new Error('EXPENSES_TABLE environment variable is not set');
}

/**
 * Generate a hash from userId, summary and timestamp
 */
function generateHash(userId, summary, timestamp) {
  const hashInput = `${userId}|${summary}|${timestamp}`;
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Send expense to categorization queue
 */
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


exports.handler = async (event) => {
  const startTime = Date.now();
  const recordCount = event.Records?.length || 0;
  
  console.log('Process expense handler invoked', {
    recordCount: recordCount,
    timestamp: new Date().toISOString(),
  });
  
  const results = [];
  
  for (let i = 0; i < event.Records.length; i++) {
    const record = event.Records[i];
    const recordStartTime = Date.now();
    
    console.log(`Processing record ${i + 1}/${recordCount}`, {
      messageId: record.messageId,
      receiptHandle: record.receiptHandle?.substring(0, 20) + '...',
    });
    
    try {
      // Parse SQS message - now contains mapped fields directly
      console.log('Raw SQS record body', {
        messageId: record.messageId,
        bodyType: typeof record.body,
        bodyPreview: typeof record.body === 'string' ? record.body.substring(0, 200) : record.body,
      });
      
      let messageBody;
      try {
        messageBody = JSON.parse(record.body);
      } catch (parseError) {
        throw new Error(`Failed to parse SQS message body as JSON: ${parseError.message}. Body: ${record.body?.substring(0, 200)}`);
      }
      
      const { userId, summary, amount, timestamp, s3Key, category, aiCategorizationEnabled } = messageBody;
      
      console.log('Parsed SQS message', {
        messageId: record.messageId,
        hasUserId: !!userId,
        userId: userId,
        hasSummary: !!summary,
        summary: summary,
        hasAmount: !!amount,
        amount: amount,
        hasTimestamp: !!timestamp,
        timestamp: timestamp,
        hasCategory: !!category,
        category: category,
        s3Key: s3Key,
        messageBodyKeys: Object.keys(messageBody || {}),
      });
      
      // Validate mapped data
      if (!userId || typeof userId !== 'string' || userId.trim() === '') {
        throw new Error(`Missing or invalid userId field: ${JSON.stringify(userId)}`);
      }
      
      if (!summary || typeof summary !== 'string' || summary.trim() === '') {
        throw new Error(`Missing or invalid summary field: ${JSON.stringify(summary)}`);
      }
      
      if (!timestamp || typeof timestamp !== 'string' || timestamp.trim() === '') {
        throw new Error(`Missing or invalid timestamp field: ${JSON.stringify(timestamp)}`);
      }
      
      if (amount === null || amount === undefined || amount === '') {
        throw new Error(`Missing amount field: ${JSON.stringify(amount)}`);
      }
      
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount)) {
        throw new Error(`Invalid amount: cannot parse "${amount}" as a number`);
      }
      
      // Generate expense ID hash
      const expenseId = generateHash(userId, summary, timestamp);
      console.log('Generated expense ID', {
        messageId: record.messageId,
        expenseId: expenseId,
        userId: userId,
        summary: summary,
        timestamp: timestamp,
      });
      
      // Check if expense with this hash already exists
      let existingExpense = null;
      try {
        console.log('Checking for existing expense', {
          messageId: record.messageId,
          expenseId: expenseId,
          tableName: TABLE_NAME,
        });
        const getResult = await dynamodb.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { id: expenseId },
        }));
        existingExpense = getResult.Item;
        if (existingExpense) {
          console.log('Existing expense found', {
            messageId: record.messageId,
            expenseId: expenseId,
          });
        } else {
          console.log('No existing expense found', {
            messageId: record.messageId,
            expenseId: expenseId,
          });
        }
      } catch (getError) {
        // If get fails, continue (item doesn't exist)
        console.log('No existing expense found (get operation failed)', {
          messageId: record.messageId,
          expenseId: expenseId,
          error: getError.message,
        });
      }
      
      // If duplicate detected, skip saving and just log
      if (existingExpense) {
        const recordDuration = Date.now() - recordStartTime;
        console.log('Duplicate expense detected - ignoring record', {
          messageId: record.messageId,
          expenseId: expenseId,
          existingExpenseId: existingExpense.id,
          summary: summary,
          timestamp: timestamp,
          duration: `${recordDuration}ms`,
        });
        
        results.push({
          messageId: record.messageId,
          success: true,
          expenseId: expenseId,
          skipped: true,
          reason: 'duplicate',
        });
        continue;
      }
      
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
      
      // Handle category (existing behavior - backward compatible)
      if (category && typeof category === 'string' && category.trim() !== '') {
        expense.category = category.trim();
        expense.categorizedAt = new Date().toISOString();
      }
      
      // Handle AI categorization flag (new behavior - optional)
      if (aiCategorizationEnabled && !expense.category) {
        expense.aiCategorizationEnabled = true;
        expense.aiCategorizationStatus = 'pending';  // Initial status
      }
      
      // Save to DynamoDB
      console.log('Saving expense to DynamoDB', {
        messageId: record.messageId,
        expenseId: expenseId,
        userId: userId,
        tableName: TABLE_NAME,
        expense: expense,
      });
      
      const putResult = await dynamodb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: expense,
      }));
      
      console.log('DynamoDB PutCommand completed', {
        messageId: record.messageId,
        expenseId: expenseId,
        putResult: putResult,
      });
      
      // After saving, if AI categorization enabled, send to queue
      if (expense.aiCategorizationEnabled && expense.aiCategorizationStatus === 'pending') {
        try {
          await sendToCategorizationQueue({
            expenseId: expense.id,
            userId: expense.userId,
          });
          console.log('Expense sent to categorization queue', {
            messageId: record.messageId,
            expenseId: expense.id,
            userId: expense.userId,
          });
        } catch (queueError) {
          // Log error but don't fail expense creation
          console.error('Error sending to categorization queue', {
            messageId: record.messageId,
            expenseId: expense.id,
            error: queueError.message,
          });
          // Leave status as 'pending' - will be retried later if needed
        }
      }
      
      const recordDuration = Date.now() - recordStartTime;
      console.log('Expense processed successfully', {
        messageId: record.messageId,
        expenseId: expenseId,
        duration: `${recordDuration}ms`,
      });
      
      results.push({
        messageId: record.messageId,
        success: true,
        expenseId: expenseId,
      });
    } catch (error) {
      const recordDuration = Date.now() - recordStartTime;
      console.error('Error processing message', {
        messageId: record.messageId,
        error: error.message,
        stack: error.stack,
        duration: `${recordDuration}ms`,
      });
      
      // Note: Failed messages will automatically be moved to DLQ by SQS redrive policy
      // after maxReceiveCount (3) retry attempts
      
      results.push({
        messageId: record.messageId,
        success: false,
        error: error.message,
      });
    }
  }
  
  const duration = Date.now() - startTime;
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('Process expense handler completed', {
    processed: results.length,
    successful: successful,
    failed: failed,
    duration: `${duration}ms`,
  });
  
  // Return results for Lambda to process
  // Note: If any message fails, Lambda will retry based on SQS configuration
  return {
    statusCode: 200,
    processed: results.length,
    successful: successful,
    failed: failed,
    results: results,
  };
};


