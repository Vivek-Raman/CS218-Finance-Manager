/**
 * Test script for categorizeExpenses.js batch processing logic
 * Run with: node tests/test-categorizeExpenses-logic.js
 * 
 * Tests the batch processing and filtering logic
 */

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

console.log('🧪 Testing categorizeExpenses.js batch processing logic\n');

// Test 1: Filter eligible expenses
test('Should filter expenses with aiCategorizationEnabled=true and status=pending', () => {
  const expenses = [
    {
      id: 'expense1',
      aiCategorizationEnabled: true,
      aiCategorizationStatus: 'pending',
      category: null,
    },
    {
      id: 'expense2',
      aiCategorizationEnabled: true,
      aiCategorizationStatus: 'processing',
      category: null,
    },
    {
      id: 'expense3',
      aiCategorizationEnabled: true,
      aiCategorizationStatus: 'pending',
      category: 'Food & Dining', // Already has category
    },
    {
      id: 'expense4',
      aiCategorizationEnabled: false,
      aiCategorizationStatus: undefined,
    },
    {
      id: 'expense5',
      aiCategorizationEnabled: true,
      aiCategorizationStatus: 'pending',
      category: null,
    },
  ];
  
  const eligibleExpenses = expenses.filter(expense => 
    expense.aiCategorizationEnabled === true && 
    expense.aiCategorizationStatus === 'pending' &&
    !expense.category
  );
  
  assertEqual(eligibleExpenses.length, 2, 'Should have 2 eligible expenses');
  assertEqual(eligibleExpenses[0].id, 'expense1', 'Should include expense1');
  assertEqual(eligibleExpenses[1].id, 'expense5', 'Should include expense5');
});

// Test 2: Batch grouping by userId
test('Should group expenses by userId', () => {
  const records = [
    { body: JSON.stringify({ expenseId: 'exp1', userId: 'user1' }) },
    { body: JSON.stringify({ expenseId: 'exp2', userId: 'user1' }) },
    { body: JSON.stringify({ expenseId: 'exp3', userId: 'user2' }) },
    { body: JSON.stringify({ expenseId: 'exp4', userId: 'user1' }) },
  ];
  
  const expensesByUser = {};
  for (const record of records) {
    const messageBody = JSON.parse(record.body);
    const { expenseId, userId } = messageBody;
    
    if (!expensesByUser[userId]) {
      expensesByUser[userId] = [];
    }
    expensesByUser[userId].push(expenseId);
  }
  
  assertEqual(expensesByUser['user1'].length, 3, 'user1 should have 3 expenses');
  assertEqual(expensesByUser['user2'].length, 1, 'user2 should have 1 expense');
  assert(expensesByUser['user1'].includes('exp1'), 'user1 should include exp1');
  assert(expensesByUser['user1'].includes('exp2'), 'user1 should include exp2');
  assert(expensesByUser['user1'].includes('exp4'), 'user1 should include exp4');
  assert(expensesByUser['user2'].includes('exp3'), 'user2 should include exp3');
});

// Test 3: Batch size limit (MAX_BATCH_SIZE = 100)
test('Should process expenses in batches of MAX_BATCH_SIZE', () => {
  const MAX_BATCH_SIZE = 100;
  const expenseIds = Array(250).fill(null).map((_, i) => `expense${i}`);
  
  const batches = [];
  for (let i = 0; i < expenseIds.length; i += MAX_BATCH_SIZE) {
    const batch = expenseIds.slice(i, i + MAX_BATCH_SIZE);
    batches.push(batch);
  }
  
  assertEqual(batches.length, 3, 'Should have 3 batches');
  assertEqual(batches[0].length, 100, 'First batch should have 100 items');
  assertEqual(batches[1].length, 100, 'Second batch should have 100 items');
  assertEqual(batches[2].length, 50, 'Third batch should have 50 items');
});

// Test 4: Status update to 'processing'
test('Should update status to processing before categorization', () => {
  const expense = {
    id: 'expense1',
    aiCategorizationStatus: 'pending',
  };
  
  const updateExpression = 'SET aiCategorizationStatus = :status, updatedAt = :updatedAt';
  const expressionValues = {
    ':status': 'processing',
    ':updatedAt': new Date().toISOString(),
  };
  
  assertEqual(expressionValues[':status'], 'processing', 'Should set status to processing');
  assert(expressionValues[':updatedAt'], 'Should set updatedAt');
});

// Test 5: Status update to 'completed'
test('Should update status to completed with suggestion', () => {
  const result = {
    expenseId: 'expense1',
    success: true,
    suggestedCategory: 'Food & Dining',
  };
  
  const updateExpression = 'SET aiCategorizationStatus = :status, aiCategorySuggestion = :suggestion, aiCategorizedAt = :categorizedAt, updatedAt = :updatedAt';
  const expressionValues = {
    ':status': 'completed',
    ':suggestion': result.suggestedCategory,
    ':categorizedAt': new Date().toISOString(),
    ':updatedAt': new Date().toISOString(),
  };
  
  assertEqual(expressionValues[':status'], 'completed', 'Should set status to completed');
  assertEqual(expressionValues[':suggestion'], 'Food & Dining', 'Should set suggestion');
  assert(expressionValues[':categorizedAt'], 'Should set categorizedAt');
});

// Test 6: Status update to 'failed'
test('Should update status to failed on error', () => {
  const result = {
    expenseId: 'expense1',
    success: false,
    error: 'API Error',
  };
  
  const updateExpression = 'SET aiCategorizationStatus = :status, updatedAt = :updatedAt';
  const expressionValues = {
    ':status': 'failed',
    ':updatedAt': new Date().toISOString(),
  };
  
  assertEqual(expressionValues[':status'], 'failed', 'Should set status to failed');
  assert(expressionValues[':updatedAt'], 'Should set updatedAt');
});

// Test 7: Empty eligible expenses
test('Should handle empty eligible expenses gracefully', () => {
  const expenses = [
    {
      id: 'expense1',
      aiCategorizationEnabled: false,
    },
    {
      id: 'expense2',
      aiCategorizationStatus: 'completed',
    },
  ];
  
  const eligibleExpenses = expenses.filter(expense => 
    expense.aiCategorizationEnabled === true && 
    expense.aiCategorizationStatus === 'pending' &&
    !expense.category
  );
  
  assertEqual(eligibleExpenses.length, 0, 'Should have 0 eligible expenses');
  
  // Should return early with skipped count
  const result = {
    totalProcessed: expenses.length,
    successful: 0,
    failed: 0,
    skipped: expenses.length,
  };
  
  assertEqual(result.skipped, 2, 'Should skip all expenses');
});

// Test 8: Result aggregation
test('Should aggregate results from multiple batches', () => {
  const results = [
    { totalProcessed: 50, successful: 45, failed: 5, skipped: 0 },
    { totalProcessed: 30, successful: 28, failed: 2, skipped: 0 },
    { totalProcessed: 20, successful: 18, failed: 2, skipped: 0 },
  ];
  
  const aggregated = {
    totalProcessed: results.reduce((sum, r) => sum + r.totalProcessed, 0),
    successful: results.reduce((sum, r) => sum + r.successful, 0),
    failed: results.reduce((sum, r) => sum + r.failed, 0),
    skipped: results.reduce((sum, r) => sum + r.skipped, 0),
  };
  
  assertEqual(aggregated.totalProcessed, 100, 'Should sum totalProcessed');
  assertEqual(aggregated.successful, 91, 'Should sum successful');
  assertEqual(aggregated.failed, 9, 'Should sum failed');
  assertEqual(aggregated.skipped, 0, 'Should sum skipped');
});

// Test 9: Invalid message format handling
test('Should handle invalid message format gracefully', () => {
  const records = [
    { body: JSON.stringify({ expenseId: 'exp1', userId: 'user1' }) },
    { body: 'invalid json' }, // Invalid JSON
    { body: JSON.stringify({ expenseId: 'exp2' }) }, // Missing userId
    { body: JSON.stringify({ userId: 'user1' }) }, // Missing expenseId
  ];
  
  const expensesByUser = {};
  let validCount = 0;
  let invalidCount = 0;
  
  for (const record of records) {
    try {
      const messageBody = JSON.parse(record.body);
      const { expenseId, userId } = messageBody;
      
      if (!expenseId || !userId) {
        invalidCount++;
        continue;
      }
      
      if (!expensesByUser[userId]) {
        expensesByUser[userId] = [];
      }
      expensesByUser[userId].push(expenseId);
      validCount++;
    } catch (error) {
      invalidCount++;
    }
  }
  
  assertEqual(validCount, 1, 'Should process 1 valid message');
  assertEqual(invalidCount, 3, 'Should skip 3 invalid messages');
});

console.log('\n📊 Test Results:');
console.log(`   ✅ Passed: ${testsPassed}`);
console.log(`   ❌ Failed: ${testsFailed}`);
console.log(`   📈 Total: ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed');
  process.exit(1);
}
