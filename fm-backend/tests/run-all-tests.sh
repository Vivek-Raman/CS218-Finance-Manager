#!/bin/bash
# Run all test scripts
# Usage: ./tests/run-all-tests.sh

set -e

echo "🧪 Running all test scripts..."
echo ""

cd "$(dirname "$0")/.."

# Test 1: categoryManager
echo "📦 Testing categoryManager.js..."
node tests/test-categoryManager.js
echo ""

# Test 2: expenseCategorizer (with mocks)
echo "🤖 Testing expenseCategorizer.js..."
node tests/test-expenseCategorizer.js
echo ""

# Test 3: processExpense logic
echo "📝 Testing processExpense.js logic..."
node tests/test-processExpense-logic.js
echo ""

# Test 4: expenses validation
echo "✅ Testing expenses.js validation logic..."
node tests/test-expenses-validation.js
echo ""

# Test 5: categorizeExpenses batch processing
echo "🔄 Testing categorizeExpenses.js batch processing..."
node tests/test-categorizeExpenses-logic.js
echo ""

echo "🎉 All test suites completed!"
