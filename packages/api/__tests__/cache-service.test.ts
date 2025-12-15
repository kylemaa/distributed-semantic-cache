/**
 * Integration tests for Semantic Cache Service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SemanticCacheService } from '../src/cache-service.js';
import { EmbeddingsService } from '../src/embeddings.js';
import type { CacheQuery } from '@distributed-semantic-cache/shared';
import fs from 'fs';
import path from 'path';

// Mock the embeddings service to avoid real API calls
vi.mock('../src/embeddings.js', () => {
  // Simple word-based embedding generation for testing
  function generateMockEmbedding(text: string): number[] {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = Array(384).fill(0);
    
    // Create embeddings that reflect word content
    words.forEach((word, idx) => {
      const wordHash = word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      for (let i = 0; i < 384; i++) {
        embedding[i] += Math.sin(wordHash * (i + 1) + idx) * 0.1;
      }
    });
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  return {
    EmbeddingsService: vi.fn().mockImplementation(() => ({
      generateEmbedding: vi.fn().mockImplementation((text: string) => {
        return Promise.resolve(generateMockEmbedding(text));
      }),
      generateEmbeddings: vi.fn().mockImplementation((texts: string[]) => {
        return Promise.resolve(texts.map(text => generateMockEmbedding(text)));
      }),
    })),
  };
});

describe('SemanticCacheService', () => {
  let cacheService: SemanticCacheService;
  let testDbPath: string;

  beforeEach(() => {
    // Create unique database path for each test to ensure isolation
    testDbPath = `./test-cache-${Date.now()}-${Math.random().toString(36)}.db`;
    process.env.DATABASE_PATH = testDbPath;
    process.env.OPENAI_API_KEY = 'test-key'; // Set a dummy key for tests
    cacheService = new SemanticCacheService();
  });

  afterEach(() => {
    // Clean up
    try {
      cacheService.close();
    } catch (e) {
      // Ignore close errors
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('store', () => {
    it('should store a query-response pair successfully', async () => {
      const query = 'What is the weather today?';
      const response = 'The weather is sunny and warm.';

      const entry = await cacheService.store(query, response);

      expect(entry.id).toBeDefined();
      expect(entry.query).toBe(query);
      expect(entry.response).toBe(response);
      expect(entry.embedding).toBeDefined();
      expect(entry.embedding.length).toBeGreaterThan(0);
      expect(entry.timestamp).toBeGreaterThan(0);
    });

    it('should store metadata with cache entry', async () => {
      const metadata = { userId: 'user123', source: 'test' };
      const entry = await cacheService.store('test query', 'test response', metadata);

      expect(entry.metadata).toEqual(metadata);
    });

    it('should generate embeddings for stored queries', async () => {
      const entry = await cacheService.store('test', 'response');
      
      expect(entry.embedding).toBeInstanceOf(Array);
      expect(entry.embedding.length).toBeGreaterThan(100); // Typical embedding size
    });
  });

  describe('query', () => {
    it('should return cache hit for exact match', async () => {
      const query = 'What is machine learning?';
      const response = 'ML is a subset of AI.';
      
      await cacheService.store(query, response);
      
      const result = await cacheService.query({ query });

      expect(result.hit).toBe(true);
      expect(result.response).toBe(response);
      expect(result.similarity).toBeCloseTo(1.0, 1);
    });

    it('should return cache hit for semantically similar queries', async () => {
      await cacheService.store('What is machine learning?', 'ML is a subset of AI.');
      
      const result = await cacheService.query({ 
        query: 'What is machine learning',  // Very similar, just missing ?
        threshold: 0.7 // Lower threshold for this test
      });

      expect(result.hit).toBe(true);
      expect(result.response).toBe('ML is a subset of AI.');
      expect(result.similarity).toBeGreaterThan(0.7);
    });

    it('should return cache miss for dissimilar queries', async () => {
      await cacheService.store('What is the weather?', 'Sunny and warm.');
      
      const result = await cacheService.query({ 
        query: 'Explain quantum physics',
        threshold: 0.85
      });

      expect(result.hit).toBe(false);
      expect(result.response).toBeUndefined();
      expect(result.similarity).toBeUndefined();
    });

    it('should respect custom similarity threshold', async () => {
      await cacheService.store('What is AI?', 'Artificial Intelligence.');
      
      // High threshold - should miss for different query
      const strictResult = await cacheService.query({ 
        query: 'Tell me about quantum computing',
        threshold: 0.99
      });
      expect(strictResult.hit).toBe(false);

      // Low threshold - exact match should always hit
      const lenientResult = await cacheService.query({ 
        query: 'What is AI?',
        threshold: 0.5
      });
      expect(lenientResult.hit).toBe(true);
    });

    it('should return null for empty cache', async () => {
      const result = await cacheService.query({ query: 'anything' });

      expect(result.hit).toBe(false);
      expect(result.cached).toBe(false);
    });

    it('should return most similar match when multiple entries exist', async () => {
      await cacheService.store('test query one', 'response one');
      await cacheService.store('test query two', 'response two');
      await cacheService.store('different topic entirely', 'other response');
      
      const result = await cacheService.query({ 
        query: 'test query one',  // Exact match with first entry
        threshold: 0.8
      });

      expect(result.hit).toBe(true);
      // Should match the first entry since it's exact
      expect(result.response).toBe('response one');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const stats1 = cacheService.getStats();
      expect(stats1.totalEntries).toBe(0);

      await cacheService.store('query 1', 'response 1');
      await cacheService.store('query 2', 'response 2');

      const stats2 = cacheService.getStats();
      expect(stats2.totalEntries).toBe(2);
    });
  });

  describe('clearCache', () => {
    it('should clear all entries from cache', async () => {
      await cacheService.store('query 1', 'response 1');
      await cacheService.store('query 2', 'response 2');

      expect(cacheService.getStats().totalEntries).toBe(2);

      cacheService.clearCache();

      expect(cacheService.getStats().totalEntries).toBe(0);
    });

    it('should allow new entries after clearing', async () => {
      await cacheService.store('query 1', 'response 1');
      cacheService.clearCache();

      const entry = await cacheService.store('query 2', 'response 2');
      expect(entry).toBeDefined();
      expect(cacheService.getStats().totalEntries).toBe(1);
    });
  });

  describe('cache pruning', () => {
    it('should prune old entries when max size is reached', async () => {
      // Close the existing cache service
      cacheService.close();
      
      // Create new unique DB path for this test
      const prunePath = `./test-prune-${Date.now()}-${Math.random().toString(36)}.db`;
      process.env.DATABASE_PATH = prunePath;
      process.env.MAX_CACHE_SIZE = '3';
      const limitedCache = new SemanticCacheService();

      // Add more entries than the limit
      await limitedCache.store('query 1', 'response 1');
      await limitedCache.store('query 2', 'response 2');
      await limitedCache.store('query 3', 'response 3');
      await limitedCache.store('query 4', 'response 4');

      const stats = limitedCache.getStats();
      expect(stats.totalEntries).toBeLessThanOrEqual(3);

      limitedCache.close();
      // Clean up the prune test database
      if (fs.existsSync(prunePath)) {
        fs.unlinkSync(prunePath);
      }
      // Reset MAX_CACHE_SIZE to avoid affecting other tests
      delete process.env.MAX_CACHE_SIZE;
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple simultaneous stores', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        cacheService.store(`query ${i}`, `response ${i}`)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(cacheService.getStats().totalEntries).toBe(5);
    });

    it('should handle simultaneous queries', async () => {
      await cacheService.store('test query', 'test response');

      const promises = Array.from({ length: 5 }, () =>
        cacheService.query({ query: 'test query' })
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.hit).toBe(true);
        expect(result.response).toBe('test response');
      });
    });
  });
});
