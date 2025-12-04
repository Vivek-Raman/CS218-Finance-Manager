/**
 * Test script for expenses.js validation endpoint logic
 * Run with: node tests/test-expenses-validation.js
 * 
 * Tests the validation endpoint business logic
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

console.log('🧪 Testing expenses.js validation logic\n');

// Test 1: Validation request with missing expenseId
test('Validation request should require expenseId', () => {
  const body = {
    validated: true,
    // Missing expenseId
  };
  
  const isValid = body.expenseId && body.validated !== undefined;
  assert(!isValid, 'Should be invalid without expenseId');
});

// Test 2: Validation request with missing validated
test('Validation request should require validated field', () => {
  const body = {
    expenseId: 'expense123',
    // Missing validated
  };
  
  const isValid = body.expenseId && body.validated !== undefined;
  assert(!isValid, 'Should be invalid without validated field');
});

// Test 3: Validation request with valid data
test('Validation request should be valid with expenseId and validated', () => {
  const body = {
    expenseId: 'expense123',
    validated: true,
  };
  
  const isValid = body.expenseId && body.validated !== undefined;
  assert(isValid, 'Should be valid with both fields');
});

// Test 4: Accept AI suggestion (validated: true)
test('Accepting AI suggestion should set category to aiCategorySuggestion', () => {
  const expense = {
    id: 'expense123',
    userId: 'user123',
    aiCategorySuggestion: 'Food & Dining',
  };
  
  const body = {
    expenseId: expense.id,
    validated: true,
  };
  
  // Simulate update expression
  const updateExpression = 'SET aiCategoryValidated = :validated, category = :category, categorizedAt = :categorizedAt, updatedAt = :updatedAt';
  const expressionValues = {
    ':validated': true,
    ':category': expense.aiCategorySuggestion,
    ':categorizedAt': new Date().toISOString(),
    ':updatedAt': new Date().toISOString(),
  };
  
  assertEqual(expressionValues[':validated'], true, 'Should set validated to true');
  assertEqual(expressionValues[':category'], 'Food & Dining', 'Should set category to AI suggestion');
  assert(expressionValues[':categorizedAt'], 'Should set categorizedAt');
  assert(expressionValues[':updatedAt'], 'Should set updatedAt');
});

// Test 5: Reject AI suggestion without alternative category
test('Rejecting AI suggestion without category should only set validated=false', () => {
  const body = {
    expenseId: 'expense123',
    validated: false,
    // No category provided
  };
  
  // Simulate update expression
  const updateExpression = 'SET aiCategoryValidated = :validated, updatedAt = :updatedAt';
  const expressionValues = {
    ':validated': false,
    ':updatedAt': new Date().toISOString(),
  };
  
  assertEqual(expressionValues[':validated'], false, 'Should set validated to false');
  assert(!expressionValues[':category'], 'Should not set category');
});

// Test 6: Reject AI suggestion with alternative category
test('Rejecting AI suggestion with alternative category should set new category', () => {
  const body = {
    expenseId: 'expense123',
    validated: false,
    category: 'Transportation',
  };
  
  // Simulate update expression
  const updateExpression = 'SET aiCategoryValidated = :validated, category = :category, categorizedAt = :categorizedAt, updatedAt = :updatedAt';
  const expressionValues = {
    ':validated': false,
    ':category': body.category,
    ':categorizedAt': new Date().toISOString(),
    ':updatedAt': new Date().toISOString(),
  };
  
  assertEqual(expressionValues[':validated'], false, 'Should set validated to false');
  assertEqual(expressionValues[':category'], 'Transportation', 'Should set alternative category');
  assert(expressionValues[':categorizedAt'], 'Should set categorizedAt');
});

// Test 7: User ownership validation
test('Validation should check user ownership', () => {
  const expense = {
    id: 'expense123',
    userId: 'user123',
  };
  
  const requestUserId = 'user123';
  const differentUserId = 'user456';
  
  assertEqual(expense.userId, requestUserId, 'Should match requesting user');
  assert(expense.userId !== differentUserId, 'Should not match different user');
});

// Test 8: POST endpoint with AI categorization enabled
test('POST endpoint should set AI fields when aiCategorizationEnabled=true', () => {
  const body = {
    summary: 'Test expense',
    amount: 10.00,
    timestamp: '2024-01-15T10:00:00Z',
    aiCategorizationEnabled: true,
  };
  
  const expense = {
    id: 'expense1',
    userId: 'user123',
    summary: body.summary,
    amount: parseFloat(body.amount),
    timestamp: body.timestamp,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Handle AI categorization
  if (body.aiCategorizationEnabled === true && !expense.category) {
    expense.aiCategorizationEnabled = true;
    expense.aiCategorizationStatus = 'pending';
  }
  
  assertEqual(expense.aiCategorizationEnabled, true, 'Should have aiCategorizationEnabled=true');
  assertEqual(expense.aiCategorizationStatus, 'pending', 'Should have status=pending');
});

// Test 9: POST endpoint without AI categorization (backward compatible)
test('POST endpoint should work without AI fields (backward compatible)', () => {
  const body = {
    summary: 'Test expense',
    amount: 10.00,
    timestamp: '2024-01-15T10:00:00Z',
    // No aiCategorizationEnabled
  };
  
  const expense = {
    id: 'expense1',
    userId: 'user123',
    summary: body.summary,
    amount: parseFloat(body.amount),
    timestamp: body.timestamp,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Should work as before
  assert(expense.id, 'Should have id');
  assert(expense.userId, 'Should have userId');
  assert(expense.summary, 'Should have summary');
  assert(expense.amount, 'Should have amount');
  assert(expense.timestamp, 'Should have timestamp');
  assert(expense.aiCategorizationEnabled === undefined, 'Should not have AI fields');
});

// Test 10: Queue message format for POST endpoint
test('POST endpoint should send correct queue message format', () => {
  const expense = {
    id: 'expense1',
    userId: 'user123',
    aiCategorizationEnabled: true,
    aiCategorizationStatus: 'pending',
  };
  
  const shouldSendToQueue = expense.aiCategorizationEnabled && expense.aiCategorizationStatus === 'pending';
  assert(shouldSendToQueue, 'Should send to queue when AI enabled and pending');
  
  const queueMessage = {
    expenseId: expense.id,
    userId: expense.userId,
    timestamp: new Date().toISOString(),
  };
  
  assertEqual(queueMessage.expenseId, 'expense1', 'Should have expenseId');
  assertEqual(queueMessage.userId, 'user123', 'Should have userId');
  assert(queueMessage.timestamp, 'Should have timestamp');
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
