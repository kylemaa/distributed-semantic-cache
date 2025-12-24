/**
 * Storage Backend Abstraction Layer
 * 
 * Provides a unified interface for different storage backends:
 * - SQLite (default, single-node)
 * - Redis (distributed L1/L2 cache)
 * - PostgreSQL (enterprise deployments)
 * 
 * This abstraction enables horizontal scaling while maintaining
 * backward compatibility with the existing SQLite implementation.
 */

import type { CacheEntry } from '@distributed-semantic-cache/shared';

// ============================================================================
// STORAGE INTERFACES
// ============================================================================

/**
 * Entry with optional encrypted/quantized embeddings
 */
export interface StoredCacheEntry extends CacheEntry {
  quantizedEmbedding?: Buffer;
  encryptedEmbedding?: Buffer;
  encryptionMetadata?: string;
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id?: number | string;
  timestamp: number;
  action: string;
  entryId?: string;
  queryHash?: string;
  success: boolean;
  metadata?: any;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalEntries: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
}

/**
 * Base storage interface for cache entries
 * Implementations: SQLiteStorage, RedisStorage, PostgresStorage
 */
export interface ICacheStorage {
  /**
   * Initialize the storage (create tables, connect, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Insert a new cache entry
   */
  insertEntry(
    entry: CacheEntry,
    quantizedEmbedding?: Buffer,
    encryptedEmbedding?: Buffer,
    encryptionMetadata?: string
  ): Promise<void>;

  /**
   * Get all cache entries (for semantic search)
   * For large datasets, prefer using a vector store
   */
  getAllEntries(): Promise<StoredCacheEntry[]>;

  /**
   * Get entry by ID
   */
  getEntryById(id: string): Promise<CacheEntry | null>;

  /**
   * Get entry by exact query match (L1 cache)
   */
  getEntryByQuery(query: string): Promise<CacheEntry | null>;

  /**
   * Delete oldest entries to maintain cache size
   */
  pruneCache(maxSize: number): Promise<void>;

  /**
   * Clear all entries
   */
  clearCache(): Promise<void>;

  /**
   * Get cache statistics
   */
  getStats(): Promise<CacheStats>;

  /**
   * Add audit log entry
   */
  addAuditLog(
    action: string,
    entryId?: string,
    queryHash?: string,
    success?: boolean,
    metadata?: any
  ): Promise<void>;

  /**
   * Get audit logs
   */
  getAuditLogs(limit?: number, action?: string): Promise<AuditLogEntry[]>;

  /**
   * Clear old audit logs
   */
  clearOldAuditLogs(daysToKeep?: number): Promise<void>;

  /**
   * Close connection
   */
  close(): Promise<void>;

  /**
   * Health check
   */
  isHealthy(): Promise<boolean>;
}

// ============================================================================
// VECTOR STORE INTERFACE
// ============================================================================

/**
 * Search result from vector store
 */
export interface VectorSearchResult {
  id: string;
  similarity: number;
  entry?: CacheEntry;
}

/**
 * Vector store interface for semantic search
 * Implementations: InMemoryHNSW, QdrantVectorStore, PgVectorStore
 */
export interface IVectorStore {
  /**
   * Initialize the vector store
   */
  initialize(): Promise<void>;

  /**
   * Add a vector to the index
   */
  addVector(id: string, vector: number[], metadata?: Record<string, any>): Promise<void>;

  /**
   * Search for similar vectors
   */
  search(query: number[], k: number, threshold?: number): Promise<VectorSearchResult[]>;

  /**
   * Delete a vector by ID
   */
  deleteVector(id: string): Promise<void>;

  /**
   * Clear all vectors
   */
  clear(): Promise<void>;

  /**
   * Get the number of vectors in the index
   */
  size(): Promise<number>;

  /**
   * Close connection
   */
  close(): Promise<void>;

  /**
   * Health check
   */
  isHealthy(): Promise<boolean>;
}

// ============================================================================
// KEY-VALUE CACHE INTERFACE (for L1/L2 fast path)
// ============================================================================

/**
 * Fast key-value cache interface for L1/L2 layers
 * Implementations: InMemoryKVCache, RedisKVCache
 */
export interface IKVCache {
  /**
   * Get value by key
   */
  get(key: string): Promise<string | null>;

  /**
   * Set value with optional TTL
   */
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;

  /**
   * Delete key
   */
  delete(key: string): Promise<void>;

  /**
   * Check if key exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Clear all entries
   */
  clear(): Promise<void>;

  /**
   * Get cache size
   */
  size(): Promise<number>;

  /**
   * Close connection
   */
  close(): Promise<void>;
}

// ============================================================================
// STORAGE FACTORY
// ============================================================================

export type StorageBackend = 'sqlite' | 'redis' | 'postgres';
export type VectorBackend = 'hnsw' | 'qdrant' | 'pgvector';

export interface StorageConfig {
  // Cache storage backend
  storage: StorageBackend;
  
  // Vector store backend
  vectorStore: VectorBackend;
  
  // SQLite config
  sqlite?: {
    path: string;
  };
  
  // Redis config
  redis?: {
    url: string;
    keyPrefix?: string;
    ttlSeconds?: number;
  };
  
  // PostgreSQL config
  postgres?: {
    connectionString: string;
    schema?: string;
  };
  
  // Qdrant config
  qdrant?: {
    url: string;
    collectionName?: string;
    apiKey?: string;
  };
}

/**
 * Default configuration for backward compatibility
 */
export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  storage: 'sqlite',
  vectorStore: 'hnsw',
  sqlite: {
    path: 'cache.db',
  },
};

// Factory functions will be implemented in separate files
// to avoid circular dependencies and allow tree-shaking
