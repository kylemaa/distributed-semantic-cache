/**
 * Integration tests for embedding cache in EmbeddingsService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmbeddingsService } from '../src/embeddings.js';

// Mock OpenAI to avoid real API calls
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      embeddings: {
        create: vi.fn().mockImplementation(({ input }) => {
          // Generate deterministic embeddings based on input
          const text = Array.isArray(input) ? input[0] : input;
          const hash = text.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);
          const embedding = Array(384).fill(0).map((_, i) => Math.sin(hash + i) * 0.5);
          
          return Promise.resolve({
            data: [{ embedding }],
          });
        }),
      },
    })),
  };
});

describe('EmbeddingsService with LRU Cache', () => {
  let embeddingsService: EmbeddingsService;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.EMBEDDING_CACHE_SIZE = '5'; // Small cache for testing
    embeddingsService = new EmbeddingsService(5);
  });

  describe('caching behavior', () => {
    it('should cache embeddings for repeated queries', async () => {
      const text = 'What is machine learning?';
      
      // First call - should generate
      const embedding1 = await embeddingsService.generateEmbedding(text);
      const stats1 = embeddingsService.getCacheStats();
      
      expect(embedding1).toBeDefined();
      expect(embedding1.length).toBeGreaterThan(0);
      expect(stats1.misses).toBe(1);
      expect(stats1.hits).toBe(0);

      // Second call - should hit cache
      const embedding2 = await embeddingsService.generateEmbedding(text);
      const stats2 = embeddingsService.getCacheStats();
      
      expect(embedding2).toEqual(embedding1);
      expect(stats2.misses).toBe(1);
      expect(stats2.hits).toBe(1);
      expect(stats2.hitRate).toBe(0.5);
    });

    it('should cache multiple different queries', async () => {
      const queries = [
        'What is AI?',
        'What is ML?',
        'What is NLP?',
      ];

      // Generate embeddings
      const embeddings = await Promise.all(
        queries.map(q => embeddingsService.generateEmbedding(q))
      );

      expect(embeddings).toHaveLength(3);
      
      const stats = embeddingsService.getCacheStats();
      expect(stats.size).toBe(3);
      expect(stats.misses).toBe(3);

      // Re-query first one
      const cachedEmbedding = await embeddingsService.generateEmbedding(queries[0]);
      const stats2 = embeddingsService.getCacheStats();
      
      expect(cachedEmbedding).toEqual(embeddings[0]);
      expect(stats2.hits).toBe(1);
    });

    it('should improve hit rate with repeated access', async () => {
      const text = 'test query';

      // Access multiple times
      for (let i = 0; i < 10; i++) {
        await embeddingsService.generateEmbedding(text);
      }

      const stats = embeddingsService.getCacheStats();
      expect(stats.hits).toBe(9); // 1 miss + 9 hits
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.9);
    });
  });

  describe('cache eviction', () => {
    it('should evict least recently used when at capacity', async () => {
      // Fill cache to capacity (5 items)
      const queries = ['q1', 'q2', 'q3', 'q4', 'q5'];
      for (const q of queries) {
        await embeddingsService.generateEmbedding(q);
      }

      let stats = embeddingsService.getCacheStats();
      expect(stats.size).toBe(5);
      expect(stats.capacity).toBe(5);

      // Add 6th item, should evict 'q1'
      await embeddingsService.generateEmbedding('q6');
      
      stats = embeddingsService.getCacheStats();
      expect(stats.size).toBe(5); // Still at capacity

      // Re-accessing 'q1' should be a miss (was evicted)
      await embeddingsService.generateEmbedding('q1');
      
      stats = embeddingsService.getCacheStats();
      expect(stats.misses).toBe(7); // 6 original + 1 for evicted q1
    });

    it('should maintain most recently used items', async () => {
      // Fill cache
      await embeddingsService.generateEmbedding('q1');
      await embeddingsService.generateEmbedding('q2');
      await embeddingsService.generateEmbedding('q3');
      await embeddingsService.generateEmbedding('q4');
      await embeddingsService.generateEmbedding('q5');

      // Access q1 again (make it recently used)
      await embeddingsService.generateEmbedding('q1');

      // Add new item, should evict q2 (least recently used)
      await embeddingsService.generateEmbedding('q6');

      // q1 should still be cached (hit)
      const initialMisses = embeddingsService.getCacheStats().misses;
      await embeddingsService.generateEmbedding('q1');
      const finalMisses = embeddingsService.getCacheStats().misses;
      
      expect(finalMisses).toBe(initialMisses); // No new miss
    });
  });

  describe('cache management', () => {
    it('should clear all cached embeddings', async () => {
      await embeddingsService.generateEmbedding('q1');
      await embeddingsService.generateEmbedding('q2');
      await embeddingsService.generateEmbedding('q3');

      let stats = embeddingsService.getCacheStats();
      expect(stats.size).toBe(3);

      embeddingsService.clearCache();

      stats = embeddingsService.getCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });

    it('should regenerate embeddings after clear', async () => {
      const text = 'test query';
      const embedding1 = await embeddingsService.generateEmbedding(text);

      embeddingsService.clearCache();

      // Should be a miss now
      const embedding2 = await embeddingsService.generateEmbedding(text);
      const stats = embeddingsService.getCacheStats();

      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
      expect(embedding2).toEqual(embedding1); // Same embedding, but regenerated
    });
  });

  describe('cache statistics', () => {
    it('should return comprehensive cache stats', async () => {
      await embeddingsService.generateEmbedding('q1');
      await embeddingsService.generateEmbedding('q2');
      await embeddingsService.generateEmbedding('q1'); // hit

      const stats = embeddingsService.getCacheStats();

      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('capacity');
      expect(stats).toHaveProperty('hitRate');
      
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(2);
      expect(stats.size).toBe(2);
      expect(stats.capacity).toBe(5);
      expect(stats.hitRate).toBeCloseTo(0.333, 2);
    });

    it('should track statistics across multiple operations', async () => {
      const queries = ['a', 'b', 'c'];

      // Generate each query twice
      for (const q of queries) {
        await embeddingsService.generateEmbedding(q);
        await embeddingsService.generateEmbedding(q);
      }

      const stats = embeddingsService.getCacheStats();
      expect(stats.hits).toBe(3); // One hit per query
      expect(stats.misses).toBe(3); // One miss per query
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe('performance validation', () => {
    it('should reduce API calls through caching', async () => {
      const text = 'repeated query';
      const iterations = 100;

      // First call generates, rest are cached
      for (let i = 0; i < iterations; i++) {
        await embeddingsService.generateEmbedding(text);
      }

      const stats = embeddingsService.getCacheStats();
      
      // Should have 1 miss (initial) and 99 hits
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(iterations - 1);
      expect(stats.hitRate).toBeCloseTo(0.99, 2);
    });

    it('should handle mixed access patterns efficiently', async () => {
      // Create diverse queries
      const commonQueries = ['common1', 'common2', 'common3'];
      const rareQueries = Array.from({ length: 20 }, (_, i) => `rare${i}`);

      // Access common queries frequently
      for (let i = 0; i < 10; i++) {
        for (const q of commonQueries) {
          await embeddingsService.generateEmbedding(q);
        }
      }

      // Access rare queries once
      for (const q of rareQueries) {
        await embeddingsService.generateEmbedding(q);
      }

      const stats = embeddingsService.getCacheStats();
      
      // Common queries should have high hit rate
      // 3 initial misses + 27 hits (9 repeats × 3 queries)
      // + 20 misses for rare queries = 23 misses, 27 hits
      expect(stats.hitRate).toBeGreaterThan(0.5);
    });
  });
});
