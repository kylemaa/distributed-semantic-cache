/**
 * Tests for HNSW Index
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { HNSWIndex } from '../src/hnsw-index.js';

describe('HNSWIndex', () => {
  let index: HNSWIndex;

  // Helper to generate random normalized vectors
  function randomVector(dims: number): number[] {
    const vec = Array.from({ length: dims }, () => Math.random() - 0.5);
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map(v => v / norm);
  }

  // Helper to generate a vector similar to another
  function similarVector(base: number[], noise: number = 0.1): number[] {
    const vec = base.map(v => v + (Math.random() - 0.5) * noise);
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map(v => v / norm);
  }

  beforeEach(() => {
    index = new HNSWIndex({ M: 8, efConstruction: 50, efSearch: 20 });
  });

  describe('basic operations', () => {
    it('should insert and retrieve vectors', () => {
      const vec = randomVector(128);
      index.insert('test1', vec);

      expect(index.size()).toBe(1);
      expect(index.has('test1')).toBe(true);
    });

    it('should handle empty index', () => {
      const results = index.search(randomVector(128), 5);
      expect(results).toHaveLength(0);
    });

    it('should find exact match with similarity 1.0', () => {
      const vec = randomVector(128);
      index.insert('exact', vec);

      const results = index.search(vec, 1);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('exact');
      expect(results[0].similarity).toBeCloseTo(1.0, 5);
    });

    it('should remove vectors', () => {
      const vec = randomVector(128);
      index.insert('to-remove', vec);
      expect(index.has('to-remove')).toBe(true);

      const removed = index.remove('to-remove');
      expect(removed).toBe(true);
      expect(index.has('to-remove')).toBe(false);
      expect(index.size()).toBe(0);
    });

    it('should update existing vectors', () => {
      const vec1 = randomVector(128);
      const vec2 = randomVector(128);
      
      index.insert('update-test', vec1);
      index.insert('update-test', vec2);

      expect(index.size()).toBe(1);
      
      // Search with vec2 should find it
      const results = index.search(vec2, 1);
      expect(results[0].similarity).toBeCloseTo(1.0, 5);
    });

    it('should clear the index', () => {
      index.insert('1', randomVector(128));
      index.insert('2', randomVector(128));
      index.insert('3', randomVector(128));

      expect(index.size()).toBe(3);
      index.clear();
      expect(index.size()).toBe(0);
    });
  });

  describe('search quality', () => {
    it('should find similar vectors', () => {
      const base = randomVector(128);
      index.insert('base', base);

      // Insert some random vectors
      for (let i = 0; i < 50; i++) {
        index.insert(`random-${i}`, randomVector(128));
      }

      // Insert a similar vector
      const similar = similarVector(base, 0.1);
      index.insert('similar', similar);

      // Search with base vector
      const results = index.search(base, 5);
      
      // Base should be first
      expect(results[0].id).toBe('base');
      
      // Similar should be in top results
      const similarResult = results.find(r => r.id === 'similar');
      expect(similarResult).toBeDefined();
      expect(similarResult!.similarity).toBeGreaterThan(0.9);
    });

    it('should respect similarity threshold', () => {
      const vec = randomVector(128);
      index.insert('test', vec);

      // Insert dissimilar vectors
      for (let i = 0; i < 20; i++) {
        index.insert(`random-${i}`, randomVector(128));
      }

      // Search with high threshold
      const results = index.search(vec, 10, 0.99);
      expect(results.length).toBeLessThanOrEqual(1);
      
      if (results.length > 0) {
        expect(results[0].similarity).toBeGreaterThanOrEqual(0.99);
      }
    });

    it('should return top-k results', () => {
      for (let i = 0; i < 100; i++) {
        index.insert(`vec-${i}`, randomVector(128));
      }

      const results = index.search(randomVector(128), 10, 0);
      expect(results.length).toBeLessThanOrEqual(10);
    });
  });

  describe('scale handling', () => {
    it('should handle 1000 vectors', () => {
      const start = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        index.insert(`vec-${i}`, randomVector(128));
      }
      
      const insertTime = Date.now() - start;
      console.log(`Inserted 1000 vectors in ${insertTime}ms`);

      const searchStart = Date.now();
      const results = index.search(randomVector(128), 10);
      const searchTime = Date.now() - searchStart;
      
      console.log(`Search in 1000 vectors took ${searchTime}ms`);
      
      expect(results.length).toBe(10);
      expect(searchTime).toBeLessThan(100); // Should be fast
    });

    it('should maintain quality at scale', () => {
      // Insert 500 random vectors
      for (let i = 0; i < 500; i++) {
        index.insert(`random-${i}`, randomVector(128));
      }

      // Insert target and its neighbors
      const target = randomVector(128);
      index.insert('target', target);

      const neighbors = [];
      for (let i = 0; i < 5; i++) {
        const neighbor = similarVector(target, 0.1);
        const id = `neighbor-${i}`;
        index.insert(id, neighbor);
        neighbors.push(id);
      }

      // Search should find target and neighbors
      const results = index.search(target, 10, 0.8);
      
      const foundIds = new Set(results.map(r => r.id));
      expect(foundIds.has('target')).toBe(true);
      
      // Should find at least 3 of 5 neighbors
      const neighborsFound = neighbors.filter(n => foundIds.has(n)).length;
      expect(neighborsFound).toBeGreaterThanOrEqual(3);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize', () => {
      const vectors = new Map<string, number[]>();
      
      for (let i = 0; i < 50; i++) {
        const vec = randomVector(128);
        index.insert(`vec-${i}`, vec);
        vectors.set(`vec-${i}`, vec);
      }

      // Serialize
      const json = index.serialize();
      expect(json).toBeTruthy();

      // Deserialize
      const restored = HNSWIndex.deserialize(json);
      expect(restored.size()).toBe(50);

      // Verify search still works
      const [id, vec] = Array.from(vectors.entries())[0];
      const results = restored.search(vec, 1);
      expect(results[0].id).toBe(id);
      expect(results[0].similarity).toBeCloseTo(1.0, 5);
    });
  });

  describe('statistics', () => {
    it('should provide accurate stats', () => {
      for (let i = 0; i < 100; i++) {
        index.insert(`vec-${i}`, randomVector(128));
      }

      const stats = index.getStats();
      expect(stats.size).toBe(100);
      expect(stats.maxLevel).toBeGreaterThanOrEqual(0);
      expect(stats.avgConnections).toBeGreaterThan(0);
      expect(stats.config.M).toBe(8);
    });
  });
});
