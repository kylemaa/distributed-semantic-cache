/**
 * Scalable Cache Service
 * 
 * An enhanced cache service that uses the storage abstraction layer.
 * Supports multiple backends for horizontal scaling:
 * - SQLite (single-node, default)
 * - Redis (distributed L1/L2 cache)
 * - PostgreSQL + pgvector (production)
 * - Qdrant (production vector search)
 * 
 * This maintains full backward compatibility with the existing
 * SemanticCacheService while adding scale capabilities.
 */

import { randomUUID } from 'node:crypto';
import type { CacheEntry, CacheQuery, CacheResponse } from '@distributed-semantic-cache/shared';
import { cosineSimilarity } from '@distributed-semantic-cache/shared';
import { 
  StorageManager, 
  createStorageFromEnv,
  type StorageConfig,
  type ICacheStorage,
  type IVectorStore,
  type IKVCache,
} from './storage/index.js';
import { EmbeddingsService } from './embeddings.js';
import { quantize, dequantize, deserializeQuantized, serializeQuantized } from './quantization.js';
import { encryptEmbedding, decryptEmbedding, hash, createEncryptionMetadata } from './encryption.js';
import { normalizeQuery, detectQueryType } from './normalize.js';
import { calculateConfidence, CacheLayer } from './confidence.js';
import { ThresholdLearner } from './threshold-learner.js';
import { QueryClusterer } from './query-clusterer.js';
import { config } from './config.js';

interface CacheStats {
  totalEntries: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  embeddingCache: any;
  exactMatchCache: { hits: number; misses: number; size: number; hitRate: number };
  normalizedCache: { size: number };
  vectorStore: { size: number };
  smartMatching: any;
  backends: {
    storage: string;
    vectorStore: string;
    distributed: boolean;
  };
}

/**
 * Scalable Semantic Cache Service
 * 
 * Uses pluggable storage backends for different scale requirements:
 * - Development: SQLite + In-memory HNSW
 * - Production: Redis + Qdrant or PostgreSQL + pgvector
 */
export class ScalableCacheService {
  private storageManager: StorageManager;
  private storage: ICacheStorage;
  private vectorStore: IVectorStore;
  private kvCache: IKVCache;
  private embeddings: EmbeddingsService;
  private thresholdLearner: ThresholdLearner;
  private queryClusterer: QueryClusterer;
  private stats: { exactHits: number; normalizedHits: number; semanticHits: number; misses: number };
  private initialized: boolean = false;
  private storageConfig: StorageConfig;

  constructor(storageConfig?: StorageConfig) {
    // Use provided config or create from environment
    if (storageConfig) {
      this.storageManager = new StorageManager(storageConfig);
      this.storageConfig = storageConfig;
    } else {
      this.storageManager = createStorageFromEnv();
      this.storageConfig = this.storageManager.getConfig();
    }

    this.storage = this.storageManager.getCacheStorage();
    this.vectorStore = this.storageManager.getVectorStore();
    this.kvCache = this.storageManager.getKVCache();
    this.embeddings = new EmbeddingsService();
    this.thresholdLearner = new ThresholdLearner();
    this.queryClusterer = new QueryClusterer();
    this.stats = { exactHits: 0, normalizedHits: 0, semanticHits: 0, misses: 0 };
  }

  /**
   * Initialize all storage backends
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.storageManager.initialize();
    this.initialized = true;
  }

  /**
   * Ensure initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Query the cache for a similar entry
   */
  async query(cacheQuery: CacheQuery): Promise<CacheResponse> {
    await this.ensureInitialized();

    const originalQuery = cacheQuery.query;
    const normalizedQueryStr = normalizeQuery(originalQuery);
    const queryType = detectQueryType(originalQuery);
    const queryHash = config.privacy.auditEnabled ? hash(originalQuery) : undefined;
    
    // Determine adaptive threshold
    const adaptiveThreshold = this.thresholdLearner.getThreshold(queryType, originalQuery.length);
    const threshold = cacheQuery.threshold ?? adaptiveThreshold;

    // Add query to clustering analysis
    this.queryClusterer.addQuery(originalQuery);

    // =========================================================================
    // Layer 1: Exact match (distributed via Redis if configured)
    // =========================================================================
    const exactMatch = await this.kvCache.get(`exact:${originalQuery}`);
    if (exactMatch !== null) {
      this.stats.exactHits++;
      this.thresholdLearner.recordSuccess(queryType, 1.0);
      
      const confidence = calculateConfidence(1.0, CacheLayer.EXACT_MATCH, originalQuery.length);
      
      if (config.privacy.auditEnabled && queryHash) {
        await this.storage.addAuditLog('query', undefined, queryHash, true, { layer: 'exact_match', hit: true });
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

    // =========================================================================
    // Layer 2: Normalized match (distributed via Redis if configured)
    // =========================================================================
    if (normalizedQueryStr !== originalQuery) {
      const normalizedMatch = await this.kvCache.get(`norm:${normalizedQueryStr}`);
      if (normalizedMatch !== null) {
        this.stats.normalizedHits++;
        this.thresholdLearner.recordSuccess(queryType, 0.98);
        
        const confidence = calculateConfidence(0.98, CacheLayer.NORMALIZED_MATCH, originalQuery.length);
        
        if (config.privacy.auditEnabled && queryHash) {
          await this.storage.addAuditLog('query', undefined, queryHash, true, { layer: 'normalized_match', hit: true });
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
    }

    // =========================================================================
    // Layer 3: Semantic search (via vector store)
    // =========================================================================
    const queryEmbedding = await this.embeddings.generateEmbedding(originalQuery);
    
    // Use vector store for similarity search
    const vectorResults = await this.vectorStore.search(queryEmbedding, 1, threshold);
    
    if (vectorResults.length > 0) {
      const bestMatch = vectorResults[0];
      
      // Fetch full entry from storage
      const entry = await this.storage.getEntryById(bestMatch.id);
      
      if (entry) {
        this.stats.semanticHits++;
        this.thresholdLearner.recordSuccess(queryType, bestMatch.similarity);
        
        const ageHours = (Date.now() - entry.timestamp) / (1000 * 60 * 60);
        const confidence = calculateConfidence(bestMatch.similarity, CacheLayer.SEMANTIC_MATCH, originalQuery.length, ageHours);
        
        if (config.privacy.auditEnabled && queryHash) {
          await this.storage.addAuditLog('query', entry.id, queryHash, true, { 
            layer: 'semantic', 
            similarity: bestMatch.similarity, 
            hit: true 
          });
        }
        
        return {
          hit: true,
          response: entry.response,
          similarity: bestMatch.similarity,
          cached: true,
          confidence: {
            score: confidence.score,
            level: confidence.level,
            layer: confidence.layer,
            explanation: confidence.explanation,
          },
        };
      }
    }

    // =========================================================================
    // Fallback: Check storage directly (for backends without vector store sync)
    // =========================================================================
    const entries = await this.storage.getAllEntries();
    
    // Process entries (decrypt/dequantize if needed)
    const processedEntries = entries.map(entry => {
      if (config.privacy.mode === 'strict' && entry.encryptedEmbedding) {
        if (!config.privacy.encryptionKey) {
          throw new Error('Encryption key required for strict privacy mode');
        }
        return {
          ...entry,
          embedding: decryptEmbedding(entry.encryptedEmbedding, config.privacy.encryptionKey),
        };
      }
      if (config.quantization.enabled && entry.quantizedEmbedding) {
        const { quantized, min, max } = deserializeQuantized(entry.quantizedEmbedding);
        return {
          ...entry,
          embedding: dequantize(quantized, min, max),
        };
      }
      return entry;
    });

    // Find best match
    let bestSimilarity = 0;
    let bestEntry: CacheEntry | null = null;

    for (const entry of processedEntries) {
      const similarity = cosineSimilarity(queryEmbedding, entry.embedding);
      if (similarity >= threshold && similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestEntry = entry;
      }
    }

    if (bestEntry) {
      this.stats.semanticHits++;
      this.thresholdLearner.recordSuccess(queryType, bestSimilarity);
      
      const ageHours = (Date.now() - bestEntry.timestamp) / (1000 * 60 * 60);
      const confidence = calculateConfidence(bestSimilarity, CacheLayer.SEMANTIC_MATCH, originalQuery.length, ageHours);
      
      if (config.privacy.auditEnabled && queryHash) {
        await this.storage.addAuditLog('query', bestEntry.id, queryHash, true, { 
          layer: 'semantic_fallback', 
          similarity: bestSimilarity, 
          hit: true 
        });
      }
      
      return {
        hit: true,
        response: bestEntry.response,
        similarity: bestSimilarity,
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
    this.stats.misses++;
    this.thresholdLearner.recordFailure(queryType, threshold);
    
    if (config.privacy.auditEnabled && queryHash) {
      await this.storage.addAuditLog('query', undefined, queryHash, false, { layer: 'semantic', hit: false, threshold });
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
    await this.ensureInitialized();

    // Store in L1/L2 KV cache for fast lookup
    await this.kvCache.set(`exact:${query}`, response);
    
    const normalizedQueryStr = normalizeQuery(query);
    if (normalizedQueryStr !== query) {
      await this.kvCache.set(`norm:${normalizedQueryStr}`, response);
    }
    
    // Add to clustering analysis
    this.queryClusterer.addQuery(query);

    // Generate embedding
    const embedding = await this.embeddings.generateEmbedding(query);

    const entry: CacheEntry = {
      id: randomUUID(),
      query,
      response,
      embedding,
      timestamp: Date.now(),
      metadata,
    };

    // Quantize embedding if enabled
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

    // Store in persistent storage
    await this.storage.insertEntry(entry, quantizedBuffer, encryptedBuffer, encryptionMetadata);
    
    // Add to vector store for semantic search
    await this.vectorStore.addVector(entry.id, embedding, { query, timestamp: entry.timestamp });

    // Add audit log
    if (config.privacy.auditEnabled) {
      const queryHash = hash(query);
      await this.storage.addAuditLog('store', entry.id, queryHash, true, { encrypted: !!encryptedBuffer });
    }

    // Prune cache if needed
    await this.storage.pruneCache(config.cache.maxSize);

    return entry;
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    await this.ensureInitialized();

    const storageStats = await this.storage.getStats();
    const vectorSize = await this.vectorStore.size();
    const kvSize = await this.kvCache.size();
    
    const { exactHits, normalizedHits, semanticHits, misses } = this.stats;
    const totalQueries = exactHits + normalizedHits + semanticHits + misses;

    return {
      ...storageStats,
      embeddingCache: this.embeddings.getCacheStats(),
      exactMatchCache: {
        hits: exactHits,
        misses: misses,
        size: kvSize,
        hitRate: totalQueries > 0 ? exactHits / totalQueries : 0,
      },
      normalizedCache: {
        size: kvSize,
      },
      vectorStore: {
        size: vectorSize,
      },
      smartMatching: {
        thresholdLearning: this.thresholdLearner.getAllStats(),
        clustering: this.queryClusterer.getStats(),
      },
      backends: {
        storage: this.storageConfig.storage,
        vectorStore: this.storageConfig.vectorStore,
        distributed: this.storageConfig.storage === 'redis',
      },
    };
  }

  /**
   * Clear all caches
   */
  async clearCache(): Promise<void> {
    await this.ensureInitialized();

    if (config.privacy.auditEnabled) {
      await this.storage.addAuditLog('clear_cache', undefined, undefined, true);
    }
    
    await Promise.all([
      this.storage.clearCache(),
      this.vectorStore.clear(),
      this.kvCache.clear(),
    ]);
    
    this.embeddings.clearCache();
    this.stats = { exactHits: 0, normalizedHits: 0, semanticHits: 0, misses: 0 };
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
   * Get audit logs
   */
  async getAuditLogs(limit?: number, action?: string) {
    if (!config.privacy.auditEnabled) {
      throw new Error('Audit logging is not enabled');
    }
    return this.storage.getAuditLogs(limit, action);
  }

  /**
   * Clear old audit logs
   */
  async clearOldAuditLogs(daysToKeep?: number) {
    if (!config.privacy.auditEnabled) {
      throw new Error('Audit logging is not enabled');
    }
    await this.storage.clearOldAuditLogs(daysToKeep || config.privacy.auditRetentionDays);
  }

  /**
   * Health check
   */
  async isHealthy(): Promise<boolean> {
    const health = await this.storageManager.isHealthy();
    return health.overall;
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await this.storageManager.close();
    this.initialized = false;
  }

  /**
   * Get the storage configuration
   */
  getStorageConfig(): StorageConfig {
    return this.storageConfig;
  }
}
