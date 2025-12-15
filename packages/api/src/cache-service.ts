/**
 * Semantic cache service
 */

import { randomUUID } from 'node:crypto';
import type { CacheEntry, CacheQuery, CacheResponse } from '@distributed-semantic-cache/shared';
import { CacheDatabase } from './database.js';
import { EmbeddingsService } from './embeddings.js';
import { LRUCache } from './lru-cache.js';
import { config } from './config.js';

interface ExactMatchStats {
  hits: number;
  misses: number;
  size: number;
  capacity: number;
  hitRate: number;
}

export class SemanticCacheService {
  private db: CacheDatabase;
  private embeddings: EmbeddingsService;
  private exactMatchCache: LRUCache<string, string>;
  private exactMatchStats: { hits: number; misses: number };

  constructor(exactMatchCacheSize?: number) {
    this.db = new CacheDatabase();
    this.embeddings = new EmbeddingsService();
    this.exactMatchCache = new LRUCache<string, string>(
      exactMatchCacheSize ?? config.cache.exactMatchSize
    );
    this.exactMatchStats = { hits: 0, misses: 0 };
  }

  /**
   * Query the cache for a similar entry
   */
  async query(cacheQuery: CacheQuery): Promise<CacheResponse> {
    const threshold = cacheQuery.threshold ?? config.cache.similarityThreshold;

    // Layer 1: Check for exact string match (O(1) lookup)
    const exactMatch = this.exactMatchCache.get(cacheQuery.query);
    if (exactMatch !== undefined) {
      this.exactMatchStats.hits++;
      return {
        hit: true,
        response: exactMatch,
        similarity: 1.0,
        cached: true,
      };
    }
    this.exactMatchStats.misses++;

    // Layer 2: Generate embedding for semantic search
    const queryEmbedding = await this.embeddings.generateEmbedding(cacheQuery.query);

    // Get all entries from database
    const entries = this.db.getAllEntries();

    // Find most similar entry (dynamic import to handle ESM/CJS interop)
    const sharedModule = await import('@distributed-semantic-cache/shared');
    const findMostSimilarFn = (sharedModule as any).findMostSimilar ?? (sharedModule as any).default?.findMostSimilar;
    const match = findMostSimilarFn ? findMostSimilarFn(queryEmbedding, entries, threshold) : null;

    if (match) {
      return {
        hit: true,
        response: match.item.response,
        similarity: match.similarity,
        cached: true,
      };
    }

    return {
      hit: false,
      cached: false,
    };
  }

  /**
   * Store a query-response pair in the cache
   */
  async store(query: string, response: string, metadata?: Record<string, any>): Promise<CacheEntry> {
    // Store in exact match cache for future O(1) lookups
    this.exactMatchCache.set(query, response);

    // Generate embedding for the query
    const embedding = await this.embeddings.generateEmbedding(query);

    const entry: CacheEntry = {
      id: randomUUID(),
      query,
      response,
      embedding,
      timestamp: Date.now(),
      metadata,
    };

    this.db.insertEntry(entry);

    // Prune cache if needed
    this.db.pruneCache(config.cache.maxSize);

    return entry;
  }

  /**
   * Get cache statistics (including embedding cache and exact match stats)
   */
  getStats() {
    return {
      ...this.db.getStats(),
      embeddingCache: this.embeddings.getCacheStats(),
      exactMatchCache: this.getExactMatchStats(),
    };
  }

  /**
   * Get exact match cache statistics
   */
  private getExactMatchStats(): ExactMatchStats {
    const { hits, misses } = this.exactMatchStats;
    const total = hits + misses;
    return {
      hits,
      misses,
      size: this.exactMatchCache.size(),
      capacity: this.exactMatchCache.capacity,
      hitRate: total > 0 ? hits / total : 0,
    };
  }

  /**
   * Clear all caches (semantic, embedding, and exact match)
   */
  clearCache(): void {
    this.db.clearCache();
    this.embeddings.clearCache();
    this.exactMatchCache.clear();
    this.exactMatchStats = { hits: 0, misses: 0 };
  }

  /**
   * Close connections
   */
  close(): void {
    this.db.close();
  }
}
