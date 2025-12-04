/**
 * Expense Categorization Service
 * Uses OpenAI SDK to categorize expenses via AI
 */

const OpenAI = require('openai');
const { validateCategory } = require('./categoryManager');

// Module-level constants (matching existing code style)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';
const OPENAI_TEMPERATURE = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.3;
const OPENAI_MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS) || 200;
const OPENAI_RETRY_ATTEMPTS = parseInt(process.env.OPENAI_RETRY_ATTEMPTS) || 3;

// Initialize OpenAI client (module-level, matching existing pattern)
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

/**
 * Build system prompt with constraints and available categories
 * @param {string[]} availableCategories - List of available categories
 * @returns {string} - System prompt
 */
function buildSystemPrompt(availableCategories) {
  const categoriesList = availableCategories.map(cat => `- ${cat}`).join('\n');
  
  return `You are an expense categorization assistant. Your task is to categorize expenses based on their description, amount, and date.

CONSTRAINTS:
1. You MUST select a category from the provided list of available categories
2. You MUST return ONLY valid JSON in the following format:
   {
     "category": "Category Name",
     "confidence": 0.95,
     "reasoning": "Brief explanation"
   }
3. The category name MUST exactly match one of the available categories (case-sensitive)
4. Confidence must be a number between 0 and 1
5. Reasoning should be a brief explanation (max 50 words)
6. Do NOT include any text outside the JSON object
7. Do NOT use markdown formatting
8. Do NOT add comments or explanations

AVAILABLE CATEGORIES:
${categoriesList}

PROBLEM STATEMENT:
Given an expense with description, amount, and timestamp, determine the most appropriate category from the available list. Consider:
- The nature of the expense (what was purchased/service used)
- The amount (may indicate type of expense)
- The context (date/time may provide clues)

If the expense doesn't clearly fit any category, choose the closest match or "Other" if truly unclassifiable.

RESPONSE FORMAT:
Return ONLY valid JSON. No additional text, no markdown, no explanations outside the JSON.`;
}

/**
 * Build user prompt for a single expense
 * @param {Object} expense - Expense object with summary, amount, timestamp
 * @returns {string} - User prompt
 */
function buildUserPrompt(expense) {
  return `Categorize this expense:
- Description: ${expense.summary || 'N/A'}
- Amount: $${expense.amount || 0}
- Date: ${expense.timestamp || 'N/A'}

Return JSON with category, confidence, and reasoning.`;
}

/**
 * Call OpenAI API with retry logic
 * @param {Array} messages - Array of message objects for chat completion
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - OpenAI completion response
 */
async function callOpenAIAPI(messages, options = {}) {
  const maxRetries = options.retryAttempts || OPENAI_RETRY_ATTEMPTS;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: messages,
        temperature: OPENAI_TEMPERATURE,
        max_tokens: OPENAI_MAX_TOKENS,
        response_format: { type: 'json_object' }, // Force JSON response
      });
      
      return completion;
    } catch (error) {
      lastError = error;
      console.error(`OpenAI API error (attempt ${attempt}/${maxRetries})`, {
        error: error.message,
        statusCode: error.status || error.statusCode,
        code: error.code,
      });
      
      // If rate limited, wait before retrying
      if (error.status === 429 || error.statusCode === 429) {
        const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff, max 10s
        console.log(`Rate limited, waiting ${waitTime}ms before retry`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      } else if (attempt < maxRetries) {
        // For other errors, wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  throw lastError || new Error('OpenAI API call failed after retries');
}

/**
 * Parse category response from OpenAI
 * @param {Object} completion - OpenAI completion response
 * @param {string[]} availableCategories - List of available categories
 * @returns {{category: string, confidence: number, reasoning: string}} - Parsed result
 */
function parseCategoryResponse(completion, availableCategories) {
  try {
    // OpenAI returns content in choices[0].message.content
    const content = completion.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('Invalid response: missing content in completion');
    }
    
    // Parse JSON from content string
    const parsed = JSON.parse(content);
    
    // Validate structure
    if (!parsed.category || typeof parsed.category !== 'string') {
      throw new Error('Invalid response: missing or invalid category field');
    }
    
    // Validate category is in available list
    const validatedCategory = validateCategory(parsed.category, availableCategories);
    if (!validatedCategory) {
      // If category not found, use "Other" as fallback
      console.warn('AI returned invalid category, using "Other"', {
        returnedCategory: parsed.category,
        availableCategories: availableCategories.slice(0, 5), // Log first 5
      });
      return {
        category: 'Other',
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || `Original suggestion "${parsed.category}" was not in available categories`,
      };
    }
    
    return {
      category: validatedCategory,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
      reasoning: parsed.reasoning || '',
    };
  } catch (error) {
    console.error('Error parsing category response', {
      error: error.message,
      content: completion.choices?.[0]?.message?.content,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Categorize a batch of expenses (up to 100)
 * @param {Array<Object>} expenses - Array of expenses to categorize
 * @param {string[]} availableCategories - All available categories (pre-defined + user-defined)
 * @returns {Promise<{successful: number, failed: number, results: Array}>}
 */
async function categorizeBatch(expenses, availableCategories) {
  if (!expenses || !Array.isArray(expenses) || expenses.length === 0) {
    return {
      successful: 0,
      failed: 0,
      results: [],
    };
  }
  
  if (expenses.length > 100) {
    throw new Error(`Batch size too large: ${expenses.length}. Maximum is 100.`);
  }
  
  if (!availableCategories || availableCategories.length === 0) {
    throw new Error('No available categories provided');
  }
  
  // Build system prompt once for the batch
  const systemPrompt = buildSystemPrompt(availableCategories);
  
  // Process all expenses in parallel (OpenAI can handle multiple requests)
  const results = await Promise.allSettled(
    expenses.map(async (expense) => {
      try {
        const userPrompt = buildUserPrompt(expense);
        
        const messages = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ];
        
        const completion = await callOpenAIAPI(messages);
        const parsed = parseCategoryResponse(completion, availableCategories);
        
        return {
          expenseId: expense.id,
          success: true,
          suggestedCategory: parsed.category,
          confidence: parsed.confidence,
          reasoning: parsed.reasoning,
        };
      } catch (error) {
        console.error('Error categorizing expense', {
          expenseId: expense.id,
          error: error.message,
        });
        
        return {
          expenseId: expense.id,
          success: false,
          error: error.message,
        };
      }
    })
  );
  
  // Process results
  const processedResults = results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        expenseId: expenses[index]?.id || 'unknown',
        success: false,
        error: result.reason?.message || 'Unknown error',
      };
    }
  });
  
  const successful = processedResults.filter(r => r.success).length;
  const failed = processedResults.filter(r => !r.success).length;
  
  return {
    successful,
    failed,
    results: processedResults,
  };
}

module.exports = {
  categorizeBatch,
};
