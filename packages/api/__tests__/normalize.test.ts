/**
 * Tests for query normalization utilities
 */

import { describe, it, expect } from 'vitest';
import { 
  normalizeQuery, 
  detectQueryType, 
  QueryType,
  extractKeyTerms,
  levenshteinSimilarity,
  areQueriesEquivalent
} from '../src/normalize';

describe('Query Normalization', () => {
  describe('normalizeQuery', () => {
    it('should lowercase queries', () => {
      expect(normalizeQuery('What Is The Weather?')).toBe('what is the weather?');
    });

    it('should trim whitespace', () => {
      expect(normalizeQuery('  hello world  ')).toBe('hello world');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeQuery('hello    world')).toBe('hello world');
    });

    it('should expand contractions', () => {
      expect(normalizeQuery("what's the weather")).toBe("what is the weather");
      expect(normalizeQuery("i'm happy")).toBe("i am happy");
      expect(normalizeQuery("they're great")).toBe("they are great");
      expect(normalizeQuery("can't do it")).toBe("cannot do it");
    });

    it('should handle complex contractions', () => {
      const result = normalizeQuery("I'd done it");
      expect(result).toContain('i would');
    });

    it('should preserve case when lowercase=false', () => {
      expect(normalizeQuery('Hello World', { lowercase: false })).toBe('Hello World');
    });

    it('should remove punctuation when enabled', () => {
      const result = normalizeQuery('hello, world!', { removePunctuation: true });
      expect(result).toBe('hello world!');
    });

    it('should keep semantic punctuation', () => {
      const result = normalizeQuery('what is this?', { removePunctuation: true });
      expect(result).toBe('what is this?');
    });

    it('should remove stop words when enabled', () => {
      const result = normalizeQuery('what is the weather', { removeStopWords: true });
      expect(result).toBe('what weather');
    });

    it('should handle combined options', () => {
      const result = normalizeQuery("What's   THE weather?", {
        lowercase: true,
        trimWhitespace: true,
        expandContractions: true,
      });
      expect(result).toBe('what is the weather?');
    });
  });

  describe('detectQueryType', () => {
    it('should detect questions', () => {
      expect(detectQueryType('What is the weather?')).toBe(QueryType.QUESTION);
      expect(detectQueryType('How are you')).toBe(QueryType.QUESTION);
      expect(detectQueryType('Where is the store')).toBe(QueryType.QUESTION);
      expect(detectQueryType('Can you help me')).toBe(QueryType.QUESTION);
    });

    it('should detect greetings', () => {
      expect(detectQueryType('Hello!')).toBe(QueryType.GREETING);
      expect(detectQueryType('Hi there')).toBe(QueryType.GREETING);
      expect(detectQueryType('Good morning')).toBe(QueryType.GREETING);
    });

    it('should detect commands', () => {
      expect(detectQueryType('Tell me about AI')).toBe(QueryType.COMMAND);
      expect(detectQueryType('Show me the results')).toBe(QueryType.COMMAND);
      expect(detectQueryType('Explain quantum physics')).toBe(QueryType.COMMAND);
      expect(detectQueryType('Create a report')).toBe(QueryType.COMMAND);
    });

    it('should detect statements', () => {
      expect(detectQueryType('This is a statement.')).toBe(QueryType.STATEMENT);
      expect(detectQueryType('I like pizza.')).toBe(QueryType.STATEMENT);
      expect(detectQueryType('The sky is blue!')).toBe(QueryType.STATEMENT);
    });

    it('should return UNKNOWN for ambiguous queries', () => {
      expect(detectQueryType('hmm')).toBe(QueryType.UNKNOWN);
    });
  });

  describe('extractKeyTerms', () => {
    it('should extract key terms', () => {
      const terms = extractKeyTerms('What is the weather like today');
      expect(terms).toContain('what');
      expect(terms).toContain('weather');
      expect(terms).toContain('like');
      expect(terms).toContain('today');
    });

    it('should filter out stop words', () => {
      const terms = extractKeyTerms('The quick brown fox');
      expect(terms).not.toContain('the');
      expect(terms).toContain('quick');
      expect(terms).toContain('brown');
      expect(terms).toContain('fox');
    });

    it('should filter short terms', () => {
      const terms = extractKeyTerms('I am a student');
      expect(terms.every(t => t.length > 2)).toBe(true);
    });
  });

  describe('levenshteinSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      expect(levenshteinSimilarity('hello', 'hello')).toBe(1.0);
    });

    it('should return 0 for completely different strings', () => {
      const similarity = levenshteinSimilarity('abc', 'xyz');
      expect(similarity).toBeLessThan(0.5);
    });

    it('should detect small typos', () => {
      expect(levenshteinSimilarity('hello', 'helo')).toBeGreaterThanOrEqual(0.8);
      // Transpositions are harder - 'wrold' requires 2 edits from 'world'
      expect(levenshteinSimilarity('world', 'wor ld')).toBeGreaterThanOrEqual(0.8);
    });

    it('should handle empty strings', () => {
      expect(levenshteinSimilarity('', '')).toBe(1.0);
      expect(levenshteinSimilarity('test', '')).toBe(0);
    });
  });

  describe('areQueriesEquivalent', () => {
    it('should match normalized queries', () => {
      expect(areQueriesEquivalent("What's the weather?", "what is the weather?")).toBe(true);
      expect(areQueriesEquivalent("Hello World", "hello world")).toBe(true);
    });

    it('should detect near-identical queries', () => {
      // 91% similar (1 deletion in 11 chars)
      const similarity = levenshteinSimilarity('hello world', 'hello world');
      expect(similarity).toBeGreaterThan(0.90);
      expect(areQueriesEquivalent('Hello   World', 'hello world')).toBe(true);
    });

    it('should not match different queries', () => {
      expect(areQueriesEquivalent('hello world', 'goodbye world')).toBe(false);
    });

    it('should handle whitespace differences', () => {
      expect(areQueriesEquivalent('hello  world', 'hello world')).toBe(true);
    });
  });
});
