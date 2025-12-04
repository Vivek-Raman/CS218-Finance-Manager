# Test Scripts for AI Categorization

This directory contains test scripts for individual components of the AI categorization feature.

## Test Files

### 1. `test-categoryManager.js`
Tests the category management service:
- Pre-defined categories
- User-defined category extraction
- Category validation
- Category combination logic

**Run:** `node tests/test-categoryManager.js`

### 2. `test-expenseCategorizer.js`
Tests the expense categorizer service:
- Batch categorization
- OpenAI API integration (mocked)
- Error handling
- Category validation and fallback

**Run:** `node tests/test-expenseCategorizer.js`

**Note:** This test mocks the OpenAI API to avoid actual API calls.

### 3. `test-processExpense-logic.js`
Tests the processExpense handler logic:
- AI categorization flag handling
- Queue message format
- Backward compatibility
- Category vs AI categorization priority

**Run:** `node tests/test-processExpense-logic.js`

### 4. `test-expenses-validation.js`
Tests the expenses handler validation endpoint:
- Request validation
- Accept/reject AI suggestions
- User ownership checks
- Update expression logic

**Run:** `node tests/test-expenses-validation.js`

### 5. `test-categorizeExpenses-logic.js`
Tests the categorizeExpenses batch processing:
- Expense filtering logic
- Batch grouping by userId
- Status updates (pending → processing → completed/failed)
- Result aggregation

**Run:** `node tests/test-categorizeExpenses-logic.js`

## Running All Tests

Run all test scripts at once:

```bash
./tests/run-all-tests.sh
```

Or manually:

```bash
node tests/test-categoryManager.js
node tests/test-expenseCategorizer.js
node tests/test-processExpense-logic.js
node tests/test-expenses-validation.js
node tests/test-categorizeExpenses-logic.js
```

## Test Structure

Each test script:
- Uses a simple test framework (no external dependencies)
- Provides clear pass/fail output
- Exits with code 0 on success, 1 on failure
- Can be run independently

## What's Tested

### ✅ Business Logic
- Category extraction and validation
- AI categorization flag handling
- Status transitions
- Batch processing logic
- Error handling

### ✅ Data Structures
- Expense object structure
- Queue message format
- Update expressions
- Result aggregation

### ✅ Edge Cases
- Empty arrays
- Null/undefined values
- Invalid input
- Missing fields
- Backward compatibility

## What's NOT Tested

These tests focus on business logic only. They do NOT test:
- AWS SDK integration (DynamoDB, SQS, etc.)
- Actual OpenAI API calls (mocked)
- Network requests
- Lambda handler invocation
- Infrastructure configuration

For integration testing, you would need:
- AWS credentials configured
- LocalStack or actual AWS resources
- Mock AWS services
- End-to-end test framework

## Adding New Tests

To add a new test:

1. Create a new file: `test-<component>.js`
2. Use the same test structure:
   ```javascript
   let testsPassed = 0;
   let testsFailed = 0;
   
   function test(name, fn) { ... }
   function assert(condition, message) { ... }
   
   // Your tests here
   
   // Summary at the end
   ```
3. Add to `run-all-tests.sh` if needed

## Example Output

```
🧪 Testing categoryManager.js

✅ PREDEFINED_CATEGORIES should be an array
✅ extractUserDefinedCategories should return empty array for empty input
✅ extractUserDefinedCategories should extract user-defined categories
...

📊 Test Results:
   ✅ Passed: 13
   ❌ Failed: 0
   📈 Total: 13

🎉 All tests passed!
```
