/**
 * SDK Type Definitions
 */

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * SDK configuration options
 */
export interface SemanticCacheConfig {
  /** Base URL of the cache API (e.g., 'http://localhost:3000') */
  baseUrl: string;
  
  /** API key for authentication */
  apiKey?: string;
  
  /** Admin API key for privileged operations (optional) */
  adminApiKey?: string;
  
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
  
  /** Retry configuration */
  retry?: {
    /** Maximum number of retries (default: 3) */
    maxRetries?: number;
    /** Base delay between retries in ms (default: 1000) */
    baseDelay?: number;
  };
}

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Query request options
 */
export interface QueryOptions {
  /** Custom similarity threshold (0-1, default: 0.85) */
  threshold?: number;
}

/**
 * Store request options
 */
export interface StoreOptions {
  /** Optional metadata to store with the entry */
  metadata?: Record<string, unknown>;
}

/**
 * Confidence level for cache matches
 */
export type ConfidenceLevel = 'exact' | 'very_high' | 'high' | 'medium' | 'low' | 'none';

/**
 * Query response from the cache
 */
export interface CacheQueryResponse {
  /** Whether a cache hit was found */
  hit: boolean;
  
  /** The cached response (if hit) */
  response?: string;
  
  /** Similarity score (0-1) */
  similarity?: number;
  
  /** Source of the match */
  source?: 'exact' | 'normalized' | 'semantic';
  
  /** Confidence information */
  confidence?: {
    level: ConfidenceLevel;
    score: number;
    explanation: string;
  };
  
  /** Matched query (if different from input) */
  matchedQuery?: string;
}

/**
 * Stored cache entry
 */
export interface CacheEntry {
  /** Unique entry ID */
  id: string;
  
  /** Original query */
  query: string;
  
  /** Stored response */
  response: string;
  
  /** Creation timestamp */
  timestamp: number;
  
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Store response
 */
export interface CacheStoreResponse {
  /** Whether the store was successful */
  success: boolean;
  
  /** The stored entry */
  entry: CacheEntry;
}

// ============================================================================
// Statistics Types
// ============================================================================

/**
 * Basic cache statistics
 */
export interface CacheStats {
  /** Total entries in the cache */
  totalEntries: number;
  
  /** Oldest entry timestamp */
  oldestTimestamp: number | null;
  
  /** Newest entry timestamp */
  newestTimestamp: number | null;
  
  /** Exact match cache stats */
  exactMatchCache: {
    hits: number;
    misses: number;
    size: number;
    capacity: number;
    hitRate: number;
  };
  
  /** Embedding cache stats */
  embeddingCache: {
    hits: number;
    misses: number;
    size: number;
    capacity: number;
    hitRate: number;
  };
}

/**
 * Layer performance information
 */
export interface LayerStats {
  layer: number;
  name: string;
  hits: number;
  hitRate: number;
  percentOfTotalHits: number;
  avgLatencyMs: number;
  size: number;
  capacity: number;
}

/**
 * Comprehensive admin statistics
 */
export interface ComprehensiveStats {
  timestamp: number;
  overview: {
    totalQueries: number;
    cacheHits: number;
    cacheMisses: number;
    overallHitRate: number;
    totalEntriesStored: number;
  };
  layers: {
    exact: {
      name: string;
      type: string;
      complexity: string;
      hits: number;
      misses: number;
      hitRate: number;
      size: number;
      capacity: number;
      avgLatency: string;
    };
    normalized: {
      name: string;
      type: string;
      complexity: string;
      size: number;
      capacity: number;
      avgLatency: string;
      description: string;
    };
    semantic: {
      name: string;
      type: string;
      complexity: string;
      totalEntries: number;
      avgLatency: string;
      description: string;
    };
  };
  smartMatching: Record<string, unknown>;
  embeddingCache: Record<string, unknown>;
  performance: {
    storageEfficiency: string;
    privacyMode: string;
    encryptionEnabled: boolean;
  };
}

/**
 * Flow visualization data
 */
export interface FlowStats {
  flowData: {
    incoming: number;
    layer1: { hit: number; forward: number; hitRate: number };
    layer2: { hit: number; forward: number; hitRate: number };
    layer3: { hit: number; miss: number; hitRate: number };
  };
  visualization: {
    nodes: Array<{ id: string; label: string; value: number }>;
    edges: Array<{ from: string; to: string; value: number }>;
  };
}

// ============================================================================
// Chat Types
// ============================================================================

/**
 * Chat response
 */
export interface ChatResponse {
  /** The response text */
  response?: string;
  
  /** Whether the response was from cache */
  cached: boolean;
  
  /** Similarity score (if cached) */
  similarity?: number;
  
  /** Whether a new response was stored */
  stored?: boolean;
  
  /** Message when no cached response found */
  message?: string;
}

// ============================================================================
// Health Check Types
// ============================================================================

/**
 * Health check response
 */
export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: number;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * API error response
 */
export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
}

/**
 * SDK-specific error class
 */
export class SemanticCacheError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly response?: ApiError
  ) {
    super(message);
    this.name = 'SemanticCacheError';
  }
}
