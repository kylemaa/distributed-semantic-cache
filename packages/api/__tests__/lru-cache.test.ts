/**
 * Unit tests for LRU Cache
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LRUCache } from '../src/lru-cache.js';

describe('LRUCache', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache<string, number>(3); // Small capacity for testing
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('a', 1);

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('should return correct size', () => {
      expect(cache.size()).toBe(0);
      
      cache.set('a', 1);
      expect(cache.size()).toBe(1);
      
      cache.set('b', 2);
      expect(cache.size()).toBe(2);
    });

    it('should update existing values', () => {
      cache.set('a', 1);
      cache.set('a', 10);

      expect(cache.get('a')).toBe(10);
      expect(cache.size()).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used item when at capacity', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      
      expect(cache.size()).toBe(3);

      // Add fourth item, should evict 'a' (oldest)
      cache.set('d', 4);

      expect(cache.size()).toBe(3);
      expect(cache.get('a')).toBeUndefined(); // Evicted
      expect(cache.get('b')).toBe(2);
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('should update LRU order on get', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a', making it most recently used
      cache.get('a');

      // Add fourth item, should evict 'b' (now least recently used)
      cache.set('d', 4);

      expect(cache.get('a')).toBe(1); // Still there
      expect(cache.get('b')).toBeUndefined(); // Evicted
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });

    it('should update LRU order on set for existing key', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Update 'a', making it most recently used
      cache.set('a', 10);

      // Add fourth item, should evict 'b'
      cache.set('d', 4);

      expect(cache.get('a')).toBe(10); // Still there, with new value
      expect(cache.get('b')).toBeUndefined(); // Evicted
      expect(cache.get('c')).toBe(3);
      expect(cache.get('d')).toBe(4);
    });
  });

  describe('clear', () => {
    it('should remove all items', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBeUndefined();
    });

    it('should reset statistics', () => {
      cache.set('a', 1);
      cache.get('a'); // hit
      cache.get('b'); // miss

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('getOrCompute', () => {
    it('should return cached value if exists', async () => {
      cache.set('a', 1);

      const computeFn = vi.fn().mockResolvedValue(999);
      const result = await cache.getOrCompute('a', computeFn);

      expect(result).toBe(1);
      expect(computeFn).not.toHaveBeenCalled();
    });

    it('should compute and cache value if missing', async () => {
      const computeFn = vi.fn().mockResolvedValue(42);
      const result = await cache.getOrCompute('a', computeFn);

      expect(result).toBe(42);
      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(cache.get('a')).toBe(42);
    });

    it('should use cached value on subsequent calls', async () => {
      const computeFn = vi.fn().mockResolvedValue(42);
      
      const result1 = await cache.getOrCompute('a', computeFn);
      const result2 = await cache.getOrCompute('a', computeFn);

      expect(result1).toBe(42);
      expect(result2).toBe(42);
      expect(computeFn).toHaveBeenCalledTimes(1); // Only called once
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('a', 1);
      
      cache.get('a'); // hit
      cache.get('a'); // hit
      cache.get('b'); // miss
      cache.get('c'); // miss
      cache.get('c'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(3);
    });

    it('should calculate hit rate correctly', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      cache.get('a'); // hit
      cache.get('b'); // hit
      cache.get('c'); // miss
      cache.get('d'); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0.5); // 2 hits out of 4 total
    });

    it('should return 0 hit rate when no operations', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it('should include size and capacity in stats', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.capacity).toBe(3);
    });

    it('should reset stats without clearing cache', () => {
      cache.set('a', 1);
      cache.get('a'); // hit
      cache.get('b'); // miss

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(cache.get('a')).toBe(1); // Cache still has data
    });
  });

  describe('edge cases', () => {
    it('should handle capacity of 1', () => {
      const smallCache = new LRUCache<string, number>(1);
      
      smallCache.set('a', 1);
      expect(smallCache.get('a')).toBe(1);

      smallCache.set('b', 2);
      expect(smallCache.get('a')).toBeUndefined();
      expect(smallCache.get('b')).toBe(2);
    });

    it('should handle capacity of 0', () => {
      const noCache = new LRUCache<string, number>(0);
      
      noCache.set('a', 1);
      expect(noCache.size()).toBe(0);
      expect(noCache.get('a')).toBeUndefined();
    });

    it('should handle different key types', () => {
      const numCache = new LRUCache<number, string>(3);
      
      numCache.set(1, 'one');
      numCache.set(2, 'two');

      expect(numCache.get(1)).toBe('one');
      expect(numCache.get(2)).toBe('two');
    });

    it('should handle complex value types', () => {
      interface ComplexValue {
        data: number[];
        meta: { name: string };
      }

      const complexCache = new LRUCache<string, ComplexValue>(3);
      const value: ComplexValue = { 
        data: [1, 2, 3], 
        meta: { name: 'test' } 
      };

      complexCache.set('key', value);
      const retrieved = complexCache.get('key');

      expect(retrieved).toEqual(value);
      expect(retrieved?.data).toEqual([1, 2, 3]);
    });
  });
});
