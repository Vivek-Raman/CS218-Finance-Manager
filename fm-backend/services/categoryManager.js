/**
 * Category Management Service
 * Manages pre-defined and user-defined expense categories
 */

const PREDEFINED_CATEGORIES = [
  'Food & Dining',
  'Transportation',
  'Shopping',
  'Bills & Utilities',
  'Entertainment',
  'Healthcare',
  'Travel',
  'Education',
  'Personal Care',
  'Other'
];

/**
 * Extract user-defined categories from their expenses
 * @param {Array} expenses - User's categorized expenses
 * @returns {string[]} - Array of user-defined category names
 */
function extractUserDefinedCategories(expenses) {
  if (!expenses || !Array.isArray(expenses)) {
    return [];
  }
  
  // Extract unique categories from expenses that have a category field
  const userCategories = new Set();
  
  for (const expense of expenses) {
    if (expense.category && typeof expense.category === 'string' && expense.category.trim() !== '') {
      const category = expense.category.trim();
      // Only include categories that are not in predefined list
      if (!PREDEFINED_CATEGORIES.includes(category)) {
        userCategories.add(category);
      }
    }
  }
  
  return Array.from(userCategories).sort();
}

/**
 * Get all available categories for a user (pre-defined + user-defined)
 * @param {string} userId - User ID
 * @param {Array} userExpenses - User's categorized expenses (optional, for extracting user-defined)
 * @returns {{predefined: string[], userDefined: string[], all: string[]}}
 */
function getUserCategories(userId, userExpenses = null) {
  const predefined = [...PREDEFINED_CATEGORIES];
  
  let userDefined = [];
  if (userExpenses && Array.isArray(userExpenses)) {
    userDefined = extractUserDefinedCategories(userExpenses);
  }
  
  // Combine and deduplicate
  const allCategories = [...predefined, ...userDefined];
  
  return {
    predefined,
    userDefined,
    all: allCategories,
  };
}

/**
 * Validate if a category is in the available categories list
 * @param {string} category - Category to validate
 * @param {string[]} availableCategories - List of available categories
 * @returns {string|null} - Validated category or null if invalid
 */
function validateCategory(category, availableCategories) {
  if (!category || typeof category !== 'string') {
    return null;
  }
  
  const trimmed = category.trim();
  if (availableCategories.includes(trimmed)) {
    return trimmed;
  }
  
  // Case-insensitive match as fallback
  const lowerTrimmed = trimmed.toLowerCase();
  const match = availableCategories.find(cat => cat.toLowerCase() === lowerTrimmed);
  if (match) {
    return match;
  }
  
  return null;
}

module.exports = {
  PREDEFINED_CATEGORIES,
  getUserCategories,
  extractUserDefinedCategories,
  validateCategory,
};
