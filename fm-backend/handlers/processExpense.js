/**
 * Process Expense Lambda handler
 * Triggered by SQS events, processes each CSV row and saves to DynamoDB
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.EXPENSES_TABLE;

/**
 * Generate a hash from summary and timestamp
 */
function generateHash(summary, timestamp) {
  const hashInput = `${summary}|${timestamp}`;
  return crypto.createHash('sha256').update(hashInput).digest('hex');
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
      const messageBody = JSON.parse(record.body);
      const { summary, amount, timestamp, s3Key } = messageBody;
      
      console.log('Parsed SQS message', {
        messageId: record.messageId,
        hasSummary: !!summary,
        hasAmount: !!amount,
        hasTimestamp: !!timestamp,
        s3Key: s3Key,
      });
      
      // Validate mapped data
      if (!summary || !timestamp) {
        throw new Error('Missing required fields: summary and timestamp are required');
      }
      
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount)) {
        throw new Error(`Invalid amount: ${amount}`);
      }
      
      // Generate expense ID hash
      const expenseId = generateHash(summary, timestamp);
      console.log('Generated expense ID', {
        messageId: record.messageId,
        expenseId: expenseId,
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
      
      // Create expense item
      const expense = {
        id: expenseId,
        summary: summary,
        amount: parsedAmount,
        timestamp: timestamp,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // If collision detected, add a note
      if (existingExpense) {
        expense.note = `Duplicate detected: Another expense with the same summary and timestamp already exists (ID: ${existingExpense.id})`;
        console.warn('Duplicate expense detected', {
          messageId: record.messageId,
          expenseId: expenseId,
          existingExpenseId: existingExpense.id,
        });
      }
      
      // Save to DynamoDB
      console.log('Saving expense to DynamoDB', {
        messageId: record.messageId,
        expenseId: expenseId,
        tableName: TABLE_NAME,
      });
      await dynamodb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: expense,
      }));
      
      const recordDuration = Date.now() - recordStartTime;
      console.log('Expense processed successfully', {
        messageId: record.messageId,
        expenseId: expenseId,
        isDuplicate: !!existingExpense,
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


