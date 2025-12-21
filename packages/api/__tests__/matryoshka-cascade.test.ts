/**
 * Tests for Matryoshka Cascade Search
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MatryoshkaCascade, createMatryoshkaCascade } from '../src/matryoshka-cascade.js';

describe('MatryoshkaCascade', () => {
  let cascade: MatryoshkaCascade;

  // Helper to generate random normalized vectors
  function randomVector(dims: number): number[] {
    const vec = Array.from({ length: dims }, () => Math.random() - 0.5);
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map(v => v / norm);
  }

  // Helper to generate similar vectors
  function similarVector(base: number[], noise: number = 0.1): number[] {
    const vec = base.map(v => v + (Math.random() - 0.5) * noise);
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map(v => v / norm);
  }

  beforeEach(() => {
    cascade = new MatryoshkaCascade({
      filterDimensions: 64,
      fullDimensions: 256,
      filterTopK: 20,
      normalizeAfterTruncation: true,
    });
  });

  describe('truncation', () => {
    it('should truncate to specified dimensions', () => {
      const vec = randomVector(256);
      const truncated = cascade.truncate(vec, 64);
      
      expect(truncated.length).toBe(64);
    });

    it('should normalize after truncation', () => {
      const vec = randomVector(256);
      const truncated = cascade.truncate(vec, 64);
      
      // Check L2 norm is approximately 1
      const norm = Math.sqrt(truncated.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it('should handle vectors smaller than target dimensions', () => {
      const vec = randomVector(32);
      const truncated = cascade.truncate(vec, 64);
      
      expect(truncated.length).toBe(32);
    });

    it('should not modify original vector', () => {
      const original = randomVector(256);
      const copy = [...original];
      cascade.truncate(original, 64);
      
      expect(original).toEqual(copy);
    });
  });

  describe('cascade search', () => {
    it('should find exact match', () => {
      const query = randomVector(256);
      const candidates = [
        { id: 'exact', embedding: query },
        ...Array.from({ length: 50 }, (_, i) => ({
          id: `random-${i}`,
          embedding: randomVector(256),
        })),
      ];

      const { results } = cascade.search(query, candidates, 10, 0.9);
      
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].id).toBe('exact');
      expect(results[0].similarity).toBeCloseTo(1.0, 5);
    });

    it('should find similar vectors', () => {
      const query = randomVector(256);
      const similar = similarVector(query, 0.1);
      
      const candidates = [
        { id: 'similar', embedding: similar },
        ...Array.from({ length: 50 }, (_, i) => ({
          id: `random-${i}`,
          embedding: randomVector(256),
        })),
      ];

      const { results } = cascade.search(query, candidates, 10, 0.8);
      
      const similarResult = results.find(r => r.id === 'similar');
      expect(similarResult).toBeDefined();
      expect(similarResult!.similarity).toBeGreaterThan(0.85);
    });

    it('should respect threshold', () => {
      const query = randomVector(256);
      const candidates = Array.from({ length: 100 }, (_, i) => ({
        id: `random-${i}`,
        embedding: randomVector(256),
      }));

      const { results } = cascade.search(query, candidates, 50, 0.99);
      
      // Very few random vectors should have 0.99 similarity
      expect(results.length).toBeLessThan(5);
      results.forEach(r => {
        expect(r.similarity).toBeGreaterThanOrEqual(0.99);
      });
    });

    it('should provide cascade stats', () => {
      const query = randomVector(256);
      const candidates = Array.from({ length: 100 }, (_, i) => ({
        id: `vec-${i}`,
        embedding: randomVector(256),
      }));

      const { stats } = cascade.search(query, candidates, 10, 0.5);
      
      expect(stats.totalCandidates).toBe(100);
      expect(stats.filteredCandidates).toBeLessThanOrEqual(20); // filterTopK
      expect(stats.filterTimeMs).toBeGreaterThanOrEqual(0);
      expect(stats.rerankTimeMs).toBeGreaterThanOrEqual(0);
      expect(stats.dimensionReduction).toBeCloseTo(75, 0); // 64/256 = 25% kept
    });

    it('should mark results as reranked', () => {
      const query = randomVector(256);
      const candidates = Array.from({ length: 50 }, (_, i) => ({
        id: `vec-${i}`,
        embedding: randomVector(256),
      }));

      const { results } = cascade.search(query, candidates, 10, 0.1);
      
      results.forEach(r => {
        expect(r.reranked).toBe(true);
        expect(typeof r.filterSimilarity).toBe('number');
      });
    });
  });

  describe('storage calculations', () => {
    it('should calculate storage savings', () => {
      const savings = cascade.calculateStorageSavings(10000);
      
      expect(savings.fullSizeBytes).toBe(10000 * 256 * 4);
      expect(savings.truncatedSizeBytes).toBe(10000 * 64 * 4);
      expect(savings.savingsPercent).toBeCloseTo(75, 0);
      expect(savings.savingsBytes).toBeGreaterThan(0);
    });
  });

  describe('quality analysis', () => {
    it('should analyze quality degradation', () => {
      const query = randomVector(256);
      const candidates = Array.from({ length: 100 }, (_, i) => ({
        id: `vec-${i}`,
        embedding: randomVector(256),
      }));

      // Add some that should match well
      candidates.push({ id: 'similar-1', embedding: similarVector(query, 0.05) });
      candidates.push({ id: 'similar-2', embedding: similarVector(query, 0.1) });

      const analyses = cascade.analyzeQualityDegradation(
        query,
        candidates,
        [32, 64, 128]
      );

      expect(analyses.length).toBe(3);
      
      // More dimensions should have better recall
      const sorted = [...analyses].sort((a, b) => b.dimensions - a.dimensions);
      expect(sorted[0].recall10).toBeGreaterThanOrEqual(sorted[1].recall10 * 0.8);
      
      // Each analysis should have required fields
      analyses.forEach(a => {
        expect(a.dimensions).toBeGreaterThan(0);
        expect(a.recall10).toBeGreaterThanOrEqual(0);
        expect(a.recall10).toBeLessThanOrEqual(1);
        expect(a.speedupFactor).toBeGreaterThan(0);
        expect(a.storageReduction).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('factory function', () => {
    it('should create cascade with fast settings', () => {
      const fastCascade = createMatryoshkaCascade(1536, 'fast');
      const config = fastCascade.getConfig();
      
      expect(config.fullDimensions).toBe(1536);
      expect(config.filterDimensions).toBeLessThan(config.fullDimensions);
      expect(config.filterTopK).toBe(50);
    });

    it('should create cascade with balanced settings', () => {
      const balancedCascade = createMatryoshkaCascade(1536, 'balanced');
      const config = balancedCascade.getConfig();
      
      expect(config.filterTopK).toBe(100);
    });

    it('should create cascade with accurate settings', () => {
      const accurateCascade = createMatryoshkaCascade(1536, 'accurate');
      const config = accurateCascade.getConfig();
      
      expect(config.filterTopK).toBe(200);
    });
  });

  describe('recommended dimensions', () => {
    it('should recommend reasonable dimensions', () => {
      const fast = MatryoshkaCascade.getRecommendedDimensions(1536, 'fast');
      const balanced = MatryoshkaCascade.getRecommendedDimensions(1536, 'balanced');
      const accurate = MatryoshkaCascade.getRecommendedDimensions(1536, 'accurate');

      expect(fast).toBeLessThan(balanced);
      expect(balanced).toBeLessThan(accurate);
      
      // Should be powers of 2
      expect(Math.log2(fast) % 1).toBeCloseTo(0, 5);
      expect(Math.log2(balanced) % 1).toBeCloseTo(0, 5);
      expect(Math.log2(accurate) % 1).toBeCloseTo(0, 5);
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      cascade.setConfig({ filterTopK: 50 });
      const config = cascade.getConfig();
      
      expect(config.filterTopK).toBe(50);
      expect(config.filterDimensions).toBe(64); // unchanged
    });
  });
});
