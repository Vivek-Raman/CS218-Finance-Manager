/**
 * Flush Expenses Lambda handler
 * Deletes all expenses and analytics for the logged-in user
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, DeleteCommand, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.EXPENSES_TABLE;
const ANALYSIS_TABLE = process.env.ANALYSIS_TABLE;

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
 * Delete all expenses for a user
 */
async function deleteAllExpenses(userId) {
  if (!TABLE_NAME) {
    throw new Error('EXPENSES_TABLE environment variable is not set');
  }

  let deletedCount = 0;
  let lastEvaluatedKey = null;

  do {
    // Query all expenses for the user
    const queryParams = {
      TableName: TABLE_NAME,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    };

    if (lastEvaluatedKey) {
      queryParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    const queryResult = await dynamodb.send(new QueryCommand(queryParams));
    const items = queryResult.Items || [];

    if (items.length > 0) {
      // Delete items in batches of 25 (DynamoDB limit)
      const batches = [];
      for (let i = 0; i < items.length; i += 25) {
        batches.push(items.slice(i, i + 25));
      }

      for (const batch of batches) {
        const deleteRequests = batch.map(item => ({
          DeleteRequest: {
            Key: { id: item.id },
          },
        }));

        await dynamodb.send(new BatchWriteCommand({
          RequestItems: {
            [TABLE_NAME]: deleteRequests,
          },
        }));

        deletedCount += batch.length;
      }
    }

    lastEvaluatedKey = queryResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return deletedCount;
}

/**
 * Delete all analytics for a user
 */
async function deleteAllAnalytics(userId) {
  if (!ANALYSIS_TABLE) {
    throw new Error('ANALYSIS_TABLE environment variable is not set');
  }

  let deletedCount = 0;
  let lastEvaluatedKey = null;

  do {
    // Query all analytics for the user
    const queryParams = {
      TableName: ANALYSIS_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    };

    if (lastEvaluatedKey) {
      queryParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    const queryResult = await dynamodb.send(new QueryCommand(queryParams));
    const items = queryResult.Items || [];

    if (items.length > 0) {
      // Delete items in batches of 25 (DynamoDB limit)
      const batches = [];
      for (let i = 0; i < items.length; i += 25) {
        batches.push(items.slice(i, i + 25));
      }

      for (const batch of batches) {
        const deleteRequests = batch.map(item => ({
          DeleteRequest: {
            Key: {
              userId: item.userId,
              analyticTag: item.analyticTag,
            },
          },
        }));

        await dynamodb.send(new BatchWriteCommand({
          RequestItems: {
            [ANALYSIS_TABLE]: deleteRequests,
          },
        }));

        deletedCount += batch.length;
      }
    }

    lastEvaluatedKey = queryResult.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return deletedCount;
}

exports.handler = async (event) => {
  const startTime = Date.now();
  const method = event.requestContext?.http?.method || event.httpMethod || 'POST';

  console.log('Flush expenses handler invoked', {
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

  // Only allow POST method
  if (method !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        message: 'Method not allowed',
        method: method,
      }),
    };
  }

  try {
    console.log('Starting flush operation for user', { userId });

    // Delete all expenses
    const expensesDeleted = await deleteAllExpenses(userId);
    console.log('Deleted expenses', { userId, count: expensesDeleted });

    // Delete all analytics
    const analyticsDeleted = await deleteAllAnalytics(userId);
    console.log('Deleted analytics', { userId, count: analyticsDeleted });

    const duration = Date.now() - startTime;
    console.log('Flush operation completed successfully', {
      userId,
      expensesDeleted,
      analyticsDeleted,
      duration: `${duration}ms`,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'All expenses and analytics flushed successfully',
        data: {
          expensesDeleted,
          analyticsDeleted,
        },
      }),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error flushing expenses', {
      userId,
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Error flushing expenses and analytics',
        error: error.message,
      }),
    };
  }
};

