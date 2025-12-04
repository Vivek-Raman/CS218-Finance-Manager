/**
 * Expenses Lambda handler
 * Handler for expense management with DynamoDB integration
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, GetCommand, PutCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const crypto = require('crypto');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const lambdaClient = new LambdaClient({});
const sqs = new SQSClient({});
const TABLE_NAME = process.env.EXPENSES_TABLE;
const ANALYSIS_TABLE = process.env.ANALYSIS_TABLE;
const CATEGORIZATION_QUEUE_URL = process.env.CATEGORIZATION_QUEUE_URL;
const APP_NAME = process.env.APP_NAME || 'finance-manager';
const ANALYZE_EXPENSES_FUNCTION_NAME = `${APP_NAME}-analyze-expenses`;

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

/**
 * Get current month in YYYY-MM format
 */
function getCurrentMonthYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Send expense to categorization queue
 */
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

/**
 * Handle AI categorization validation request
 */
async function handleCategorizeValidateRequest(userId, event) {
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
  const getResult = await dynamodb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { id: body.expenseId },
  }));
  
  if (!getResult.Item) {
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        message: 'Expense not found',
      }),
    };
  }
  
  const expense = getResult.Item;
  
  // Verify ownership
  if (expense.userId !== userId) {
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
        ':category': expense.aiCategorySuggestion,
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

/**
 * Handle refresh analytics request - trigger analysis Lambda immediately for the requesting user
 * The Lambda will process only the specified user
 */
async function handleRefreshAnalytics(userId) {
  try {
    console.log('Triggering analytics refresh for user', {
      userId: userId,
      functionName: ANALYZE_EXPENSES_FUNCTION_NAME,
    });
    
    // Invoke analyze_expenses Lambda synchronously with userId in payload
    const invokeParams = {
      FunctionName: ANALYZE_EXPENSES_FUNCTION_NAME,
      InvocationType: 'RequestResponse', // Synchronous invocation
      Payload: JSON.stringify({
        Records: [
          {
            messageId: `manual-refresh-${Date.now()}`,
            body: JSON.stringify({
              userId: userId,
              triggeredAt: new Date().toISOString(),
              triggeredBy: userId,
            }),
          },
        ],
      }),
    };
    
    const invokeResult = await lambdaClient.send(new InvokeCommand(invokeParams));
    
    // Parse the response
    const responsePayload = JSON.parse(Buffer.from(invokeResult.Payload).toString());
    
    console.log('Analytics refresh completed', {
      userId: userId,
      statusCode: invokeResult.StatusCode,
      functionError: invokeResult.FunctionError,
      response: responsePayload,
    });
    
    if (invokeResult.FunctionError) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'Error refreshing analytics',
          error: responsePayload.errorMessage || invokeResult.FunctionError,
        }),
      };
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Analytics refresh triggered successfully',
        data: {
          processed: responsePayload.processed || 0,
          successful: responsePayload.successful || 0,
          failed: responsePayload.failed || 0,
        },
      }),
    };
  } catch (error) {
    console.error('Error triggering analytics refresh', {
      userId: userId,
      error: error.message,
      stack: error.stack,
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Error triggering analytics refresh',
        error: error.message,
      }),
    };
  }
}

/**
 * Handle analysis request - get expenses by category for current month
 */
async function handleAnalysisRequest(userId) {
  if (!ANALYSIS_TABLE) {
    console.error('ANALYSIS_TABLE environment variable is not set');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Analysis table not configured',
      }),
    };
  }

  try {
    const monthYear = getCurrentMonthYear();
    const analyticTag = `expense-category-breakdown-month-${monthYear}`;
    
    console.log('Fetching analysis data', {
      userId: userId,
      analyticTag: analyticTag,
      tableName: ANALYSIS_TABLE,
    });
    
    const result = await dynamodb.send(new GetCommand({
      TableName: ANALYSIS_TABLE,
      Key: {
        userId: userId,
        analyticTag: analyticTag,
      },
    }));
    
    if (!result.Item) {
      console.log('No analysis data found for current month', {
        userId: userId,
        analyticTag: analyticTag,
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'No analysis data available for current month',
          data: null,
        }),
      };
    }
    
    console.log('Analysis data retrieved successfully', {
      userId: userId,
      analyticTag: analyticTag,
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Analysis data retrieved successfully',
        data: result.Item.payload || {},
      }),
    };
  } catch (error) {
    console.error('Error fetching analysis data', {
      userId: userId,
      error: error.message,
      stack: error.stack,
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Error fetching analysis data',
        error: error.message,
      }),
    };
  }
}

/**
 * Handle all-time analysis request - get expenses by category for all-time
 */
async function handleAllTimeAnalysisRequest(userId) {
  if (!ANALYSIS_TABLE) {
    console.error('ANALYSIS_TABLE environment variable is not set');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Analysis table not configured',
      }),
    };
  }

  try {
    const analyticTag = 'expense-category-breakdown-all-time';
    
    console.log('Fetching all-time analysis data', {
      userId: userId,
      analyticTag: analyticTag,
      tableName: ANALYSIS_TABLE,
    });
    
    const result = await dynamodb.send(new GetCommand({
      TableName: ANALYSIS_TABLE,
      Key: {
        userId: userId,
        analyticTag: analyticTag,
      },
    }));
    
    if (!result.Item) {
      console.log('No all-time analysis data found', {
        userId: userId,
        analyticTag: analyticTag,
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'No all-time analysis data available',
          data: null,
        }),
      };
    }
    
    console.log('All-time analysis data retrieved successfully', {
      userId: userId,
      analyticTag: analyticTag,
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'All-time analysis data retrieved successfully',
        data: result.Item.payload || {},
      }),
    };
  } catch (error) {
    console.error('Error fetching all-time analysis data', {
      userId: userId,
      error: error.message,
      stack: error.stack,
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Error fetching all-time analysis data',
        error: error.message,
      }),
    };
  }
}

/**
 * Handle monthly trend analysis request - get category-wise monthly trends
 */
async function handleMonthlyTrendRequest(userId) {
  if (!ANALYSIS_TABLE) {
    console.error('ANALYSIS_TABLE environment variable is not set');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Analysis table not configured',
      }),
    };
  }

  try {
    const analyticTag = 'expense-category-monthly-trend';
    
    console.log('Fetching monthly trend analysis data', {
      userId: userId,
      analyticTag: analyticTag,
      tableName: ANALYSIS_TABLE,
    });
    
    const result = await dynamodb.send(new GetCommand({
      TableName: ANALYSIS_TABLE,
      Key: {
        userId: userId,
        analyticTag: analyticTag,
      },
    }));
    
    if (!result.Item) {
      console.log('No monthly trend analysis data found', {
        userId: userId,
        analyticTag: analyticTag,
      });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'No monthly trend analysis data available',
          data: null,
        }),
      };
    }
    
    console.log('Monthly trend analysis data retrieved successfully', {
      userId: userId,
      analyticTag: analyticTag,
      monthCount: Object.keys(result.Item.payload?.monthlyTrend || {}).length,
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'Monthly trend analysis data retrieved successfully',
        data: result.Item.payload || {},
      }),
    };
  } catch (error) {
    console.error('Error fetching monthly trend analysis data', {
      userId: userId,
      error: error.message,
      stack: error.stack,
    });
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'Error fetching monthly trend analysis data',
        error: error.message,
      }),
    };
  }
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
    // Check if this is an analysis request
    const path = event.requestContext?.http?.path || event.path || '';
    if (method === 'GET' && (path.endsWith('/analysis/monthly-trend') || path.includes('/expenses/analysis/monthly-trend'))) {
      // Handle monthly trend analysis endpoint
      return await handleMonthlyTrendRequest(userId);
    }
    
    if (method === 'GET' && (path.endsWith('/analysis/all-time') || path.includes('/expenses/analysis/all-time'))) {
      // Handle all-time analysis endpoint
      return await handleAllTimeAnalysisRequest(userId);
    }
    
    if (method === 'GET' && (path.endsWith('/analysis') || path.includes('/expenses/analysis'))) {
      // Handle analysis endpoint (current month)
      return await handleAnalysisRequest(userId);
    }
    
    // Check if this is a refresh analytics request
    if (method === 'POST' && (path.endsWith('/analysis/refresh') || path.includes('/expenses/analysis/refresh'))) {
      // Handle refresh analytics endpoint
      return await handleRefreshAnalytics(userId);
    }
    
    // Check if this is a categorization validation request
    if (method === 'POST' && (path.endsWith('/categorize/validate') || path.includes('/expenses/categorize/validate'))) {
      // Handle categorization validation endpoint
      return await handleCategorizeValidateRequest(userId, event);
    }
    
    switch (method) {
      case 'GET': {
        // Get expenses for the authenticated user, optionally filtered by categorized status
        // Return ALL expenses - pagination handled client-side
        const queryParams = event.queryStringParameters || {};
        const categorizedParam = queryParams.categorized;
        const categorized = categorizedParam === 'true';
        const uncategorized = categorizedParam === 'false';
        
        if (!TABLE_NAME) {
          console.error('TABLE_NAME environment variable is not set');
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              message: 'Table name not configured',
            }),
          };
        }
        
        console.log('Querying expenses table', {
          tableName: TABLE_NAME,
          userId: userId,
          categorized: categorizedParam,
        });
        
        // Fetch ALL expenses for the user (paginate through DynamoDB results)
        let allItems = [];
        let lastEvaluatedKey = null;
        
        try {
          do {
            const queryParams_dynamo = {
              TableName: TABLE_NAME,
              IndexName: 'userId-index',
              KeyConditionExpression: 'userId = :userId',
              ExpressionAttributeValues: {
                ':userId': userId,
              },
              ScanIndexForward: false, // false = descending order (newest first)
            };
            
            if (lastEvaluatedKey) {
              queryParams_dynamo.ExclusiveStartKey = lastEvaluatedKey;
            }
            
            const queryResult = await dynamodb.send(new QueryCommand(queryParams_dynamo));
            
            if (queryResult.Items) {
              allItems.push(...queryResult.Items);
            }
            
            lastEvaluatedKey = queryResult.LastEvaluatedKey;
          } while (lastEvaluatedKey);
        } catch (queryError) {
          console.error('Error querying expenses', {
            error: queryError.message,
            stack: queryError.stack,
            userId: userId,
          });
          throw queryError;
        }
        
        // Filter client-side
        let filteredItems = allItems;
        if (uncategorized) {
          filteredItems = filteredItems.filter(item => !item.categorizedAt);
        } else if (categorized) {
          // Filter for categorized expenses (must have categorizedAt field)
          filteredItems = filteredItems.filter(item => item.categorizedAt);
        }
        
        const itemCount = filteredItems.length;
        
        console.log('Expenses retrieved successfully', {
          itemCount: itemCount,
          totalItems: allItems.length,
          categorized: categorizedParam,
          userId: userId,
        });
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            message: 'Expenses retrieved successfully',
            data: filteredItems,
            totalCount: itemCount,
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
        
        // If AI categorization enabled, send to queue asynchronously (don't await - return response immediately)
        if (expense.aiCategorizationEnabled && expense.aiCategorizationStatus === 'pending') {
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

