/**
 * LRU (Least Recently Used) Cache implementation
 * Automatically evicts least recently used items when capacity is reached
 */

export interface LRUCacheStats {
  hits: number;
  misses: number;
  size: number;
  capacity: number;
  hitRate: number;
}

export class LRUCache<K, V> {
  private cache: Map<K, V>;
  private capacity: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(capacity: number = 1000) {
    this.capacity = capacity;
    this.cache = new Map();
  }

  /**
   * Get a value from the cache
   * Moves the item to the end (most recently used)
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    
    if (value !== undefined) {
      this.hits++;
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    
    this.misses++;
    return undefined;
  }

  /**
   * Set a value in the cache
   * Evicts least recently used item if at capacity
   */
  set(key: K, value: V): void {
    // Don't store anything if capacity is 0
    if (this.capacity === 0) {
      return;
    }

    // If key exists, delete it first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.capacity) {
      // Evict least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, value);
  }

  /**
   * Check if a key exists in the cache
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete a key from the cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Get or compute a value
   * If the key exists, return it. Otherwise, compute it, cache it, and return it.
   */
  async getOrCompute(key: K, computeFn: () => Promise<V>): Promise<V> {
    const existing = this.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const value = await computeFn();
    this.set(key, value);
    return value;
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): LRUCacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      capacity: this.capacity,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Reset statistics without clearing cache
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
