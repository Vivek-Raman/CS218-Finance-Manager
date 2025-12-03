/**
 * Test script for categoryManager.js
 * Run with: node tests/test-categoryManager.js
 */

const {
  PREDEFINED_CATEGORIES,
  getUserCategories,
  extractUserDefinedCategories,
  validateCategory,
} = require('../services/categoryManager');

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

function assertArrayEqual(actual, expected, message) {
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort())) {
    throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('🧪 Testing categoryManager.js\n');

// Test 1: PREDEFINED_CATEGORIES
test('PREDEFINED_CATEGORIES should be an array', () => {
  assert(Array.isArray(PREDEFINED_CATEGORIES), 'PREDEFINED_CATEGORIES should be an array');
  assert(PREDEFINED_CATEGORIES.length > 0, 'PREDEFINED_CATEGORIES should not be empty');
});

// Test 2: extractUserDefinedCategories with empty array
test('extractUserDefinedCategories should return empty array for empty input', () => {
  const result = extractUserDefinedCategories([]);
  assertArrayEqual(result, [], 'Should return empty array');
});

// Test 3: extractUserDefinedCategories with null/undefined
test('extractUserDefinedCategories should handle null/undefined', () => {
  assertArrayEqual(extractUserDefinedCategories(null), [], 'Should return empty array for null');
  assertArrayEqual(extractUserDefinedCategories(undefined), [], 'Should return empty array for undefined');
});

// Test 4: extractUserDefinedCategories with predefined categories
test('extractUserDefinedCategories should not include predefined categories', () => {
  const expenses = [
    { category: 'Food & Dining' },
    { category: 'Transportation' },
    { category: 'Shopping' },
  ];
  const result = extractUserDefinedCategories(expenses);
  assertArrayEqual(result, [], 'Should not include predefined categories');
});

// Test 5: extractUserDefinedCategories with user-defined categories
test('extractUserDefinedCategories should extract user-defined categories', () => {
  const expenses = [
    { category: 'Food & Dining' }, // predefined
    { category: 'Custom Category 1' }, // user-defined
    { category: 'Custom Category 2' }, // user-defined
    { category: 'Transportation' }, // predefined
    { category: 'Custom Category 1' }, // duplicate user-defined
  ];
  const result = extractUserDefinedCategories(expenses);
  assertArrayEqual(result, ['Custom Category 1', 'Custom Category 2'], 'Should extract unique user-defined categories');
});

// Test 6: extractUserDefinedCategories with empty/null categories
test('extractUserDefinedCategories should skip empty/null categories', () => {
  const expenses = [
    { category: '' },
    { category: null },
    { category: undefined },
    { category: '   ' }, // whitespace only
    { category: 'Valid Category' },
  ];
  const result = extractUserDefinedCategories(expenses);
  assertArrayEqual(result, ['Valid Category'], 'Should only include valid non-empty categories');
});

// Test 7: getUserCategories with no user expenses
test('getUserCategories should return predefined categories when no user expenses', () => {
  const result = getUserCategories('user123', null);
  assert(Array.isArray(result.predefined), 'predefined should be an array');
  assert(Array.isArray(result.userDefined), 'userDefined should be an array');
  assert(Array.isArray(result.all), 'all should be an array');
  assertArrayEqual(result.predefined, PREDEFINED_CATEGORIES, 'predefined should match PREDEFINED_CATEGORIES');
  assertArrayEqual(result.userDefined, [], 'userDefined should be empty');
  assert(result.all.length === PREDEFINED_CATEGORIES.length, 'all should contain only predefined');
});

// Test 8: getUserCategories with user expenses
test('getUserCategories should combine predefined and user-defined categories', () => {
  const userExpenses = [
    { category: 'Food & Dining' }, // predefined
    { category: 'My Custom Category' }, // user-defined
    { category: 'Another Custom' }, // user-defined
  ];
  const result = getUserCategories('user123', userExpenses);
  assert(result.all.includes('Food & Dining'), 'Should include predefined categories');
  assert(result.all.includes('My Custom Category'), 'Should include user-defined categories');
  assert(result.all.includes('Another Custom'), 'Should include all user-defined categories');
  assert(result.all.length > PREDEFINED_CATEGORIES.length, 'all should have more than predefined');
});

// Test 9: validateCategory with valid category
test('validateCategory should return category for valid input', () => {
  const availableCategories = ['Food & Dining', 'Transportation', 'Shopping'];
  const result = validateCategory('Food & Dining', availableCategories);
  assertEqual(result, 'Food & Dining', 'Should return the category');
});

// Test 10: validateCategory with case-insensitive match
test('validateCategory should match case-insensitively', () => {
  const availableCategories = ['Food & Dining', 'Transportation'];
  const result = validateCategory('food & dining', availableCategories);
  assertEqual(result, 'Food & Dining', 'Should return case-corrected category');
});

// Test 11: validateCategory with invalid category
test('validateCategory should return null for invalid category', () => {
  const availableCategories = ['Food & Dining', 'Transportation'];
  const result = validateCategory('Invalid Category', availableCategories);
  assertEqual(result, null, 'Should return null for invalid category');
});

// Test 12: validateCategory with null/empty input
test('validateCategory should return null for null/empty input', () => {
  const availableCategories = ['Food & Dining'];
  assertEqual(validateCategory(null, availableCategories), null, 'Should return null for null');
  assertEqual(validateCategory('', availableCategories), null, 'Should return null for empty string');
  assertEqual(validateCategory('   ', availableCategories), null, 'Should return null for whitespace');
});

// Test 13: getUserCategories deduplication
test('getUserCategories should not duplicate categories', () => {
  const userExpenses = [
    { category: 'Food & Dining' },
    { category: 'Food & Dining' }, // duplicate
    { category: 'Custom' },
    { category: 'Custom' }, // duplicate
  ];
  const result = getUserCategories('user123', userExpenses);
  const foodCount = result.all.filter(c => c === 'Food & Dining').length;
  const customCount = result.all.filter(c => c === 'Custom').length;
  assertEqual(foodCount, 1, 'Should not duplicate predefined categories');
  assertEqual(customCount, 1, 'Should not duplicate user-defined categories');
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
