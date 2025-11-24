/**
 * Expenses Lambda handler
 * Handler for expense management with DynamoDB integration
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.EXPENSES_TABLE;

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Extract Cognito user ID from API Gateway event
 * Returns userId or null if not found
 */
function getUserId(event) {
  // JWT authorizer provides claims in requestContext.authorizer.claims
  const claims = event.requestContext?.authorizer?.claims;
  if (claims && claims.sub) {
    return claims.sub;
  }
  
  // Fallback: try to extract from JWT token directly if available
  const authHeader = event.headers?.Authorization || event.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      if (payload.sub) {
        return payload.sub;
      }
    } catch (error) {
      // Ignore parsing errors
    }
  }
  
  return null;
}

/**
 * Generate a hash from userId, summary and timestamp
 */
function generateHash(userId, summary, timestamp) {
  const hashInput = `${userId}|${summary}|${timestamp}`;
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
  
  // Extract user ID from event
  const userId = getUserId(event);
  if (!userId) {
    console.warn('Unauthorized: No user ID found in request', {
      method: method,
      hasAuthorizer: !!event.requestContext?.authorizer,
    });
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({
        message: 'Unauthorized: User authentication required',
      }),
    };
  }

  try {
    switch (method) {
      case 'GET': {
        // Get expenses for the authenticated user, optionally filtered by uncategorized status
        const queryParams = event.queryStringParameters || {};
        const uncategorized = queryParams.uncategorized === 'true';
        
        console.log('Querying expenses table', {
          tableName: TABLE_NAME,
          userId: userId,
          uncategorized: uncategorized,
          queryParams: queryParams,
        });
        
        // Build query command using GSI to filter by userId
        const queryParams_dynamo = {
          TableName: TABLE_NAME,
          IndexName: 'userId-index',
          KeyConditionExpression: 'userId = :userId',
          ExpressionAttributeValues: {
            ':userId': userId,
          },
        };
        
        // Filter for expenses without categorizedAt attribute
        if (uncategorized) {
          queryParams_dynamo.FilterExpression = 'attribute_not_exists(categorizedAt)';
        }
        
        const queryResult = await dynamodb.send(new QueryCommand(queryParams_dynamo));
        
        const itemCount = queryResult.Items?.length || 0;
        console.log('Expenses retrieved successfully', {
          itemCount: itemCount,
          scannedCount: queryResult.ScannedCount,
          uncategorized: uncategorized,
          userId: userId,
        });
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            message: 'Expenses retrieved successfully',
            data: queryResult.Items || [],
          }),
        };
      }
      
      case 'POST': {
        // Create a new expense
        const body = event.body ? JSON.parse(event.body) : {};
        console.log('Processing POST request', {
          hasBody: !!event.body,
          bodyKeys: Object.keys(body),
          userId: userId,
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

        // Generate hash from userId, summary and timestamp
        const expenseId = generateHash(userId, body.summary, body.timestamp);
        console.log('Generated expense ID', {
          expenseId: expenseId,
          userId: userId,
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
          userId: userId,
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
          userId: userId,
          tableName: TABLE_NAME,
        });
        await dynamodb.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: expense,
        }));
        
        const duration = Date.now() - startTime;
        console.log('Expense created successfully', {
          expenseId: expenseId,
          userId: userId,
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
      }
      
      case 'PUT': {
        // Update an existing expense with category
        const updateBody = event.body ? JSON.parse(event.body) : {};
        console.log('Processing PUT request', {
          hasBody: !!event.body,
          bodyKeys: Object.keys(updateBody),
          userId: userId,
        });
        
        // Validate required fields
        if (!updateBody.id || !updateBody.category) {
          console.warn('Validation failed: missing required fields', {
            hasId: !!updateBody.id,
            hasCategory: !!updateBody.category,
          });
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              message: 'Missing required fields: id and category are required',
            }),
          };
        }
        
        const expenseId = updateBody.id;
        const category = updateBody.category;
        const categorizedAt = new Date().toISOString();
        const updatedAt = new Date().toISOString();
        
        console.log('Updating expense with category', {
          expenseId: expenseId,
          userId: userId,
          category: category,
          categorizedAt: categorizedAt,
        });
        
        // Check if expense exists and belongs to the user
        let existingExpense = null;
        try {
          const getResult = await dynamodb.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { id: expenseId },
          }));
          existingExpense = getResult.Item;
          if (!existingExpense) {
            console.warn('Expense not found', { expenseId: expenseId });
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify({
                message: 'Expense not found',
                id: expenseId,
              }),
            };
          }
          
          // Verify expense belongs to the user
          if (existingExpense.userId !== userId) {
            console.warn('Unauthorized: Expense does not belong to user', {
              expenseId: expenseId,
              expenseUserId: existingExpense.userId,
              requestUserId: userId,
            });
            return {
              statusCode: 403,
              headers,
              body: JSON.stringify({
                message: 'Forbidden: You do not have permission to update this expense',
              }),
            };
          }
        } catch (getError) {
          console.error('Error checking for existing expense', {
            expenseId: expenseId,
            error: getError.message,
          });
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              message: 'Error checking for existing expense',
              error: getError.message,
            }),
          };
        }
        
        // Update expense with category
        try {
          const updateResult = await dynamodb.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: expenseId },
            UpdateExpression: 'SET #category = :category, categorizedAt = :categorizedAt, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
              '#category': 'category',
            },
            ExpressionAttributeValues: {
              ':category': category,
              ':categorizedAt': categorizedAt,
              ':updatedAt': updatedAt,
            },
            ReturnValues: 'ALL_NEW',
          }));
          
          const updatedExpense = updateResult.Attributes;
          const duration = Date.now() - startTime;
          
          console.log('Expense updated successfully', {
            expenseId: expenseId,
            userId: userId,
            category: category,
            duration: `${duration}ms`,
          });
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              message: 'Expense categorized successfully',
              data: updatedExpense,
            }),
          };
        } catch (updateError) {
          console.error('Error updating expense', {
            expenseId: expenseId,
            error: updateError.message,
            stack: updateError.stack,
          });
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              message: 'Error updating expense',
              error: updateError.message,
            }),
          };
        }
      }
      
      default: {
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

