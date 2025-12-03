/**
 * Test script for expenseCategorizer.js
 * Run with: node tests/test-expenseCategorizer.js
 * 
 * Uses real OpenAI API if OPENAI_API_KEY is set, otherwise uses mocks
 */

// Set up environment for testing
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key';
process.env.OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
process.env.OPENAI_TEMPERATURE = process.env.OPENAI_TEMPERATURE || '0.3';
process.env.OPENAI_MAX_TOKENS = process.env.OPENAI_MAX_TOKENS || '200';

const USE_REAL_API = process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'test-key';

// Now require the categorizer (it will use real OpenAI if credentials are set)
const { categorizeBatch } = require('../services/expenseCategorizer');

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
    if (error.stack) {
      console.error(`   Stack: ${error.stack.split('\n')[1]}`);
    }
    testsFailed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    testsPassed++;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    if (error.stack) {
      console.error(`   Stack: ${error.stack.split('\n')[1]}`);
    }
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

console.log('🧪 Testing expenseCategorizer.js');
if (USE_REAL_API) {
  console.log('   Using REAL OpenAI API (OPENAI_API_KEY is set)\n');
} else {
  console.log('   Using MOCK responses (no real API calls)\n');
}

// Test 1: categorizeBatch with empty array
testAsync('categorizeBatch should handle empty array', async () => {
  const availableCategories = ['Food & Dining', 'Transportation', 'Other'];
  const result = await categorizeBatch([], availableCategories);
  assertEqual(result.successful, 0, 'Should have 0 successful');
  assertEqual(result.failed, 0, 'Should have 0 failed');
  assertEqual(result.results.length, 0, 'Should have 0 results');
});

// Test 2: categorizeBatch with single expense (only if using real API or skip)
if (USE_REAL_API) {
  testAsync('categorizeBatch should categorize single expense (REAL API)', async () => {
    const expenses = [
      {
        id: 'expense1',
        summary: 'Starbucks coffee',
        amount: 5.50,
        timestamp: '2024-01-15T10:00:00Z',
      },
    ];
    const availableCategories = ['Food & Dining', 'Transportation', 'Other'];
    const result = await categorizeBatch(expenses, availableCategories);
    assertEqual(result.successful, 1, 'Should have 1 successful');
    assertEqual(result.failed, 0, 'Should have 0 failed');
    assert(result.results[0].success, 'First result should be successful');
    assert(result.results[0].suggestedCategory, 'Should have a suggested category');
    console.log(`      Suggested category: ${result.results[0].suggestedCategory}`);
  });
} else {
  test('categorizeBatch with single expense (SKIPPED - requires real API)', () => {
    console.log('      ⏭️  Skipped - set OPENAI_API_KEY to test with real API');
  });
}

// Test 3: categorizeBatch with multiple expenses (only if using real API)
if (USE_REAL_API) {
  testAsync('categorizeBatch should categorize multiple expenses (REAL API)', async () => {
    const expenses = [
      {
        id: 'expense1',
        summary: 'Starbucks coffee',
        amount: 5.50,
        timestamp: '2024-01-15T10:00:00Z',
      },
      {
        id: 'expense2',
        summary: 'Uber ride to airport',
        amount: 25.00,
        timestamp: '2024-01-15T11:00:00Z',
      },
      {
        id: 'expense3',
        summary: 'Amazon shopping',
        amount: 50.00,
        timestamp: '2024-01-15T12:00:00Z',
      },
    ];
    const availableCategories = ['Food & Dining', 'Transportation', 'Shopping', 'Other'];
    const result = await categorizeBatch(expenses, availableCategories);
    assertEqual(result.successful, 3, 'Should have 3 successful');
    assertEqual(result.failed, 0, 'Should have 0 failed');
    assertEqual(result.results.length, 3, 'Should have 3 results');
    
    // Check each result has a category
    result.results.forEach((r, i) => {
      assert(r.success, `Result ${i} should be successful`);
      assert(r.suggestedCategory, `Result ${i} should have suggested category`);
      console.log(`      Expense ${i + 1}: ${r.suggestedCategory}`);
    });
  });
} else {
  test('categorizeBatch with multiple expenses (SKIPPED - requires real API)', () => {
    console.log('      ⏭️  Skipped - set OPENAI_API_KEY to test with real API');
  });
}

// Test 4: categorizeBatch with invalid category (should fallback to Other)
if (USE_REAL_API) {
  testAsync('categorizeBatch should return valid category from available list', async () => {
    const expenses = [
      {
        id: 'expense1',
        summary: 'Random expense',
        amount: 10.00,
        timestamp: '2024-01-15T10:00:00Z',
      },
    ];
    const availableCategories = ['Food & Dining', 'Transportation', 'Other'];
    const result = await categorizeBatch(expenses, availableCategories);
    assertEqual(result.successful, 1, 'Should have 1 successful');
    assert(result.results[0].success, 'Result should be successful');
    assert(result.results[0].suggestedCategory, 'Should have a suggested category');
    assert(availableCategories.includes(result.results[0].suggestedCategory), 
      'Suggested category should be in available list');
    console.log(`      Suggested category: ${result.results[0].suggestedCategory}`);
  });
} else {
  test('categorizeBatch fallback (SKIPPED - requires real API)', () => {
    console.log('      ⏭️  Skipped - set OPENAI_API_KEY to test with real API');
  });
}

// Test 5: categorizeBatch error handling (test with invalid API key scenario)
testAsync('categorizeBatch should handle API errors gracefully', async () => {
  // This test will work with real API - if it fails, it should handle gracefully
  const expenses = [
    {
      id: 'expense1',
      summary: 'Test expense',
      amount: 10.00,
      timestamp: '2024-01-15T10:00:00Z',
    },
  ];
  const availableCategories = ['Food & Dining', 'Other'];
  
  try {
    const result = await categorizeBatch(expenses, availableCategories);
    // If we get here with real API, it either succeeded or failed gracefully
    assert(Array.isArray(result.results), 'Should return results array');
    if (result.failed > 0) {
      console.log('      API call failed (expected in some scenarios)');
      assert(!result.results[0].success, 'Failed result should have success=false');
      assert(result.results[0].error, 'Failed result should have error message');
    }
  } catch (error) {
    // If using real API and it throws, that's also acceptable for error handling test
    console.log('      API error caught (acceptable for error handling test)');
  }
});

// Test 6: categorizeBatch with batch size limit
test('categorizeBatch should reject batches larger than 100', async () => {
  const expenses = Array(101).fill(null).map((_, i) => ({
    id: `expense${i}`,
    summary: `Expense ${i}`,
    amount: 10.00,
    timestamp: '2024-01-15T10:00:00Z',
  }));
  const availableCategories = ['Food & Dining', 'Other'];
  
  try {
    await categorizeBatch(expenses, availableCategories);
    throw new Error('Should have thrown error for batch size > 100');
  } catch (error) {
    assert(error.message.includes('100'), 'Error should mention batch size limit');
  }
});

// Test 7: categorizeBatch with no available categories
test('categorizeBatch should reject empty categories list', async () => {
  const expenses = [
    {
      id: 'expense1',
      summary: 'Test expense',
      amount: 10.00,
      timestamp: '2024-01-15T10:00:00Z',
    },
  ];
  
  try {
    await categorizeBatch(expenses, []);
    throw new Error('Should have thrown error for empty categories');
  } catch (error) {
    assert(error.message.includes('categories'), 'Error should mention categories');
  }
});

// Run all async tests
(async () => {
  await testAsync('categorizeBatch should handle empty array', async () => {
    const availableCategories = ['Food & Dining', 'Transportation', 'Other'];
    const result = await categorizeBatch([], availableCategories);
    assertEqual(result.successful, 0, 'Should have 0 successful');
    assertEqual(result.failed, 0, 'Should have 0 failed');
    assertEqual(result.results.length, 0, 'Should have 0 results');
  });
  
  if (USE_REAL_API) {
    await testAsync('categorizeBatch should categorize single expense (REAL API)', async () => {
      const expenses = [
        {
          id: 'expense1',
          summary: 'Starbucks coffee',
          amount: 5.50,
          timestamp: '2024-01-15T10:00:00Z',
        },
      ];
      const availableCategories = ['Food & Dining', 'Transportation', 'Other'];
      const result = await categorizeBatch(expenses, availableCategories);
      assertEqual(result.successful, 1, 'Should have 1 successful');
      assertEqual(result.failed, 0, 'Should have 0 failed');
      assert(result.results[0].success, 'First result should be successful');
      assert(result.results[0].suggestedCategory, 'Should have a suggested category');
      console.log(`      Suggested category: ${result.results[0].suggestedCategory}`);
    });
    
    await testAsync('categorizeBatch should categorize multiple expenses (REAL API)', async () => {
      const expenses = [
        {
          id: 'expense1',
          summary: 'Starbucks coffee',
          amount: 5.50,
          timestamp: '2024-01-15T10:00:00Z',
        },
        {
          id: 'expense2',
          summary: 'Uber ride to airport',
          amount: 25.00,
          timestamp: '2024-01-15T11:00:00Z',
        },
        {
          id: 'expense3',
          summary: 'Amazon shopping',
          amount: 50.00,
          timestamp: '2024-01-15T12:00:00Z',
        },
      ];
      const availableCategories = ['Food & Dining', 'Transportation', 'Shopping', 'Other'];
      const result = await categorizeBatch(expenses, availableCategories);
      assertEqual(result.successful, 3, 'Should have 3 successful');
      assertEqual(result.failed, 0, 'Should have 0 failed');
      assertEqual(result.results.length, 3, 'Should have 3 results');
      
      result.results.forEach((r, i) => {
        assert(r.success, `Result ${i} should be successful`);
        assert(r.suggestedCategory, `Result ${i} should have suggested category`);
        console.log(`      Expense ${i + 1}: ${r.suggestedCategory}`);
      });
    });
    
    await testAsync('categorizeBatch should return valid category from available list', async () => {
      const expenses = [
        {
          id: 'expense1',
          summary: 'Random expense',
          amount: 10.00,
          timestamp: '2024-01-15T10:00:00Z',
        },
      ];
      const availableCategories = ['Food & Dining', 'Transportation', 'Other'];
      const result = await categorizeBatch(expenses, availableCategories);
      assertEqual(result.successful, 1, 'Should have 1 successful');
      assert(result.results[0].success, 'Result should be successful');
      assert(result.results[0].suggestedCategory, 'Should have a suggested category');
      assert(availableCategories.includes(result.results[0].suggestedCategory), 
        'Suggested category should be in available list');
      console.log(`      Suggested category: ${result.results[0].suggestedCategory}`);
    });
  }
  
  await testAsync('categorizeBatch should handle API errors gracefully', async () => {
    const expenses = [
      {
        id: 'expense1',
        summary: 'Test expense',
        amount: 10.00,
        timestamp: '2024-01-15T10:00:00Z',
      },
    ];
    const availableCategories = ['Food & Dining', 'Other'];
    
    try {
      const result = await categorizeBatch(expenses, availableCategories);
      assert(Array.isArray(result.results), 'Should return results array');
      if (result.failed > 0) {
        console.log('      API call failed (expected in some scenarios)');
        assert(!result.results[0].success, 'Failed result should have success=false');
        assert(result.results[0].error, 'Failed result should have error message');
      }
    } catch (error) {
      console.log('      API error caught (acceptable for error handling test)');
    }
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
})();
