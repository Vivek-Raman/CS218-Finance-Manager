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
  const startTime = Date.now();
  const method = event.requestContext?.http?.method || event.httpMethod || 'GET';
  
  console.log('Expenses handler invoked', {
    requestId: event.requestContext?.requestId,
    method: method,
    path: event.requestContext?.http?.path || event.path,
    timestamp: new Date().toISOString(),
  });
  
  try {
    switch (method) {
      case 'GET':
        // Get all expenses
        console.log('Scanning expenses table', { tableName: TABLE_NAME });
        const scanResult = await dynamodb.send(new ScanCommand({
          TableName: TABLE_NAME,
        }));
        
        const itemCount = scanResult.Items?.length || 0;
        console.log('Expenses retrieved successfully', {
          itemCount: itemCount,
          scannedCount: scanResult.ScannedCount,
        });
        
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
        console.log('Processing POST request', {
          hasBody: !!event.body,
          bodyKeys: Object.keys(body),
        });
        
        // Validate required fields
        if (!body.summary || body.amount === undefined || !body.timestamp) {
          console.warn('Validation failed: missing required fields', {
            hasSummary: !!body.summary,
            hasAmount: body.amount !== undefined,
            hasTimestamp: !!body.timestamp,
          });
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
        console.log('Generated expense ID', {
          expenseId: expenseId,
          summary: body.summary,
          timestamp: body.timestamp,
        });
        
        // Check if expense with this hash already exists
        let existingExpense = null;
        try {
          console.log('Checking for existing expense', { expenseId: expenseId });
          const getResult = await dynamodb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { id: expenseId },
          }));
          existingExpense = getResult.Item;
          if (existingExpense) {
            console.log('Existing expense found', { expenseId: expenseId });
          } else {
            console.log('No existing expense found with this hash');
          }
        } catch (getError) {
          // If get fails, continue (item doesn't exist)
          console.log('No existing expense found with this hash', {
            error: getError.message,
          });
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
          console.warn('Duplicate expense detected', {
            expenseId: expenseId,
            existingExpenseId: existingExpense.id,
          });
        }
        
        console.log('Saving expense to DynamoDB', {
          expenseId: expenseId,
          tableName: TABLE_NAME,
        });
        await dynamodb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: expense,
        }));
        
        const duration = Date.now() - startTime;
        console.log('Expense created successfully', {
          expenseId: expenseId,
          isDuplicate: !!existingExpense,
          duration: `${duration}ms`,
        });
        
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
        console.warn('Method not allowed', { method: method });
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
    const duration = Date.now() - startTime;
    console.error('Error processing expenses request', {
      error: error.message,
      stack: error.stack,
      method: method,
      duration: `${duration}ms`,
    });
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

