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
const DLQ_URL = process.env.DLQ_URL;

/**
 * Generate a hash from summary and timestamp
 */
function generateHash(summary, timestamp) {
  const hashInput = `${summary}|${timestamp}`;
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

/**
 * Apply field mapping to transform CSV row
 */
function applyMapping(row, fieldMapping) {
  return {
    summary: row[fieldMapping.summary] || '',
    amount: row[fieldMapping.amount] || '',
    timestamp: row[fieldMapping.timestamp] || '',
  };
}

/**
 * Send message to dead-letter queue
 */
async function sendToDLQ(messageBody, error) {
  if (!DLQ_URL) {
    console.error('DLQ URL not configured, cannot send failed message to DLQ');
    return;
  }
  
  try {
    await sqs.send(new SendMessageCommand({
      QueueUrl: DLQ_URL,
      MessageBody: JSON.stringify({
        originalMessage: messageBody,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    }));
  } catch (dlqError) {
    console.error('Failed to send message to DLQ:', dlqError);
  }
}

exports.handler = async (event) => {
  const results = [];
  
  for (const record of event.Records) {
    try {
      // Parse SQS message
      const messageBody = JSON.parse(record.body);
      const { row, fieldMapping } = messageBody;
      
      // Apply field mapping
      const transformed = applyMapping(row, fieldMapping);
      
      // Validate transformed data
      if (!transformed.summary || !transformed.timestamp) {
        throw new Error('Missing required fields: summary and timestamp are required');
      }
      
      const amount = parseFloat(transformed.amount);
      if (isNaN(amount)) {
        throw new Error(`Invalid amount: ${transformed.amount}`);
      }
      
      // Generate expense ID hash
      const expenseId = generateHash(transformed.summary, transformed.timestamp);
      
      // Check if expense with this hash already exists
      let existingExpense = null;
      try {
        const getResult = await dynamodb.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { id: expenseId },
        }));
        existingExpense = getResult.Item;
      } catch (getError) {
        // If get fails, continue (item doesn't exist)
        console.log('No existing expense found with this hash');
      }
      
      // Create expense item
      const expense = {
        id: expenseId,
        summary: transformed.summary,
        amount: amount,
        timestamp: transformed.timestamp,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      // If collision detected, add a note
      if (existingExpense) {
        expense.note = `Duplicate detected: Another expense with the same summary and timestamp already exists (ID: ${existingExpense.id})`;
      }
      
      // Save to DynamoDB
      await dynamodb.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: expense,
      }));
      
      results.push({
        messageId: record.messageId,
        success: true,
        expenseId: expenseId,
      });
    } catch (error) {
      console.error(`Error processing message ${record.messageId}:`, error);
      
      // Send to DLQ if configured
      await sendToDLQ(record.body, error);
      
      results.push({
        messageId: record.messageId,
        success: false,
        error: error.message,
      });
    }
  }
  
  // Return results for Lambda to process
  // Note: If any message fails, Lambda will retry based on SQS configuration
  return {
    statusCode: 200,
    processed: results.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results: results,
  };
};


