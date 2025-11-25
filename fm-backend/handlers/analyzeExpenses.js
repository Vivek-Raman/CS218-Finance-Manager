/**
 * Analyze Expenses Lambda handler
 * Triggered by SQS delay queue 5 minutes after file upload
 * Pulls data from DB, calculates expenses by category - month to date for all users, and stores in analysis table
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);
const EXPENSES_TABLE = process.env.EXPENSES_TABLE;
const ANALYSIS_TABLE = process.env.ANALYSIS_TABLE;

// Validate environment variables
if (!EXPENSES_TABLE) {
  throw new Error('EXPENSES_TABLE environment variable is not set');
}
if (!ANALYSIS_TABLE) {
  throw new Error('ANALYSIS_TABLE environment variable is not set');
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
 * Get start of current month timestamp
 */
function getMonthStartTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return new Date(year, month, 1).toISOString();
}

/**
 * Query all expenses for a user and filter to current month
 */
async function getUserExpensesForCurrentMonth(userId) {
  const monthStart = getMonthStartTimestamp();
  const allExpenses = [];
  let lastEvaluatedKey = null;

  do {
    const queryParams = {
      TableName: EXPENSES_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    };

    if (lastEvaluatedKey) {
      queryParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamodb.send(new QueryCommand(queryParams));
    
    if (result.Items) {
      allExpenses.push(...result.Items);
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  // Filter to current month and only categorized expenses
  const currentMonthExpenses = allExpenses.filter(expense => {
    const expenseDate = new Date(expense.timestamp);
    const monthStartDate = new Date(monthStart);
    
    return expenseDate >= monthStartDate && 
           expense.category && 
           expense.categorizedAt;
  });

  return currentMonthExpenses;
}

/**
 * Query all categorized expenses for a user (all-time)
 */
async function getUserExpensesAllTime(userId) {
  const allExpenses = [];
  let lastEvaluatedKey = null;

  do {
    const queryParams = {
      TableName: EXPENSES_TABLE,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
    };

    if (lastEvaluatedKey) {
      queryParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    const result = await dynamodb.send(new QueryCommand(queryParams));
    
    if (result.Items) {
      allExpenses.push(...result.Items);
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  // Filter to only categorized expenses
  const categorizedExpenses = allExpenses.filter(expense => {
    return expense.category && expense.categorizedAt;
  });

  return categorizedExpenses;
}

/**
 * Calculate expenses by category
 */
function calculateCategoryBreakdown(expenses) {
  const breakdown = {};
  let totalAmount = 0;
  
  expenses.forEach(expense => {
    const category = expense.category || 'Uncategorized';
    const amount = parseFloat(expense.amount) || 0;
    
    if (!breakdown[category]) {
      breakdown[category] = 0;
    }
    
    breakdown[category] += amount;
    totalAmount += amount;
  });

  return {
    categoryBreakdown: breakdown,
    totalAmount,
    expenseCount: expenses.length,
  };
}

/**
 * Get month-year string from timestamp (YYYY-MM format)
 */
function getMonthYearFromTimestamp(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Calculate category-wise monthly trends
 * Returns an object with month-year as keys and category breakdowns as values
 */
function calculateCategoryMonthlyTrend(expenses) {
  const monthlyTrend = {};
  
  expenses.forEach(expense => {
    const monthYear = getMonthYearFromTimestamp(expense.timestamp);
    const category = expense.category || 'Uncategorized';
    const amount = parseFloat(expense.amount) || 0;
    
    if (!monthlyTrend[monthYear]) {
      monthlyTrend[monthYear] = {};
    }
    
    if (!monthlyTrend[monthYear][category]) {
      monthlyTrend[monthYear][category] = 0;
    }
    
    monthlyTrend[monthYear][category] += amount;
  });

  // Sort months chronologically
  const sortedTrend = {};
  Object.keys(monthlyTrend).sort().forEach(month => {
    sortedTrend[month] = monthlyTrend[month];
  });

  return sortedTrend;
}


/**
 * Process analysis for a single user
 */
async function processUserAnalysis(userId) {
  console.log('Processing analysis for user', {
    userId: userId,
    monthStart: getMonthStartTimestamp(),
  });
  
  const expenses = await getUserExpensesForCurrentMonth(userId);
  
  console.log('Fetched expenses for user', {
    userId: userId,
    expenseCount: expenses.length,
  });
  
  // Calculate category breakdown
  const analysis = calculateCategoryBreakdown(expenses);
  const monthYear = getCurrentMonthYear();
  const lastUpdated = new Date().toISOString();
  const analyticTag = `expense-category-breakdown-month-${monthYear}`;
  
  // Store/update analysis result with generic structure
  const analysisItem = {
    userId: userId,
    analyticTag: analyticTag,
    payload: {
      categoryBreakdown: analysis.categoryBreakdown,
      totalAmount: analysis.totalAmount,
      expenseCount: analysis.expenseCount,
      lastUpdated: lastUpdated,
    },
  };
  
  console.log('Storing analysis result', {
    userId: userId,
    analyticTag: analyticTag,
    categoryCount: Object.keys(analysis.categoryBreakdown).length,
    totalAmount: analysis.totalAmount,
    expenseCount: analysis.expenseCount,
  });
  
  await dynamodb.send(new PutCommand({
    TableName: ANALYSIS_TABLE,
    Item: analysisItem,
  }));
  
  // Also process all-time analysis
  const allTimeExpenses = await getUserExpensesAllTime(userId);
  const allTimeAnalysis = calculateCategoryBreakdown(allTimeExpenses);
  const allTimeAnalyticTag = 'expense-category-breakdown-all-time';
  const allTimeAnalysisItem = {
    userId: userId,
    analyticTag: allTimeAnalyticTag,
    payload: {
      categoryBreakdown: allTimeAnalysis.categoryBreakdown,
      totalAmount: allTimeAnalysis.totalAmount,
      expenseCount: allTimeAnalysis.expenseCount,
      lastUpdated: lastUpdated,
    },
  };
  
  console.log('Storing all-time analysis result', {
    userId: userId,
    analyticTag: allTimeAnalyticTag,
    categoryCount: Object.keys(allTimeAnalysis.categoryBreakdown).length,
    totalAmount: allTimeAnalysis.totalAmount,
    expenseCount: allTimeAnalysis.expenseCount,
  });
  
  await dynamodb.send(new PutCommand({
    TableName: ANALYSIS_TABLE,
    Item: allTimeAnalysisItem,
  }));
  
  // Process category-wise monthly trend analysis
  const monthlyTrend = calculateCategoryMonthlyTrend(allTimeExpenses);
  const monthlyTrendAnalyticTag = 'expense-category-monthly-trend';
  const monthlyTrendAnalysisItem = {
    userId: userId,
    analyticTag: monthlyTrendAnalyticTag,
    payload: {
      monthlyTrend: monthlyTrend,
      lastUpdated: lastUpdated,
    },
  };
  
  console.log('Storing monthly trend analysis result', {
    userId: userId,
    analyticTag: monthlyTrendAnalyticTag,
    monthCount: Object.keys(monthlyTrend).length,
  });
  
  await dynamodb.send(new PutCommand({
    TableName: ANALYSIS_TABLE,
    Item: monthlyTrendAnalysisItem,
  }));
  
  return {
    userId: userId,
    analyticTag: analyticTag,
    success: true,
  };
}

exports.handler = async (event) => {
  const startTime = Date.now();
  
  console.log('Analyze expenses handler invoked', {
    timestamp: new Date().toISOString(),
    hasRecords: !!event.Records && event.Records.length > 0,
    eventType: event.Records ? 'SQS' : 'Direct',
  });

  try {
    // Extract userId from payload - required
    let targetUserId = null;
    
    if (event.Records && event.Records.length > 0) {
      // Extract from SQS event format
      try {
        const firstRecord = event.Records[0];
        const body = typeof firstRecord.body === 'string' 
          ? JSON.parse(firstRecord.body) 
          : firstRecord.body;
        
        if (body.userId) {
          targetUserId = body.userId;
        }
      } catch (parseError) {
        console.error('Could not parse userId from Records', {
          error: parseError.message,
        });
        throw new Error(`Failed to parse userId from payload: ${parseError.message}`);
      }
    } else if (event.userId) {
      // Direct invocation with userId in event
      targetUserId = event.userId;
    }
    
    // Validate userId is provided
    if (!targetUserId) {
      const errorMessage = 'userId is required in payload';
      console.error(errorMessage, {
        hasRecords: !!event.Records,
        hasEventUserId: !!event.userId,
      });
      return {
        statusCode: 400,
        error: errorMessage,
        message: 'userId must be provided in the payload',
      };
    }
    
    // Process analytics for the specified user
    console.log('Processing analytics for user', {
      userId: targetUserId,
    });
    
    const userStartTime = Date.now();
    
    try {
      const result = await processUserAnalysis(targetUserId);
      const userDuration = Date.now() - userStartTime;
      
      console.log('User analysis completed successfully', {
        userId: targetUserId,
        analyticTag: result.analyticTag,
        duration: `${userDuration}ms`,
      });
      
      const duration = Date.now() - startTime;
      
      return {
        statusCode: 200,
        processed: 1,
        successful: 1,
        failed: 0,
        results: [{
          userId: targetUserId,
          success: true,
          analyticTag: result.analyticTag,
        }],
        duration: `${duration}ms`,
      };
    } catch (error) {
      const userDuration = Date.now() - userStartTime;
      console.error('Error processing user analysis', {
        userId: targetUserId,
        error: error.message,
        stack: error.stack,
        duration: `${userDuration}ms`,
      });
      
      const duration = Date.now() - startTime;
      
      return {
        statusCode: 500,
        processed: 1,
        successful: 0,
        failed: 1,
        results: [{
          userId: targetUserId,
          success: false,
          error: error.message,
        }],
        duration: `${duration}ms`,
      };
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('Error in analyze expenses handler', {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
    });
    
    return {
      statusCode: 500,
      error: error.message,
    };
  }
};

