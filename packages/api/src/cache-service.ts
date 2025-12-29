/**
 * Semantic cache service with privacy and smart matching features
 */

import { randomUUID } from 'node:crypto';
import type { CacheEntry, CacheQuery, CacheResponse } from '@distributed-semantic-cache/shared';
import { CacheDatabase } from './database.js';
import { EmbeddingsService } from './embeddings.js';
import { LRUCache } from './lru-cache.js';
import { quantize, dequantize, deserializeQuantized, serializeQuantized } from './quantization.js';
import { encryptEmbedding, decryptEmbedding, hash, createEncryptionMetadata } from './encryption.js';
import { normalizeQuery, detectQueryType, areQueriesEquivalent } from './normalize.js';
import { calculateConfidence, CacheLayer } from './confidence.js';
import { ThresholdLearner } from './threshold-learner.js';
import { QueryClusterer } from './query-clusterer.js';
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
  private thresholdLearner: ThresholdLearner;
  private queryClusterer: QueryClusterer;
  private normalizedCache: LRUCache<string, string>;

  constructor(exactMatchCacheSize?: number) {
    this.db = new CacheDatabase();
    this.embeddings = new EmbeddingsService();
    this.exactMatchCache = new LRUCache<string, string>(
      exactMatchCacheSize ?? config.cache.exactMatchSize
    );
    this.normalizedCache = new LRUCache<string, string>(exactMatchCacheSize ?? config.cache.exactMatchSize);
    this.exactMatchStats = { hits: 0, misses: 0 };
    this.thresholdLearner = new ThresholdLearner();
    this.queryClusterer = new QueryClusterer();
  }

  /**
   * Query the cache for a similar entry with smart matching
   */
  async query(cacheQuery: CacheQuery): Promise<CacheResponse> {
    const originalQuery = cacheQuery.query;
    const normalizedQuery = normalizeQuery(originalQuery);
    const queryType = detectQueryType(originalQuery);
    const queryHash = config.privacy.auditEnabled ? hash(originalQuery) : undefined;
    
    // Determine adaptive threshold
    const adaptiveThreshold = this.thresholdLearner.getThreshold(queryType, originalQuery.length);
    const threshold = cacheQuery.threshold ?? adaptiveThreshold;

    // Add query to clustering analysis
    this.queryClusterer.addQuery(originalQuery);

    // Layer 1: Check for exact string match (O(1) lookup)
    const exactMatch = this.exactMatchCache.get(originalQuery);
    if (exactMatch !== undefined) {
      this.exactMatchStats.hits++;
      this.thresholdLearner.recordSuccess(queryType, 1.0);
      
      const confidence = calculateConfidence(1.0, CacheLayer.EXACT_MATCH, originalQuery.length);
      
      if (config.privacy.auditEnabled && queryHash) {
        this.db.addAuditLog('query', undefined, queryHash, true, { layer: 'exact_match', hit: true, confidence: confidence.score });
      }
      return {
        hit: true,
        response: exactMatch,
        similarity: 1.0,
        cached: true,
        confidence: {
          score: confidence.score,
          level: confidence.level,
          layer: confidence.layer,
          explanation: confidence.explanation,
        },
      };
    }
    this.exactMatchStats.misses++;

    // Layer 2: Check normalized query cache
    const normalizedMatch = this.normalizedCache.get(normalizedQuery);
    if (normalizedMatch !== undefined && normalizedQuery !== originalQuery) {
      this.thresholdLearner.recordSuccess(queryType, 0.98);
      
      const confidence = calculateConfidence(0.98, CacheLayer.NORMALIZED_MATCH, originalQuery.length);
      
      if (config.privacy.auditEnabled && queryHash) {
        this.db.addAuditLog('query', undefined, queryHash, true, { layer: 'normalized_match', hit: true, confidence: confidence.score });
      }
      return {
        hit: true,
        response: normalizedMatch,
        similarity: 0.98,
        cached: true,
        confidence: {
          score: confidence.score,
          level: confidence.level,
          layer: confidence.layer,
          explanation: confidence.explanation,
        },
      };
    }

    // Layer 3: Generate embedding for semantic search
    const queryEmbedding = await this.embeddings.generateEmbedding(originalQuery);

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
      this.thresholdLearner.recordSuccess(queryType, match.similarity);
      
      // Calculate entry age
      const ageHours = (Date.now() - match.item.timestamp) / (1000 * 60 * 60);
      const confidence = calculateConfidence(match.similarity, CacheLayer.SEMANTIC_MATCH, originalQuery.length, ageHours);
      
      if (config.privacy.auditEnabled && queryHash) {
        this.db.addAuditLog('query', match.item.id, queryHash, true, { layer: 'semantic', similarity: match.similarity, hit: true, confidence: confidence.score });
      }
      return {
        hit: true,
        response: match.item.response,
        similarity: match.similarity,
        cached: true,
        confidence: {
          score: confidence.score,
          level: confidence.level,
          layer: confidence.layer,
          explanation: confidence.explanation,
        },
      };
    }

    // No match found
    this.thresholdLearner.recordFailure(queryType, threshold);
    
    if (config.privacy.auditEnabled && queryHash) {
      this.db.addAuditLog('query', undefined, queryHash, false, { layer: 'semantic', hit: false, threshold });
    }

    return {
      hit: false,
      cached: false,
    };
  }

  /**
   * Store a query-response pair in the cache with smart matching
   */
  async store(query: string, response: string, metadata?: Record<string, any>): Promise<CacheEntry> {
    // Store in exact match cache for future O(1) lookups
    this.exactMatchCache.set(query, response);
    
    // Store in normalized cache too
    const normalizedQuery = normalizeQuery(query);
    if (normalizedQuery !== query) {
      this.normalizedCache.set(normalizedQuery, response);
    }
    
    // Add to clustering analysis
    this.queryClusterer.addQuery(query);

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
   * Get cache statistics (including smart matching stats)
   */
  getStats() {
    return {
      ...this.db.getStats(),
      embeddingCache: this.embeddings.getCacheStats(),
      exactMatchCache: this.getExactMatchStats(),
      normalizedCache: {
        size: this.normalizedCache.size(),
        capacity: this.normalizedCache.getStats().capacity,
      },
      smartMatching: {
        thresholdLearning: this.thresholdLearner.getAllStats(),
        clustering: this.queryClusterer.getStats(),
      },
    };
  }

  /**
   * Get exact match cache statistics
   */
  private getExactMatchStats(): ExactMatchStats {
    const { hits, misses } = this.exactMatchStats;
    const total = hits + misses;
    const cacheStats = this.exactMatchCache.getStats();
    return {
      hits,
      misses,
      size: this.exactMatchCache.size(),
      capacity: cacheStats.capacity,
      hitRate: total > 0 ? hits / total : 0,
    };
  }

  /**
   * Clear all caches (semantic, embedding, exact match, and smart matching)
   */
  clearCache(): void {
    if (config.privacy.auditEnabled) {
      this.db.addAuditLog('clear_cache', undefined, undefined, true);
    }
    
    this.db.clearCache();
    this.embeddings.clearCache();
    this.exactMatchCache.clear();
    this.normalizedCache.clear();
    this.exactMatchStats = { hits: 0, misses: 0 };
    this.thresholdLearner.reset();
    this.queryClusterer.reset();
  }
  
  /**
   * Get smart matching statistics
   */
  getSmartMatchingStats() {
    return {
      thresholdLearning: this.thresholdLearner.getAllStats(),
      clustering: this.queryClusterer.getStats(),
      popularPatterns: this.queryClusterer.getPopularPatterns(5),
    };
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
