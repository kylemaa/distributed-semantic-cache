/**
 * Configuration management
 */

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  api: {
    port: parseInt(process.env.API_PORT || '3000', 10),
    host: process.env.API_HOST || 'localhost',
  },
  database: {
    // Use getter to read DATABASE_PATH dynamically (important for tests)
    get path() {
      return process.env.DATABASE_PATH || './cache.db';
    },
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  },
  cache: {
    similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD || '0.85'),
    // Use getter to read MAX_CACHE_SIZE dynamically (important for tests)
    get maxSize() {
      return parseInt(process.env.MAX_CACHE_SIZE || '1000', 10);
    },
    // LRU cache size for exact string matching (Layer 1 cache)
    get exactMatchSize() {
      return parseInt(process.env.EXACT_MATCH_CACHE_SIZE || '1000', 10);
    },
  },
  embeddings: {
    // Embedding provider: 'openai' or 'local'
    get provider() {
      return (process.env.EMBEDDING_PROVIDER || 'openai') as 'openai' | 'local';
    },
    // Local model to use when provider=local
    get localModel() {
      return (process.env.LOCAL_EMBEDDING_MODEL || 'all-MiniLM-L6-v2') as 'all-MiniLM-L6-v2' | 'all-mpnet-base-v2' | 'e5-small-v2';
    },
    // LRU cache size for embedding reuse
    get cacheSize() {
      return parseInt(process.env.EMBEDDING_CACHE_SIZE || '500', 10);
    },
  },
  quantization: {
    // Enable vector quantization for storage reduction
    get enabled() {
      return process.env.ENABLE_QUANTIZATION !== 'false';
    },
  },
  privacy: {
    // Privacy mode: 'strict' (encrypt + no logs), 'normal' (no encryption), 'off' (no privacy features)
    get mode() {
      return (process.env.PRIVACY_MODE || 'normal') as 'strict' | 'normal' | 'off';
    },
    // Encryption key for embeddings at rest (required if mode=strict)
    get encryptionKey() {
      return process.env.ENCRYPTION_KEY || '';
    },
    // Enable audit logging
    get auditEnabled() {
      return process.env.AUDIT_ENABLED !== 'false';
    },
    // Days to keep audit logs
    get auditRetentionDays() {
      return parseInt(process.env.AUDIT_RETENTION_DAYS || '30', 10);
    },
    // Disable analytics/stats collection in strict mode
    get disableAnalytics() {
      return this.mode === 'strict' || process.env.DISABLE_ANALYTICS === 'true';
    },
  },
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:5174'],
  },
  
  // ============================================================================
  // SCALE CONFIGURATION (P0: Horizontal Scaling)
  // ============================================================================
  storage: {
    // Storage backend: 'sqlite' (default), 'redis', 'postgres'
    get backend() {
      return (process.env.CACHE_STORAGE || 'sqlite') as 'sqlite' | 'redis' | 'postgres';
    },
    // Vector store backend: 'hnsw' (default), 'qdrant', 'pgvector'
    get vectorStore() {
      return (process.env.VECTOR_STORE || 'hnsw') as 'hnsw' | 'qdrant' | 'pgvector';
    },
  },
  
  redis: {
    // Redis connection URL (required if storage.backend=redis)
    get url() {
      return process.env.REDIS_URL || 'redis://localhost:6379';
    },
    // Key prefix for Redis keys
    get keyPrefix() {
      return process.env.REDIS_PREFIX || 'dsc:';
    },
    // TTL for cached entries in seconds (0 = no expiry)
    get ttlSeconds() {
      const ttl = process.env.REDIS_TTL;
      return ttl ? parseInt(ttl, 10) : undefined;
    },
  },
  
  postgres: {
    // PostgreSQL connection string (required if storage.backend=postgres)
    get connectionString() {
      return process.env.POSTGRES_URL || '';
    },
    // Schema name for tables
    get schema() {
      return process.env.POSTGRES_SCHEMA || 'semantic_cache';
    },
  },
  
  qdrant: {
    // Qdrant server URL (required if storage.vectorStore=qdrant)
    get url() {
      return process.env.QDRANT_URL || 'http://localhost:6333';
    },
    // Collection name
    get collectionName() {
      return process.env.QDRANT_COLLECTION || 'semantic_cache';
    },
    // API key for Qdrant Cloud
    get apiKey() {
      return process.env.QDRANT_API_KEY || '';
    },
  },
  
  // ============================================================================
  // SECURITY CONFIGURATION
  // ============================================================================
  security: {
    // API key for authentication (required in production)
    get apiKey() {
      return process.env.API_KEY || '';
    },
    // Admin API key for privileged operations (optional, falls back to apiKey)
    get adminApiKey() {
      return process.env.ADMIN_API_KEY || this.apiKey;
    },
    // Enable authentication (disable for local development)
    get authEnabled() {
      return process.env.AUTH_ENABLED !== 'false';
    },
    // Rate limiting
    rateLimit: {
      get max() {
        return parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
      },
      get timeWindow() {
        return process.env.RATE_LIMIT_WINDOW || '1 minute';
      },
    },
    // Request body size limit
    get bodyLimit() {
      return parseInt(process.env.BODY_LIMIT || '1048576', 10); // 1MB default
    },
  },
};
