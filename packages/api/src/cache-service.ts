/**
 * Semantic cache service
 */

import { randomUUID } from 'node:crypto';
import type { CacheEntry, CacheQuery, CacheResponse } from '@distributed-semantic-cache/shared';
import { findMostSimilar } from '@distributed-semantic-cache/shared';
import { CacheDatabase } from './database.js';
import { EmbeddingsService } from './embeddings.js';
import { config } from './config.js';

export class SemanticCacheService {
  private db: CacheDatabase;
  private embeddings: EmbeddingsService;

  constructor() {
    this.db = new CacheDatabase();
    this.embeddings = new EmbeddingsService();
  }

  /**
   * Query the cache for a similar entry
   */
  async query(cacheQuery: CacheQuery): Promise<CacheResponse> {
    const threshold = cacheQuery.threshold ?? config.cache.similarityThreshold;

    // Generate embedding for the query
    const queryEmbedding = await this.embeddings.generateEmbedding(cacheQuery.query);

    // Get all entries from database
    const entries = this.db.getAllEntries();

    // Find most similar entry
    const match = findMostSimilar(queryEmbedding, entries, threshold);

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
   * Get cache statistics
   */
  getStats() {
    return this.db.getStats();
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.db.clearCache();
  }

  /**
   * Close connections
   */
  close(): void {
    this.db.close();
  }
}
