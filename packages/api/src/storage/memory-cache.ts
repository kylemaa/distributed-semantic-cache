/**
 * In-Memory KV Cache
 * 
 * Simple LRU-based key-value cache for L1/L2 fast path.
 * Implements IKVCache interface for consistency with Redis adapter.
 */

import type { IKVCache } from './interfaces.js';
import { LRUCache } from '../lru-cache.js';

/**
 * In-memory KV cache using LRU eviction
 * For single-node deployments
 */
export class InMemoryKVCache implements IKVCache {
  private cache: LRUCache<string, string>;
  private capacity: number;

  constructor(capacity: number = 1000) {
    this.capacity = capacity;
    this.cache = new LRUCache<string, string>(capacity);
  }

  async get(key: string): Promise<string | null> {
    const value = this.cache.get(key);
    return value === undefined ? null : value;
  }

  async set(key: string, value: string, _ttlSeconds?: number): Promise<void> {
    // Note: In-memory cache doesn't support TTL directly
    // For TTL support, use Redis
    this.cache.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.cache.get(key) !== undefined;
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async size(): Promise<number> {
    return this.cache.size();
  }

  async close(): Promise<void> {
    // Nothing to close for in-memory cache
  }

  getCapacity(): number {
    return this.capacity;
  }
}
