/**
 * Expenses Lambda handler
 * Handler for expense management with DynamoDB integration
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.EXPENSES_TABLE;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Generate a hash from summary and timestamp
 */
function generateHash(summary, timestamp) {
  const hashInput = `${summary}|${timestamp}`;
  return crypto.createHash('sha256').update(hashInput).digest('hex');
}

exports.handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  
  try {
    switch (method) {
      case 'GET':
        // Get all expenses
        const scanResult = await dynamodb.send(new ScanCommand({
          TableName: TABLE_NAME,
        }));
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            message: 'Expenses retrieved successfully',
            data: scanResult.Items || [],
          }),
        };
      
      case 'POST':
        // Create a new expense
        const body = event.body ? JSON.parse(event.body) : {};
        
        // Validate required fields
        if (!body.summary || body.amount === undefined || !body.timestamp) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              message: 'Missing required fields: summary, amount, and timestamp are required',
            }),
          };
        }
        
        // Generate hash from summary and timestamp
        const expenseId = generateHash(body.summary, body.timestamp);
        
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
          summary: body.summary,
          amount: parseFloat(body.amount),
          timestamp: body.timestamp,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        // If collision detected, add a note
        if (existingExpense) {
          expense.note = `Duplicate detected: Another expense with the same summary and timestamp already exists (ID: ${existingExpense.id})`;
        }
        
        await dynamodb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: expense,
        }));
        
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify({
            message: existingExpense 
              ? 'Expense created successfully (duplicate detected)' 
              : 'Expense created successfully',
            data: expense,
          }),
        };
      
      default:
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({
            message: 'Method not allowed',
            method: method,
          }),
        };
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Internal server error',
        error: error.message,
      }),
    };
  }
};

