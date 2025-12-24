/**
 * Storage Abstraction Layer Tests
 *
 * Tests for the pluggable storage backends:
 * - SQLite (default, single-node)
 * - In-memory KV cache (testing/development)
 * - In-memory Vector store (testing/development)
 *
 * Note: Redis, PostgreSQL, and Qdrant tests require running instances.
 * These would be tested in integration tests with actual services.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStorage } from '../src/storage/sqlite-storage';
import { InMemoryKVCache } from '../src/storage/memory-cache';
import { InMemoryVectorStore } from '../src/storage/qdrant-store';
import type { CacheEntry } from '@distributed-semantic-cache/shared';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Storage Abstraction Layer', () => {
  const testDbPath = path.join(os.tmpdir(), `test-storage-${Date.now()}-${Math.random()}.db`);

  afterEach(() => {
    // Cleanup test database
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
      if (fs.existsSync(`${testDbPath}-journal`)) {
        fs.unlinkSync(`${testDbPath}-journal`);
      }
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('SQLiteStorage', () => {
    let storage: SQLiteStorage;

    beforeEach(async () => {
      storage = new SQLiteStorage({ path: testDbPath });
      await storage.initialize();
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should initialize and create tables', async () => {
      const stats = await storage.getStats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should store and retrieve cache entries', async () => {
      const entry: CacheEntry = {
        id: 'test-1',
        query: 'What is the capital of France?',
        embedding: [0.1, 0.2, 0.3],
        response: 'The capital of France is Paris.',
        timestamp: Date.now(),
        metadata: { tokens: 50 },
      };

      await storage.insertEntry(entry);
      const retrieved = await storage.getEntryById('test-1');

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe('test-1');
      expect(retrieved!.query).toBe('What is the capital of France?');
      expect(retrieved!.response).toBe('The capital of France is Paris.');
    });

    it('should find by exact query', async () => {
      const entry: CacheEntry = {
        id: 'test-2',
        query: 'Hello world',
        embedding: [0.1, 0.2, 0.3],
        response: 'Hi there!',
        timestamp: Date.now(),
      };

      await storage.insertEntry(entry);
      const found = await storage.getEntryByQuery('Hello world');

      expect(found).not.toBeNull();
      expect(found!.id).toBe('test-2');
    });

    it('should get all entries', async () => {
      const entry1: CacheEntry = {
        id: 'test-3a',
        query: 'Query 1',
        embedding: [0.1, 0.2, 0.3],
        response: 'Response 1',
        timestamp: Date.now(),
      };

      const entry2: CacheEntry = {
        id: 'test-3b',
        query: 'Query 2',
        embedding: [0.4, 0.5, 0.6],
        response: 'Response 2',
        timestamp: Date.now() + 1000,
      };

      await storage.insertEntry(entry1);
      await storage.insertEntry(entry2);

      const all = await storage.getAllEntries();
      expect(all.length).toBe(2);
    });

    it('should prune cache when over capacity', async () => {
      // Insert 5 entries with staggered timestamps
      for (let i = 0; i < 5; i++) {
        const entry: CacheEntry = {
          id: `prune-${i}`,
          query: `Query ${i}`,
          embedding: [i * 0.1, i * 0.2, i * 0.3],
          response: `Response ${i}`,
          timestamp: Date.now() + i * 1000, // Stagger creation times
        };
        await storage.insertEntry(entry);
      }

      // Prune to keep only 3
      await storage.pruneCache(3);

      const remaining = await storage.getAllEntries();
      expect(remaining.length).toBe(3);
      
      // Should keep the newest entries (indices 2, 3, 4)
      const ids = remaining.map(e => e.id);
      expect(ids).toContain('prune-4');
      expect(ids).toContain('prune-3');
      expect(ids).toContain('prune-2');
    });

    it('should clear all entries', async () => {
      const entry: CacheEntry = {
        id: 'clear-test',
        query: 'Test query',
        embedding: [0.1, 0.2, 0.3],
        response: 'Test response',
        timestamp: Date.now(),
      };

      await storage.insertEntry(entry);
      expect((await storage.getStats()).totalEntries).toBe(1);

      await storage.clearCache();
      expect((await storage.getStats()).totalEntries).toBe(0);
    });

    it('should add and retrieve audit logs', async () => {
      await storage.addAuditLog('cache_hit', 'entry-1', 'hash123', true, { latency: 5 });
      await storage.addAuditLog('cache_miss', undefined, 'hash456', true);

      const logs = await storage.getAuditLogs(10);
      expect(logs.length).toBe(2);
      expect(logs[0].action).toBe('cache_miss'); // Most recent first
      expect(logs[1].action).toBe('cache_hit');
    });

    it('should report healthy status', async () => {
      const healthy = await storage.isHealthy();
      expect(healthy).toBe(true);
    });
  });

  describe('InMemoryKVCache', () => {
    let cache: InMemoryKVCache;

    beforeEach(() => {
      cache = new InMemoryKVCache(100);
    });

    it('should set and get values', async () => {
      await cache.set('key1', 'value1');
      const value = await cache.get('key1');
      expect(value).toBe('value1');
    });

    it('should return null for missing keys', async () => {
      const value = await cache.get('nonexistent');
      expect(value).toBeNull();
    });

    it('should delete values', async () => {
      await cache.set('key2', 'value2');
      expect(await cache.get('key2')).toBe('value2');

      await cache.delete('key2');
      expect(await cache.get('key2')).toBeNull();
    });

    it('should check existence', async () => {
      await cache.set('key3', 'value3');
      expect(await cache.has('key3')).toBe(true);
      expect(await cache.has('nonexistent')).toBe(false);
    });

    it('should clear all entries', async () => {
      await cache.set('a', '1');
      await cache.set('b', '2');
      await cache.set('c', '3');

      await cache.clear();

      expect(await cache.get('a')).toBeNull();
      expect(await cache.get('b')).toBeNull();
      expect(await cache.get('c')).toBeNull();
    });

    it('should respect max size (LRU eviction)', async () => {
      const smallCache = new InMemoryKVCache(3);

      await smallCache.set('a', '1');
      await smallCache.set('b', '2');
      await smallCache.set('c', '3');

      // Access 'a' to make it recently used
      await smallCache.get('a');

      // Add new entry, should evict 'b' (oldest)
      await smallCache.set('d', '4');

      expect(await smallCache.get('a')).toBe('1'); // Recently accessed
      expect(await smallCache.get('b')).toBeNull(); // Evicted
      expect(await smallCache.get('c')).toBe('3');
      expect(await smallCache.get('d')).toBe('4');
    });

    it('should report size', async () => {
      await cache.set('x', '1');
      await cache.set('y', '2');
      expect(await cache.size()).toBe(2);
    });
  });

  describe('InMemoryVectorStore', () => {
    let vectorStore: InMemoryVectorStore;

    beforeEach(async () => {
      vectorStore = new InMemoryVectorStore(384);
      await vectorStore.initialize();
    });

    it('should add and search vectors', async () => {
      // Create some test embeddings (normalized)
      const embedding1 = createNormalizedEmbedding(384, 0.1);
      const embedding2 = createNormalizedEmbedding(384, 0.5);
      const embedding3 = createNormalizedEmbedding(384, 0.9);

      await vectorStore.addVector('vec-1', embedding1, { query: 'Test 1' });
      await vectorStore.addVector('vec-2', embedding2, { query: 'Test 2' });
      await vectorStore.addVector('vec-3', embedding3, { query: 'Test 3' });

      // Search with a query similar to embedding1
      const queryEmbedding = createNormalizedEmbedding(384, 0.11);
      const results = await vectorStore.search(queryEmbedding, 2, 0.5);

      expect(results.length).toBeGreaterThan(0);
      // The closest match should be vec-1 (most similar seed)
      expect(results[0].id).toBe('vec-1');
    });

    it('should delete vectors', async () => {
      const embedding = createNormalizedEmbedding(384, 0.4);

      await vectorStore.addVector('to-delete', embedding, {});
      expect(await vectorStore.size()).toBe(1);

      await vectorStore.deleteVector('to-delete');
      expect(await vectorStore.size()).toBe(0);
    });

    it('should count vectors', async () => {
      const embedding1 = createNormalizedEmbedding(384, 0.2);
      const embedding2 = createNormalizedEmbedding(384, 0.3);

      await vectorStore.addVector('count-1', embedding1, {});
      await vectorStore.addVector('count-2', embedding2, {});

      const count = await vectorStore.size();
      expect(count).toBe(2);
    });

    it('should clear all vectors', async () => {
      const embedding = createNormalizedEmbedding(384, 0.5);
      await vectorStore.addVector('clear-1', embedding, {});
      await vectorStore.addVector('clear-2', embedding, {});

      await vectorStore.clear();
      expect(await vectorStore.size()).toBe(0);
    });

    it('should report healthy', async () => {
      expect(await vectorStore.isHealthy()).toBe(true);
    });
  });
});

// Helper to create normalized embeddings with deterministic values
function createNormalizedEmbedding(dimension: number, seed: number): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < dimension; i++) {
    embedding[i] = Math.sin(seed * 12.9898 + i * 78.233) * 0.5 + 0.5;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < dimension; i++) {
    norm += embedding[i] * embedding[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < dimension; i++) {
    embedding[i] /= norm;
  }
  return embedding;
}
