/**
 * Optimized Semantic Cache Service
 * 
 * Extends SemanticCacheService with injectable optimization pipeline.
 * Allows A/B testing of optimizations without modifying core cache logic.
 */

import type { CacheEntry, CacheQuery, CacheResponse } from '@distributed-semantic-cache/shared';
import { SemanticCacheService } from './cache-service.js';
import { 
  OptimizationPipeline, 
  type OptimizationConfig,
  type OptimizationContext,
  type ScoredCandidate,
  BloomFilterOptimization,
} from './optimizations/index.js';
import { CacheDatabase } from './database.js';
import { EmbeddingsService } from './embeddings.js';
import { normalizeQuery, detectQueryType } from './normalize.js';
import { calculateConfidence, CacheLayer } from './confidence.js';
import { config } from './config.js';
import { hash } from './encryption.js';
import { LRUCache } from './lru-cache.js';
import { ThresholdLearner } from './threshold-learner.js';
import { QueryClusterer } from './query-clusterer.js';
import { quantize, dequantize, deserializeQuantized, serializeQuantized } from './quantization.js';
import { encryptEmbedding, decryptEmbedding, createEncryptionMetadata } from './encryption.js';
import { randomUUID } from 'node:crypto';

interface OptimizedCacheOptions {
  exactMatchCacheSize?: number;
  optimizations?: OptimizationPipeline;
  optimizationConfig?: Partial<OptimizationConfig>;
}

export class OptimizedCacheService {
  private db: CacheDatabase;
  private embeddings: EmbeddingsService;
  private exactMatchCache: LRUCache<string, string>;
  private exactMatchStats: { hits: number; misses: number };
  private thresholdLearner: ThresholdLearner;
  private queryClusterer: QueryClusterer;
  private normalizedCache: LRUCache<string, string>;
  
  private pipeline: OptimizationPipeline | null;
  private recentEmbeddings: number[][] = [];
  private maxRecentEmbeddings = 5;

  constructor(options?: OptimizedCacheOptions) {
    this.db = new CacheDatabase();
    this.embeddings = new EmbeddingsService();
    this.exactMatchCache = new LRUCache<string, string>(
      options?.exactMatchCacheSize ?? config.cache.exactMatchSize
    );
    this.normalizedCache = new LRUCache<string, string>(
      options?.exactMatchCacheSize ?? config.cache.exactMatchSize
    );
    this.exactMatchStats = { hits: 0, misses: 0 };
    this.thresholdLearner = new ThresholdLearner();
    this.queryClusterer = new QueryClusterer();

    // Initialize optimization pipeline
    if (options?.optimizations) {
      this.pipeline = options.optimizations;
    } else if (options?.optimizationConfig) {
      this.pipeline = OptimizationPipeline.createDefault(options.optimizationConfig);
    } else {
      // By default, no optimizations (matches original behavior)
      this.pipeline = null;
    }

    // Pre-populate bloom filter with existing entries
    this.initializeBloomFilter();
  }

  /**
   * Pre-populate bloom filter from existing database entries
   */
  private initializeBloomFilter(): void {
    if (!this.pipeline) return;

    const bloomFilter = this.pipeline.get<BloomFilterOptimization>('bloom-filter');
    if (!bloomFilter || !bloomFilter.enabled) return;

    // Get all existing entries from database
    const entries = this.db.getAllEntries();
    
    for (const entry of entries) {
      bloomFilter.add(entry.query);
      const normalized = normalizeQuery(entry.query);
      if (normalized !== entry.query) {
        bloomFilter.add(normalized);
      }
    }

    console.log(`[BloomFilter] Pre-populated with ${entries.length} existing entries`);
  }

  /**
   * Enable/disable optimization pipeline
   */
  setOptimizationPipeline(pipeline: OptimizationPipeline | null): void {
    this.pipeline = pipeline;
  }

  /**
   * Get optimization pipeline
   */
  getOptimizationPipeline(): OptimizationPipeline | null {
    return this.pipeline;
  }

  /**
   * Query the cache with optimization support
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
        this.db.addAuditLog('query', undefined, queryHash, true, { layer: 'exact_match', hit: true });
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
        this.db.addAuditLog('query', undefined, queryHash, true, { layer: 'normalized_match', hit: true });
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

    // Generate embedding for semantic search
    const queryEmbedding = await this.embeddings.generateEmbedding(originalQuery);

    // Build optimization context
    const optimizationContext: OptimizationContext = {
      query: originalQuery,
      normalizedQuery,
      queryEmbedding,
      threshold,
      recentEmbeddings: this.recentEmbeddings,
    };

    // Run pre-search optimizations
    let shouldSkipVectorSearch = false;
    let expandedEmbeddings: number[][] = [queryEmbedding];
    let shouldRejectFn: ((candidate: ScoredCandidate) => boolean) | undefined;

    if (this.pipeline) {
      const preResult = await this.pipeline.runPreSearch(optimizationContext);
      
      if (preResult.definitelyNotInCache) {
        shouldSkipVectorSearch = true;
      }
      
      if (preResult.expandedEmbeddings && preResult.expandedEmbeddings.length > 0) {
        expandedEmbeddings = [...expandedEmbeddings, ...preResult.expandedEmbeddings];
      }
      
      if (preResult.shouldReject) {
        shouldRejectFn = preResult.shouldReject;
      }
    }

    // If bloom filter says definitely not in cache, skip vector search
    if (shouldSkipVectorSearch) {
      this.thresholdLearner.recordFailure(queryType, threshold);
      
      if (config.privacy.auditEnabled && queryHash) {
        this.db.addAuditLog('query', undefined, queryHash, false, { layer: 'bloom_filter', hit: false });
      }
      
      // Track for context
      this.trackRecentEmbedding(queryEmbedding);
      
      return { hit: false, cached: false };
    }

    // Layer 3: Semantic search with all embeddings (original + expanded)
    const entries = this.db.getAllEntries();
    
    // Process entries (decrypt/dequantize)
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

    // Find matches with all embeddings
    const sharedModule = await import('@distributed-semantic-cache/shared');
    const findMostSimilarFn = (sharedModule as any).findMostSimilar ?? 
                              (sharedModule as any).default?.findMostSimilar;

    let allCandidates: ScoredCandidate[] = [];

    for (const embedding of expandedEmbeddings) {
      const match = findMostSimilarFn?.(embedding, processedEntries, threshold);
      if (match) {
        // Check if we already have this entry
        const existing = allCandidates.find(c => c.id === match.item.id);
        if (!existing) {
          allCandidates.push({
            id: match.item.id,
            query: match.item.query,
            response: match.item.response,
            similarity: match.similarity,
            embedding: match.item.embedding,
            timestamp: match.item.timestamp,
          });
        } else if (match.similarity > existing.similarity) {
          existing.similarity = match.similarity;
        }
      }
    }

    // Apply rejection filter from negative mining
    if (shouldRejectFn && allCandidates.length > 0) {
      allCandidates = allCandidates.filter(c => !shouldRejectFn!(c));
    }

    // Run post-search optimizations (reranking)
    if (this.pipeline && allCandidates.length > 0) {
      allCandidates = await this.pipeline.runPostSearch(optimizationContext, allCandidates);
    }

    // Sort by similarity and get best match
    allCandidates.sort((a, b) => b.similarity - a.similarity);
    const bestMatch = allCandidates[0];

    // Track for context
    this.trackRecentEmbedding(queryEmbedding);

    if (bestMatch && bestMatch.similarity >= threshold) {
      this.thresholdLearner.recordSuccess(queryType, bestMatch.similarity);
      
      const ageHours = (Date.now() - bestMatch.timestamp) / (1000 * 60 * 60);
      const confidence = calculateConfidence(bestMatch.similarity, CacheLayer.SEMANTIC_MATCH, originalQuery.length, ageHours);
      
      if (config.privacy.auditEnabled && queryHash) {
        this.db.addAuditLog('query', bestMatch.id, queryHash, true, { 
          layer: 'semantic', 
          similarity: bestMatch.similarity, 
          hit: true,
          optimized: !!this.pipeline,
        });
      }
      
      return {
        hit: true,
        response: bestMatch.response,
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

    // No match found
    this.thresholdLearner.recordFailure(queryType, threshold);
    
    if (config.privacy.auditEnabled && queryHash) {
      this.db.addAuditLog('query', undefined, queryHash, false, { 
        layer: 'semantic', 
        hit: false, 
        threshold,
        optimized: !!this.pipeline,
      });
    }

    return { hit: false, cached: false };
  }

  /**
   * Store a query-response pair with optimization tracking
   */
  async store(query: string, response: string, metadata?: Record<string, any>): Promise<CacheEntry> {
    // Store in exact match cache
    this.exactMatchCache.set(query, response);
    
    // Store in normalized cache
    const normalizedQuery = normalizeQuery(query);
    if (normalizedQuery !== query) {
      this.normalizedCache.set(normalizedQuery, response);
    }
    
    // Update bloom filter if present
    if (this.pipeline) {
      const bloomFilter = this.pipeline.get<BloomFilterOptimization>('bloom-filter');
      if (bloomFilter) {
        bloomFilter.add(query);
        bloomFilter.add(normalizedQuery);
      }
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

    // Quantize if enabled
    let quantizedBuffer: Buffer | undefined;
    if (config.quantization.enabled) {
      const quantized = quantize(embedding);
      quantizedBuffer = serializeQuantized(quantized);
    }

    // Encrypt if strict privacy
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

    if (config.privacy.auditEnabled) {
      const queryHash = hash(query);
      this.db.addAuditLog('store', entry.id, queryHash, true, { encrypted: !!encryptedBuffer });
    }

    this.db.pruneCache(config.cache.maxSize);

    return entry;
  }

  /**
   * Record feedback for learning optimizations
   */
  recordFeedback(wasHelpful: boolean, query: string, responseId?: string): void {
    if (this.pipeline) {
      const context: OptimizationContext = {
        query,
        normalizedQuery: normalizeQuery(query),
        queryEmbedding: [], // We don't have it here
        threshold: 0.8,
        responseId,
      };
      this.pipeline.recordFeedback(wasHelpful, context);
    }
  }

  /**
   * Get statistics including optimization stats
   */
  getStats() {
    const exactCacheStats = this.exactMatchCache.getStats();
    const normalizedCacheStats = this.normalizedCache.getStats();
    
    const baseStats = {
      ...this.db.getStats(),
      embeddingCache: this.embeddings.getCacheStats(),
      exactMatchCache: {
        hits: this.exactMatchStats.hits,
        misses: this.exactMatchStats.misses,
        size: exactCacheStats.size,
        capacity: exactCacheStats.capacity,
        hitRate: (this.exactMatchStats.hits + this.exactMatchStats.misses) > 0
          ? this.exactMatchStats.hits / (this.exactMatchStats.hits + this.exactMatchStats.misses)
          : 0,
      },
      normalizedCache: {
        size: normalizedCacheStats.size,
        capacity: normalizedCacheStats.capacity,
      },
      smartMatching: {
        thresholdLearning: this.thresholdLearner.getAllStats(),
        clustering: this.queryClusterer.getStats(),
      },
    };

    if (this.pipeline) {
      return {
        ...baseStats,
        optimizations: this.pipeline.getStats(),
      };
    }

    return baseStats;
  }

  /**
   * Get optimization-specific stats
   */
  getOptimizationStats() {
    return this.pipeline?.getStats() ?? null;
  }

  /**
   * Clear all caches
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
    this.recentEmbeddings = [];
    this.pipeline?.reset();
  }

  /**
   * Close connections
   */
  close(): void {
    this.db.close();
  }

  // --- Private helpers ---

  private trackRecentEmbedding(embedding: number[]): void {
    this.recentEmbeddings.push(embedding);
    if (this.recentEmbeddings.length > this.maxRecentEmbeddings) {
      this.recentEmbeddings.shift();
    }
  }
}
