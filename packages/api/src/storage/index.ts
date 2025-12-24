/**
 * Storage Factory
 * 
 * Creates storage backends based on configuration.
 * Provides a unified interface for initializing all storage components.
 */

import type {
  ICacheStorage,
  IVectorStore,
  IKVCache,
  StorageConfig,
  StorageBackend,
  VectorBackend,
} from './interfaces.js';
import { SQLiteStorage } from './sqlite-storage.js';
import { InMemoryKVCache } from './memory-cache.js';
import { InMemoryVectorStore } from './qdrant-store.js';

/**
 * Storage manager that provides access to all storage components
 */
export class StorageManager {
  private cacheStorage: ICacheStorage;
  private vectorStore: IVectorStore;
  private kvCache: IKVCache;
  private config: StorageConfig;
  private initialized: boolean = false;

  constructor(config: StorageConfig) {
    this.config = config;
    
    // Create instances based on config
    this.cacheStorage = this.createCacheStorage(config.storage);
    this.vectorStore = this.createVectorStore(config.vectorStore);
    this.kvCache = this.createKVCache(config.storage);
  }

  private createCacheStorage(backend: StorageBackend): ICacheStorage {
    switch (backend) {
      case 'sqlite':
        return new SQLiteStorage({
          path: this.config.sqlite?.path || 'cache.db',
        });
      
      case 'redis':
        // Lazy import to avoid requiring ioredis if not used
        const { RedisStorage } = require('./redis-storage.js');
        return new RedisStorage({
          url: this.config.redis?.url || 'redis://localhost:6379',
          keyPrefix: this.config.redis?.keyPrefix,
          ttlSeconds: this.config.redis?.ttlSeconds,
        });
      
      case 'postgres':
        // Lazy import to avoid requiring pg if not used
        const { PostgresStorage } = require('./postgres-storage.js');
        return new PostgresStorage({
          connectionString: this.config.postgres?.connectionString || '',
          schema: this.config.postgres?.schema,
        });
      
      default:
        throw new Error(`Unknown storage backend: ${backend}`);
    }
  }

  private createVectorStore(backend: VectorBackend): IVectorStore {
    switch (backend) {
      case 'hnsw':
        // Use in-memory vector store (wraps existing HNSW)
        return new InMemoryVectorStore(384);
      
      case 'qdrant':
        // Lazy import to avoid requiring @qdrant/js-client-rest if not used
        const { QdrantVectorStore } = require('./qdrant-store.js');
        return new QdrantVectorStore({
          url: this.config.qdrant?.url || 'http://localhost:6333',
          collectionName: this.config.qdrant?.collectionName,
          apiKey: this.config.qdrant?.apiKey,
        });
      
      case 'pgvector':
        // Lazy import to avoid requiring pg if not used
        const { PgVectorStore } = require('./postgres-storage.js');
        return new PgVectorStore({
          connectionString: this.config.postgres?.connectionString || '',
          schema: this.config.postgres?.schema,
        });
      
      default:
        throw new Error(`Unknown vector store backend: ${backend}`);
    }
  }

  private createKVCache(backend: StorageBackend): IKVCache {
    if (backend === 'redis' && this.config.redis) {
      // Use Redis for distributed L1/L2 cache
      const { RedisKVCache } = require('./redis-storage.js');
      const cache = new RedisKVCache({
        url: this.config.redis.url,
        keyPrefix: this.config.redis.keyPrefix,
        ttlSeconds: this.config.redis.ttlSeconds,
      });
      return cache;
    }
    
    // Default to in-memory for SQLite/Postgres
    return new InMemoryKVCache(1000);
  }

  /**
   * Initialize all storage components
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await Promise.all([
      this.cacheStorage.initialize(),
      this.vectorStore.initialize(),
    ]);

    // Initialize KV cache if it has an initialize method
    if ('initialize' in this.kvCache && typeof (this.kvCache as any).initialize === 'function') {
      await (this.kvCache as any).initialize();
    }

    this.initialized = true;
  }

  /**
   * Get cache storage instance
   */
  getCacheStorage(): ICacheStorage {
    return this.cacheStorage;
  }

  /**
   * Get vector store instance
   */
  getVectorStore(): IVectorStore {
    return this.vectorStore;
  }

  /**
   * Get KV cache instance
   */
  getKVCache(): IKVCache {
    return this.kvCache;
  }

  /**
   * Check health of all storage components
   */
  async isHealthy(): Promise<{ storage: boolean; vector: boolean; overall: boolean }> {
    const [storageHealth, vectorHealth] = await Promise.all([
      this.cacheStorage.isHealthy(),
      this.vectorStore.isHealthy(),
    ]);

    return {
      storage: storageHealth,
      vector: vectorHealth,
      overall: storageHealth && vectorHealth,
    };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    await Promise.all([
      this.cacheStorage.close(),
      this.vectorStore.close(),
      this.kvCache.close(),
    ]);
    this.initialized = false;
  }

  /**
   * Get current configuration
   */
  getConfig(): StorageConfig {
    return this.config;
  }
}

/**
 * Create a storage manager from environment variables
 */
export function createStorageFromEnv(): StorageManager {
  const storageBackend = (process.env.CACHE_STORAGE || 'sqlite') as StorageBackend;
  const vectorBackend = (process.env.VECTOR_STORE || 'hnsw') as VectorBackend;

  const config: StorageConfig = {
    storage: storageBackend,
    vectorStore: vectorBackend,
    
    sqlite: {
      path: process.env.SQLITE_PATH || 'cache.db',
    },
    
    redis: process.env.REDIS_URL ? {
      url: process.env.REDIS_URL,
      keyPrefix: process.env.REDIS_PREFIX || 'dsc:',
      ttlSeconds: process.env.REDIS_TTL ? parseInt(process.env.REDIS_TTL, 10) : undefined,
    } : undefined,
    
    postgres: process.env.POSTGRES_URL ? {
      connectionString: process.env.POSTGRES_URL,
      schema: process.env.POSTGRES_SCHEMA || 'semantic_cache',
    } : undefined,
    
    qdrant: process.env.QDRANT_URL ? {
      url: process.env.QDRANT_URL,
      collectionName: process.env.QDRANT_COLLECTION || 'semantic_cache',
      apiKey: process.env.QDRANT_API_KEY,
    } : undefined,
  };

  return new StorageManager(config);
}

// Re-export interfaces and types
export * from './interfaces.js';
export { SQLiteStorage } from './sqlite-storage.js';
export { InMemoryKVCache } from './memory-cache.js';
export { InMemoryVectorStore } from './qdrant-store.js';

// Conditional exports (require the packages to be installed)
export async function getRedisStorage() {
  return import('./redis-storage.js');
}

export async function getPostgresStorage() {
  return import('./postgres-storage.js');
}

export async function getQdrantStore() {
  return import('./qdrant-store.js');
}
