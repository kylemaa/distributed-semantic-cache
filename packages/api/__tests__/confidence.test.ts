/**
 * Tests for confidence scoring system
 */

import { describe, it, expect } from 'vitest';
import { 
  calculateConfidence,
  CacheLayer,
  ConfidenceLevel,
  shouldUseCache,
  getRecommendedThreshold
} from '../src/confidence';

describe('Confidence Scoring', () => {
  describe('calculateConfidence', () => {
    it('should return maximum confidence for exact matches', () => {
      const confidence = calculateConfidence(1.0, CacheLayer.EXACT_MATCH, 20);
      expect(confidence.score).toBe(1.0);
      expect(confidence.level).toBe(ConfidenceLevel.VERY_HIGH);
      expect(confidence.layer).toBe(CacheLayer.EXACT_MATCH);
    });

    it('should boost normalized matches', () => {
      const confidence = calculateConfidence(0.95, CacheLayer.NORMALIZED_MATCH, 20);
      expect(confidence.score).toBeGreaterThanOrEqual(0.95);
      expect(confidence.level).toBe(ConfidenceLevel.VERY_HIGH);
    });

    it('should apply complexity penalty for long queries', () => {
      const shortQuery = calculateConfidence(0.90, CacheLayer.SEMANTIC_MATCH, 20);
      const longQuery = calculateConfidence(0.90, CacheLayer.SEMANTIC_MATCH, 100);
      expect(longQuery.score).toBeLessThan(shortQuery.score);
    });

    it('should apply age penalty', () => {
      const recent = calculateConfidence(0.90, CacheLayer.SEMANTIC_MATCH, 20, 1);
      const old = calculateConfidence(0.90, CacheLayer.SEMANTIC_MATCH, 20, 720); // 30 days
      expect(old.score).toBeLessThan(recent.score);
    });

    it('should apply frequency boost', () => {
      const unpopular = calculateConfidence(0.85, CacheLayer.SEMANTIC_MATCH, 20, undefined, 5);
      const popular = calculateConfidence(0.85, CacheLayer.SEMANTIC_MATCH, 20, undefined, 100);
      expect(popular.score).toBeGreaterThan(unpopular.score);
    });

    it('should include all factors in response', () => {
      const confidence = calculateConfidence(0.88, CacheLayer.SEMANTIC_MATCH, 25, 12, 50);
      expect(confidence.factors).toHaveProperty('similarityScore');
      expect(confidence.factors).toHaveProperty('cacheLayer');
      expect(confidence.factors).toHaveProperty('queryComplexity');
      expect(confidence.factors).toHaveProperty('cacheAge');
      expect(confidence.factors).toHaveProperty('hitFrequency');
    });

    it('should generate helpful explanation', () => {
      const confidence = calculateConfidence(0.92, CacheLayer.SEMANTIC_MATCH, 20, 2);
      expect(confidence.explanation).toContain('Semantic match');
      expect(confidence.explanation).toContain('recent');
    });
  });

  describe('confidence levels', () => {
    it('should classify VERY_HIGH correctly', () => {
      const confidence = calculateConfidence(0.96, CacheLayer.SEMANTIC_MATCH, 20);
      expect(confidence.level).toBe(ConfidenceLevel.VERY_HIGH);
    });

    it('should classify HIGH correctly', () => {
      const confidence = calculateConfidence(0.88, CacheLayer.SEMANTIC_MATCH, 20);
      expect(confidence.level).toBe(ConfidenceLevel.HIGH);
    });

    it('should classify MEDIUM correctly', () => {
      const confidence = calculateConfidence(0.75, CacheLayer.SEMANTIC_MATCH, 20);
      expect(confidence.level).toBe(ConfidenceLevel.MEDIUM);
    });

    it('should classify LOW correctly', () => {
      const confidence = calculateConfidence(0.60, CacheLayer.SEMANTIC_MATCH, 20);
      expect(confidence.level).toBe(ConfidenceLevel.LOW);
    });

    it('should classify VERY_LOW correctly', () => {
      const confidence = calculateConfidence(0.40, CacheLayer.SEMANTIC_MATCH, 20);
      expect(confidence.level).toBe(ConfidenceLevel.VERY_LOW);
    });
  });

  describe('shouldUseCache', () => {
    it('should accept high confidence matches', () => {
      const confidence = calculateConfidence(0.95, CacheLayer.SEMANTIC_MATCH, 20);
      expect(shouldUseCache(confidence)).toBe(true);
    });

    it('should reject low confidence matches', () => {
      const confidence = calculateConfidence(0.70, CacheLayer.SEMANTIC_MATCH, 20);
      expect(shouldUseCache(confidence)).toBe(false);
    });

    it('should respect custom threshold', () => {
      const confidence = calculateConfidence(0.75, CacheLayer.SEMANTIC_MATCH, 20);
      expect(shouldUseCache(confidence, 0.70)).toBe(true);
      expect(shouldUseCache(confidence, 0.80)).toBe(false);
    });
  });

  describe('getRecommendedThreshold', () => {
    it('should recommend higher threshold for short queries', () => {
      const shortThreshold = getRecommendedThreshold(5);
      const normalThreshold = getRecommendedThreshold(25);
      expect(shortThreshold).toBeGreaterThan(normalThreshold);
    });

    it('should recommend lower threshold for long queries', () => {
      const normalThreshold = getRecommendedThreshold(25);
      const longThreshold = getRecommendedThreshold(75);
      expect(longThreshold).toBeLessThan(normalThreshold);
    });

    it('should adjust for query type', () => {
      const questionThreshold = getRecommendedThreshold(20, 'question');
      const commandThreshold = getRecommendedThreshold(20, 'command');
      expect(questionThreshold).toBeGreaterThan(commandThreshold);
    });

    it('should stay within reasonable bounds', () => {
      const threshold = getRecommendedThreshold(10, 'question');
      expect(threshold).toBeGreaterThanOrEqual(0.75);
      expect(threshold).toBeLessThanOrEqual(0.95);
    });
  });
});
