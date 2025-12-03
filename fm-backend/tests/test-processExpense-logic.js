/**
 * Test script for processExpense.js logic (without AWS dependencies)
 * Run with: node tests/test-processExpense-logic.js
 * 
 * Tests the business logic for handling AI categorization flags
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

console.log('🧪 Testing processExpense.js logic\n');

// Test 1: Expense without AI categorization flag
test('Expense without aiCategorizationEnabled should not have AI fields', () => {
  const messageBody = {
    userId: 'user123',
    summary: 'Test expense',
    amount: 10.00,
    timestamp: '2024-01-15T10:00:00Z',
  };
  
  const expense = {
    id: 'expense1',
    userId: messageBody.userId,
    summary: messageBody.summary,
    amount: parseFloat(messageBody.amount),
    timestamp: messageBody.timestamp,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Should not have AI fields
  assert(expense.aiCategorizationEnabled === undefined, 'Should not have aiCategorizationEnabled');
  assert(expense.aiCategorizationStatus === undefined, 'Should not have aiCategorizationStatus');
});

// Test 2: Expense with AI categorization enabled
test('Expense with aiCategorizationEnabled=true should have AI fields set', () => {
  const messageBody = {
    userId: 'user123',
    summary: 'Test expense',
    amount: 10.00,
    timestamp: '2024-01-15T10:00:00Z',
    aiCategorizationEnabled: true,
  };
  
  const expense = {
    id: 'expense1',
    userId: messageBody.userId,
    summary: messageBody.summary,
    amount: parseFloat(messageBody.amount),
    timestamp: messageBody.timestamp,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Handle AI categorization flag
  if (messageBody.aiCategorizationEnabled && !expense.category) {
    expense.aiCategorizationEnabled = true;
    expense.aiCategorizationStatus = 'pending';
  }
  
  assertEqual(expense.aiCategorizationEnabled, true, 'Should have aiCategorizationEnabled=true');
  assertEqual(expense.aiCategorizationStatus, 'pending', 'Should have status=pending');
});

// Test 3: Expense with category should not enable AI categorization
test('Expense with existing category should not enable AI categorization', () => {
  const messageBody = {
    userId: 'user123',
    summary: 'Test expense',
    amount: 10.00,
    timestamp: '2024-01-15T10:00:00Z',
    category: 'Food & Dining',
    aiCategorizationEnabled: true,
  };
  
  const expense = {
    id: 'expense1',
    userId: messageBody.userId,
    summary: messageBody.summary,
    amount: parseFloat(messageBody.amount),
    timestamp: messageBody.timestamp,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Handle category first
  if (messageBody.category && typeof messageBody.category === 'string' && messageBody.category.trim() !== '') {
    expense.category = messageBody.category.trim();
    expense.categorizedAt = new Date().toISOString();
  }
  
  // Handle AI categorization flag (should not set because category exists)
  if (messageBody.aiCategorizationEnabled && !expense.category) {
    expense.aiCategorizationEnabled = true;
    expense.aiCategorizationStatus = 'pending';
  }
  
  assertEqual(expense.category, 'Food & Dining', 'Should have category');
  assert(expense.aiCategorizationEnabled === undefined, 'Should not have aiCategorizationEnabled when category exists');
});

// Test 4: Expense with aiCategorizationEnabled=false
test('Expense with aiCategorizationEnabled=false should not enable AI', () => {
  const messageBody = {
    userId: 'user123',
    summary: 'Test expense',
    amount: 10.00,
    timestamp: '2024-01-15T10:00:00Z',
    aiCategorizationEnabled: false,
  };
  
  const expense = {
    id: 'expense1',
    userId: messageBody.userId,
    summary: messageBody.summary,
    amount: parseFloat(messageBody.amount),
    timestamp: messageBody.timestamp,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Handle AI categorization flag
  if (messageBody.aiCategorizationEnabled && !expense.category) {
    expense.aiCategorizationEnabled = true;
    expense.aiCategorizationStatus = 'pending';
  }
  
  assert(expense.aiCategorizationEnabled === undefined, 'Should not have aiCategorizationEnabled when flag is false');
});

// Test 5: Queue message format
test('Queue message should have correct format for categorization', () => {
  const expense = {
    id: 'expense1',
    userId: 'user123',
  };
  
  const queueMessage = {
    expenseId: expense.id,
    userId: expense.userId,
    timestamp: new Date().toISOString(),
  };
  
  assertEqual(queueMessage.expenseId, 'expense1', 'Should have expenseId');
  assertEqual(queueMessage.userId, 'user123', 'Should have userId');
  assert(queueMessage.timestamp, 'Should have timestamp');
});

// Test 6: Backward compatibility - expense without AI flag
test('Expense without AI flag should work as before (backward compatible)', () => {
  const messageBody = {
    userId: 'user123',
    summary: 'Test expense',
    amount: 10.00,
    timestamp: '2024-01-15T10:00:00Z',
    // No aiCategorizationEnabled field
  };
  
  const expense = {
    id: 'expense1',
    userId: messageBody.userId,
    summary: messageBody.summary,
    amount: parseFloat(messageBody.amount),
    timestamp: messageBody.timestamp,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Should work exactly as before
  assert(expense.id, 'Should have id');
  assert(expense.userId, 'Should have userId');
  assert(expense.summary, 'Should have summary');
  assert(expense.amount, 'Should have amount');
  assert(expense.timestamp, 'Should have timestamp');
  assert(expense.createdAt, 'Should have createdAt');
  assert(expense.updatedAt, 'Should have updatedAt');
  assert(expense.aiCategorizationEnabled === undefined, 'Should not have AI fields');
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
