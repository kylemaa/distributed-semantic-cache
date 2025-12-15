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
  cors: {
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  },
};
