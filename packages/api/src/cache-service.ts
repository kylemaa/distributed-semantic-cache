/**
 * Semantic cache service with privacy features
 */

import { randomUUID } from 'node:crypto';
import type { CacheEntry, CacheQuery, CacheResponse } from '@distributed-semantic-cache/shared';
import { CacheDatabase } from './database.js';
import { EmbeddingsService } from './embeddings.js';
import { LRUCache } from './lru-cache.js';
import { quantize, dequantize, deserializeQuantized, serializeQuantized } from './quantization.js';
import { encryptEmbedding, decryptEmbedding, hash, createEncryptionMetadata } from './encryption.js';
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
    const queryHash = config.privacy.auditEnabled ? hash(cacheQuery.query) : undefined;

    // Layer 1: Check for exact string match (O(1) lookup)
    const exactMatch = this.exactMatchCache.get(cacheQuery.query);
    if (exactMatch !== undefined) {
      this.exactMatchStats.hits++;
      if (config.privacy.auditEnabled && queryHash) {
        this.db.addAuditLog('query', undefined, queryHash, true, { layer: 'exact_match', hit: true });
      }
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

    // Decrypt or dequantize embeddings based on privacy and quantization settings
    const processedEntries = entries.map(entry => {
      // If encrypted, decrypt first
      if (config.privacy.mode === 'strict' && entry.encryptedEmbedding) {
        if (!config.privacy.encryptionKey) {
          throw new Error('Encryption key required for strict privacy mode');
        }
        return {
          ...entry,
          embedding: decryptEmbedding(entry.encryptedEmbedding, config.privacy.encryptionKey),
        };
      }
      // Otherwise, dequantize if enabled
      if (config.quantization.enabled && entry.quantizedEmbedding) {
        const { quantized, min, max } = deserializeQuantized(entry.quantizedEmbedding);
        return {
          ...entry,
          embedding: dequantize(quantized, min, max),
        };
      }
      return entry;
    });

    // Find most similar entry (dynamic import to handle ESM/CJS interop)
    const sharedModule = await import('@distributed-semantic-cache/shared');
    const findMostSimilarFn = (sharedModule as any).findMostSimilar ?? (sharedModule as any).default?.findMostSimilar;
    const match = findMostSimilarFn ? findMostSimilarFn(queryEmbedding, processedEntries, threshold) : null;

    if (match) {
      if (config.privacy.auditEnabled && queryHash) {
        this.db.addAuditLog('query', match.item.id, queryHash, true, { layer: 'semantic', similarity: match.similarity, hit: true });
      }
      return {
        hit: true,
        response: match.item.response,
        similarity: match.similarity,
        cached: true,
      };
    }

    if (config.privacy.auditEnabled && queryHash) {
      this.db.addAuditLog('query', undefined, queryHash, false, { layer: 'semantic', hit: false });
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

    // Quantize embedding if enabled for storage reduction
    let quantizedBuffer: Buffer | undefined;
    if (config.quantization.enabled) {
      const quantized = quantize(embedding);
      quantizedBuffer = serializeQuantized(quantized);
    }

    // Encrypt embedding if privacy mode is strict
    let encryptedBuffer: Buffer | undefined;
    let encryptionMetadata: string | undefined;
    if (config.privacy.mode === 'strict') {
      if (!config.privacy.encryptionKey) {
        throw new Error('Encryption key required for strict privacy mode');
      }
      encryptedBuffer = encryptEmbedding(embedding, config.privacy.encryptionKey);
      encryptionMetadata = JSON.stringify(createEncryptionMetadata());
    }

    this.db.insertEntry(entry, quantizedBuffer, encryptedBuffer, encryptionMetadata);

    // Add audit log
    if (config.privacy.auditEnabled) {
      const queryHash = hash(query);
      this.db.addAuditLog('store', entry.id, queryHash, true, { encrypted: !!encryptedBuffer });
    }

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
    if (config.privacy.auditEnabled) {
      this.db.addAuditLog('clear_cache', undefined, undefined, true);
    }
    
    this.db.clearCache();
    this.embeddings.clearCache();
    this.exactMatchCache.clear();
    this.exactMatchStats = { hits: 0, misses: 0 };
  }

  /**
   * Get audit logs (requires audit enabled)
   */
  getAuditLogs(limit?: number, action?: string) {
    if (!config.privacy.auditEnabled) {
      throw new Error('Audit logging is not enabled');
    }
    return this.db.getAuditLogs(limit, action);
  }

  /**
   * Clear old audit logs
   */
  clearOldAuditLogs(daysToKeep?: number) {
    if (!config.privacy.auditEnabled) {
      throw new Error('Audit logging is not enabled');
    }
    this.db.clearOldAuditLogs(daysToKeep || config.privacy.auditRetentionDays);
  }

  /**
   * Close connections
   */
  close(): void {
    this.db.close();
  }
}
