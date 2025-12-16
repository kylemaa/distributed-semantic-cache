/**
 * Tests for exact match cache functionality in CacheService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SemanticCacheService } from '../src/cache-service.js';
import { EmbeddingsService } from '../src/embeddings.js';
import fs from 'fs';

// Mock the embeddings service to avoid real API calls
vi.mock('../src/embeddings.js', () => {
  function generateMockEmbedding(text: string): number[] {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = Array(384).fill(0);
    
    words.forEach((word, idx) => {
      const wordHash = word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      for (let i = 0; i < 384; i++) {
        embedding[i] += Math.sin(wordHash * (i + 1) + idx) * 0.1;
      }
    });
    
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  return {
    EmbeddingsService: vi.fn().mockImplementation(() => ({
      generateEmbedding: vi.fn().mockImplementation((text: string) => {
        return Promise.resolve(generateMockEmbedding(text));
      }),
      getCacheStats: vi.fn().mockReturnValue({
        hits: 0,
        misses: 0,
        size: 0,
        capacity: 500,
        hitRate: 0,
      }),
      clearCache: vi.fn(),
    })),
  };
});

describe('Exact Match Cache', () => {
  let service: SemanticCacheService;
  const testDbPath = `test-exact-match-${Date.now()}-${Math.random()}.db`;

  beforeEach(() => {
    process.env.DATABASE_PATH = testDbPath;
    process.env.EXACT_MATCH_CACHE_SIZE = '10';
    service = new SemanticCacheService();
  });

  afterEach(() => {
    service.close();
    // Clean up test database
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
    delete process.env.DATABASE_PATH;
    delete process.env.EXACT_MATCH_CACHE_SIZE;
  });

  describe('Exact String Matching', () => {
    it('should return cached response for exact query match', async () => {
      // Store a query-response pair
      await service.store('What is the capital of France?', 'Paris');

      // Query with exact same string
      const result = await service.query({ query: 'What is the capital of France?' });

      expect(result.hit).toBe(true);
      expect(result.response).toBe('Paris');
      expect(result.similarity).toBe(1.0);
      expect(result.cached).toBe(true);
    });

    it('should miss exact cache for slightly different query', async () => {
      await service.store('What is the capital of France?', 'Paris');

      // Query with different string (extra space)
      const result = await service.query({ query: 'What is the capital of France? ' });

      // Should find semantic match, but not exact match (similarity < 1.0)
      expect(result.hit).toBe(true);
      expect(result.similarity).toBeLessThan(1.0);
      expect(result.response).toBe('Paris');
    });

    it('should be case-sensitive for exact matches', async () => {
      await service.store('Hello World', 'Response 1');

      // First query hits exact cache
      const exact = await service.query({ query: 'Hello World' });
      expect(exact.hit).toBe(true);
      expect(exact.similarity).toBe(1.0);

      const stats1 = service.getStats();
      expect(stats1.exactMatchCache.hits).toBe(1);
      expect(stats1.exactMatchCache.misses).toBe(0);

      // Different case misses exact cache
      const result = await service.query({ query: 'hello world' });
      expect(result.hit).toBe(true); // Still finds via semantic
      expect(result.response).toBe('Response 1');

      const stats2 = service.getStats();
      expect(stats2.exactMatchCache.hits).toBe(1); // No new hit
      expect(stats2.exactMatchCache.misses).toBe(1); // One miss
    });

    it('should handle multiple stored queries', async () => {
      await service.store('Query 1', 'Response 1');
      await service.store('Query 2', 'Response 2');
      await service.store('Query 3', 'Response 3');

      const result1 = await service.query({ query: 'Query 1' });
      const result2 = await service.query({ query: 'Query 2' });
      const result3 = await service.query({ query: 'Query 3' });

      expect(result1.response).toBe('Response 1');
      expect(result2.response).toBe('Response 2');
      expect(result3.response).toBe('Response 3');
    });

    it('should update response if query is stored again', async () => {
      await service.store('Question', 'Original Answer');
      await service.store('Question', 'Updated Answer');

      const result = await service.query({ query: 'Question' });

      expect(result.response).toBe('Updated Answer');
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used when cache is full', async () => {
      // Fill cache to capacity (10 items)
      for (let i = 0; i < 10; i++) {
        await service.store(`Query ${i}`, `Response ${i}`);
      }

      // Verify all are cached
      const stats1 = service.getStats();
      expect(stats1.exactMatchCache.size).toBe(10);

      // Add one more, should evict Query 0
      await service.store('Query 10', 'Response 10');
      const stats2 = service.getStats();
      expect(stats2.exactMatchCache.size).toBe(10); // Still at capacity

      // Query 10 should be in exact cache (just added)
      const result10 = await service.query({ query: 'Query 10' });
      expect(result10.hit).toBe(true);
      expect(result10.similarity).toBe(1.0); // Exact match
      expect(result10.response).toBe('Response 10');

      // Querying Query 0 should miss exact cache (evicted)
      const hitsBefore = service.getStats().exactMatchCache.hits;
      const result0 = await service.query({ query: 'Query 0' });
      const hitsAfter = service.getStats().exactMatchCache.hits;
      
      expect(result0.hit).toBe(true); // Found via semantic search
      expect(result0.response).toBe('Response 0');
      expect(hitsAfter).toBe(hitsBefore); // No new hit from exact cache
    });

    it('should update LRU order when accessing items', async () => {
      // Fill cache
      for (let i = 0; i < 10; i++) {
        await service.store(`Query ${i}`, `Response ${i}`);
      }

      // Access Query 0 (makes it most recently used)
      const access0 = await service.query({ query: 'Query 0' });
      expect(access0.similarity).toBe(1.0); // Exact match

      // Add new item, should evict Query 1 (not Query 0)
      await service.store('Query 10', 'Response 10');

      // Query 0 should still give exact match (not evicted)
      const result0 = await service.query({ query: 'Query 0' });
      expect(result0.hit).toBe(true);
      expect(result0.similarity).toBe(1.0); // Still exact match
      expect(result0.response).toBe('Response 0');

      // Query 1 should miss exact cache (was evicted)
      const hitsBefore = service.getStats().exactMatchCache.hits;
      const result1 = await service.query({ query: 'Query 1' });
      const hitsAfter = service.getStats().exactMatchCache.hits;

      expect(result1.hit).toBe(true); // Found via semantic
      expect(result1.response).toBe('Response 1');
      expect(hitsAfter).toBe(hitsBefore); // No new exact cache hit
    });
  });

  describe('Statistics Tracking', () => {
    it('should track hits and misses', async () => {
      await service.store('Test Query', 'Test Response');

      // Hit
      await service.query({ query: 'Test Query' });
      // Miss
      await service.query({ query: 'Different Query' });
      // Hit
      await service.query({ query: 'Test Query' });

      const stats = service.getStats();

      expect(stats.exactMatchCache.hits).toBe(2);
      expect(stats.exactMatchCache.misses).toBe(1);
      expect(stats.exactMatchCache.hitRate).toBeCloseTo(2 / 3, 2);
    });

    it('should calculate hit rate correctly', async () => {
      await service.store('Query 1', 'Response 1');

      for (let i = 0; i < 10; i++) {
        await service.query({ query: 'Query 1' });
      }

      const stats = service.getStats();

      expect(stats.exactMatchCache.hits).toBe(10);
      expect(stats.exactMatchCache.misses).toBe(0);
      expect(stats.exactMatchCache.hitRate).toBe(1.0);
    });

    it('should track cache size', async () => {
      const stats0 = service.getStats();
      expect(stats0.exactMatchCache.size).toBe(0);

      await service.store('Query 1', 'Response 1');
      const stats1 = service.getStats();
      expect(stats1.exactMatchCache.size).toBe(1);

      await service.store('Query 2', 'Response 2');
      const stats2 = service.getStats();
      expect(stats2.exactMatchCache.size).toBe(2);
    });

    it('should include capacity in stats', async () => {
      const stats = service.getStats();
      expect(stats.exactMatchCache.capacity).toBe(10);
    });

    it('should handle zero queries without division by zero', async () => {
      const stats = service.getStats();
      expect(stats.exactMatchCache.hitRate).toBe(0);
    });
  });

  describe('Cache Clearing', () => {
    it('should clear exact match cache when clearCache is called', async () => {
      await service.store('Query 1', 'Response 1');
      await service.store('Query 2', 'Response 2');

      const statsBefore = service.getStats();
      expect(statsBefore.exactMatchCache.size).toBe(2);

      service.clearCache();

      const statsAfter = service.getStats();
      expect(statsAfter.exactMatchCache.size).toBe(0);
    });

    it('should reset statistics when clearing cache', async () => {
      await service.store('Test', 'Response');
      await service.query({ query: 'Test' });
      await service.query({ query: 'Miss' });

      const statsBefore = service.getStats();
      expect(statsBefore.exactMatchCache.hits).toBeGreaterThan(0);

      service.clearCache();

      const statsAfter = service.getStats();
      expect(statsAfter.exactMatchCache.hits).toBe(0);
      expect(statsAfter.exactMatchCache.misses).toBe(0);
    });
  });

  describe('Performance', () => {
    it('should handle high volume of queries efficiently', async () => {
      // Store 10 queries
      for (let i = 0; i < 10; i++) {
        await service.store(`Query ${i}`, `Response ${i}`);
      }

      const startTime = Date.now();

      // Query each 100 times
      for (let j = 0; j < 100; j++) {
        for (let i = 0; i < 10; i++) {
          await service.query({ query: `Query ${i}` });
        }
      }

      const duration = Date.now() - startTime;

      // 1000 queries should complete in reasonable time (< 2000ms with audit logging)
      expect(duration).toBeLessThan(2000);

      const stats = service.getStats();
      expect(stats.exactMatchCache.hits).toBe(1000);
    });
  });
});
