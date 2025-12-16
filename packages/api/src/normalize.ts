/**
 * Query normalization utilities for smart matching
 */

interface NormalizationOptions {
  lowercase?: boolean;
  trimWhitespace?: boolean;
  removePunctuation?: boolean;
  expandContractions?: boolean;
  removeStopWords?: boolean;
}

const DEFAULT_OPTIONS: NormalizationOptions = {
  lowercase: true,
  trimWhitespace: true,
  removePunctuation: false,
  expandContractions: true,
  removeStopWords: false,
};

// Common English contractions
const CONTRACTIONS: Record<string, string> = {
  "what's": "what is",
  "that's": "that is",
  "there's": "there is",
  "here's": "here is",
  "it's": "it is",
  "he's": "he is",
  "she's": "she is",
  "who's": "who is",
  "where's": "where is",
  "when's": "when is",
  "why's": "why is",
  "how's": "how is",
  "i'm": "i am",
  "you're": "you are",
  "we're": "we are",
  "they're": "they are",
  "i've": "i have",
  "you've": "you have",
  "we've": "we have",
  "they've": "they have",
  "i'll": "i will",
  "you'll": "you will",
  "he'll": "he will",
  "she'll": "she will",
  "we'll": "we will",
  "they'll": "they will",
  "i'd": "i would",
  "you'd": "you would",
  "he'd": "he would",
  "she'd": "she would",
  "we'd": "we would",
  "they'd": "they would",
  "isn't": "is not",
  "aren't": "are not",
  "wasn't": "was not",
  "weren't": "were not",
  "hasn't": "has not",
  "haven't": "have not",
  "hadn't": "had not",
  "doesn't": "does not",
  "don't": "do not",
  "didn't": "did not",
  "won't": "will not",
  "wouldn't": "would not",
  "shouldn't": "should not",
  "couldn't": "could not",
  "can't": "cannot",
  "mustn't": "must not",
  "let's": "let us",
};

// Common English stop words (optional aggressive filtering)
const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
  'to', 'was', 'will', 'with', 'the', 'this', 'but', 'they', 'have',
]);

/**
 * Normalize a query string for better semantic matching
 */
export function normalizeQuery(query: string, options: NormalizationOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let normalized = query;

  // Trim whitespace
  if (opts.trimWhitespace) {
    normalized = normalized.trim();
    // Collapse multiple spaces into one
    normalized = normalized.replace(/\s+/g, ' ');
  }

  // Lowercase
  if (opts.lowercase) {
    normalized = normalized.toLowerCase();
  }

  // Expand contractions (do this before lowercasing if needed)
  if (opts.expandContractions) {
    // Match contractions with word boundaries
    for (const [contraction, expansion] of Object.entries(CONTRACTIONS)) {
      const regex = new RegExp(`\\b${contraction}\\b`, 'gi');
      normalized = normalized.replace(regex, expansion);
    }
  }

  // Remove punctuation (except for semantic meaning like ? !)
  if (opts.removePunctuation) {
    // Keep question marks and exclamation points for sentiment
    normalized = normalized.replace(/[^\w\s?!']/g, '');
  }

  // Remove stop words (aggressive - use carefully)
  if (opts.removeStopWords) {
    const words = normalized.split(/\s+/);
    normalized = words.filter(word => !STOP_WORDS.has(word.toLowerCase())).join(' ');
  }

  return normalized.trim();
}

/**
 * Detect query type/category for adaptive threshold adjustment
 */
export enum QueryType {
  QUESTION = 'question',
  STATEMENT = 'statement',
  COMMAND = 'command',
  GREETING = 'greeting',
  UNKNOWN = 'unknown',
}

export function detectQueryType(query: string): QueryType {
  const normalized = query.toLowerCase().trim();
  
  // Question patterns
  if (normalized.includes('?') || 
      /^(what|when|where|who|why|how|is|are|can|could|would|should|do|does|did)\b/.test(normalized)) {
    return QueryType.QUESTION;
  }
  
  // Greeting patterns
  if (/^(hello|hi|hey|greetings|good morning|good afternoon|good evening)\b/.test(normalized)) {
    return QueryType.GREETING;
  }
  
  // Command patterns (imperative verbs)
  if (/^(tell|show|explain|describe|list|give|provide|find|search|get|create|make)\b/.test(normalized)) {
    return QueryType.COMMAND;
  }
  
  // Statement (declarative)
  if (/[.!]$/.test(normalized) || /^(i |we |the |this |that )/i.test(query)) {
    return QueryType.STATEMENT;
  }
  
  return QueryType.UNKNOWN;
}

/**
 * Extract key terms from a query for pattern matching
 */
export function extractKeyTerms(query: string): string[] {
  const normalized = normalizeQuery(query, { removeStopWords: true, removePunctuation: true });
  return normalized.split(/\s+/).filter(term => term.length > 2);
}

/**
 * Calculate text similarity using Levenshtein distance (for exact/near-exact matching)
 */
export function levenshteinSimilarity(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  
  if (len1 === 0) return len2 === 0 ? 1 : 0;
  if (len2 === 0) return 0;
  
  // Create distance matrix
  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  // Round to avoid floating point precision issues
  return Math.round((1 - (distance / maxLen)) * 1000) / 1000;
}

/**
 * Check if two queries are semantically equivalent (after normalization)
 */
export function areQueriesEquivalent(query1: string, query2: string): boolean {
  const norm1 = normalizeQuery(query1);
  const norm2 = normalizeQuery(query2);
  
  // Exact match after normalization
  if (norm1 === norm2) return true;
  
  // Very high Levenshtein similarity (typos, minor variations)
  const similarity =  0.90; // Slightly more lenientteinSimilarity(norm1, norm2);
  return similarity >= 0.95;
}
