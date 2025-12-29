/**
 * Semantic Cache SDK Client
 * 
 * Provides a type-safe, easy-to-use interface for interacting with
 * the Distributed Semantic Cache API.
 */

import type {
  SemanticCacheConfig,
  QueryOptions,
  StoreOptions,
  CacheQueryResponse,
  CacheStoreResponse,
  CacheStats,
  ComprehensiveStats,
  LayerStats,
  FlowStats,
  ChatResponse,
  HealthResponse,
  ApiError,
} from './types.js';
import { SemanticCacheError } from './types.js';

/**
 * Semantic Cache SDK Client
 * 
 * @example
 * ```typescript
 * const cache = new SemanticCache({
 *   baseUrl: 'http://localhost:3000',
 *   apiKey: 'your-api-key'
 * });
 * 
 * // Query the cache
 * const result = await cache.query('What is TypeScript?');
 * 
 * // Store a response
 * await cache.store('What is TypeScript?', 'A typed superset of JavaScript.');
 * 
 * // Get stats
 * const stats = await cache.getStats();
 * ```
 */
export class SemanticCache {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly adminApiKey?: string;
  private readonly timeout: number;
  private readonly headers: Record<string, string>;
  private readonly maxRetries: number;
  private readonly baseDelay: number;

  constructor(config: SemanticCacheConfig) {
    // Normalize base URL (remove trailing slash)
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.adminApiKey = config.adminApiKey;
    this.timeout = config.timeout ?? 30000;
    this.headers = config.headers ?? {};
    this.maxRetries = config.retry?.maxRetries ?? 3;
    this.baseDelay = config.retry?.baseDelay ?? 1000;
  }

  // ============================================================================
  // Core Cache Operations
  // ============================================================================

  /**
   * Query the semantic cache for a matching response
   * 
   * @param query - The query to search for
   * @param options - Optional query configuration
   * @returns Cache query response
   * 
   * @example
   * ```typescript
   * const result = await cache.query('What is TypeScript?');
   * if (result.hit) {
   *   console.log('Found:', result.response);
   *   console.log('Similarity:', result.similarity);
   * }
   * ```
   */
  async query(query: string, options?: QueryOptions): Promise<CacheQueryResponse> {
    return this.request<CacheQueryResponse>('/api/cache/query', {
      method: 'POST',
      body: {
        query,
        threshold: options?.threshold,
      },
    });
  }

  /**
   * Store a query-response pair in the cache
   * 
   * @param query - The query to store
   * @param response - The response to cache
   * @param options - Optional store configuration
   * @returns Store response with entry details
   * 
   * @example
   * ```typescript
   * const result = await cache.store(
   *   'What is TypeScript?',
   *   'TypeScript is a typed superset of JavaScript.',
   *   { metadata: { source: 'docs' } }
   * );
   * console.log('Stored entry:', result.entry.id);
   * ```
   */
  async store(query: string, response: string, options?: StoreOptions): Promise<CacheStoreResponse> {
    return this.request<CacheStoreResponse>('/api/cache/store', {
      method: 'POST',
      body: {
        query,
        response,
        metadata: options?.metadata,
      },
    });
  }

  /**
   * Chat endpoint - combines query and optional store
   * 
   * Checks the cache first, and if a response is provided and no cache hit,
   * stores the new response.
   * 
   * @param message - The message/query
   * @param response - Optional response to store if no cache hit
   * @returns Chat response
   * 
   * @example
   * ```typescript
   * // Check cache and store if miss
   * const result = await cache.chat('What is TypeScript?', 'A typed JavaScript.');
   * if (result.cached) {
   *   console.log('From cache:', result.response);
   * } else {
   *   console.log('Stored new response');
   * }
   * ```
   */
  async chat(message: string, response?: string): Promise<ChatResponse> {
    return this.request<ChatResponse>('/api/chat', {
      method: 'POST',
      body: {
        message,
        response,
      },
    });
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Get basic cache statistics
   * 
   * @returns Cache statistics
   * 
   * @example
   * ```typescript
   * const stats = await cache.getStats();
   * console.log('Total entries:', stats.totalEntries);
   * console.log('Hit rate:', stats.exactMatchCache.hitRate);
   * ```
   */
  async getStats(): Promise<CacheStats> {
    return this.request<CacheStats>('/api/cache/stats', {
      method: 'GET',
    });
  }

  /**
   * Get comprehensive admin statistics (requires admin API key)
   * 
   * @returns Comprehensive statistics including all layers
   */
  async getComprehensiveStats(): Promise<ComprehensiveStats> {
    return this.request<ComprehensiveStats>('/api/admin/stats/comprehensive', {
      method: 'GET',
      useAdminKey: true,
    });
  }

  /**
   * Get layer-by-layer performance metrics (requires admin API key)
   * 
   * @returns Layer statistics
   */
  async getLayerStats(): Promise<{ layers: LayerStats[]; summary: Record<string, unknown> }> {
    return this.request<{ layers: LayerStats[]; summary: Record<string, unknown> }>('/api/admin/stats/layers', {
      method: 'GET',
      useAdminKey: true,
    });
  }

  /**
   * Get flow visualization data (requires admin API key)
   * 
   * @returns Flow statistics for visualization
   */
  async getFlowStats(): Promise<FlowStats> {
    return this.request<FlowStats>('/api/admin/stats/flow', {
      method: 'GET',
      useAdminKey: true,
    });
  }

  // ============================================================================
  // Admin Operations
  // ============================================================================

  /**
   * Clear all cache entries (requires admin API key)
   * 
   * ⚠️ This operation cannot be undone!
   * 
   * @returns Success response
   */
  async clearCache(): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>('/api/cache/clear', {
      method: 'DELETE',
      useAdminKey: true,
    });
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  /**
   * Check if the cache API is healthy
   * 
   * @returns Health status
   * 
   * @example
   * ```typescript
   * const health = await cache.healthCheck();
   * if (health.status === 'ok') {
   *   console.log('Cache is healthy');
   * }
   * ```
   */
  async healthCheck(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health', {
      method: 'GET',
      skipAuth: true,
    });
  }

  /**
   * Test the connection and API key
   * 
   * @returns True if connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.healthCheck();
      // If API key is configured, test authenticated endpoint
      if (this.apiKey) {
        await this.getStats();
      }
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Internal Request Handler
  // ============================================================================

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST' | 'DELETE' | 'PATCH';
      body?: Record<string, unknown>;
      useAdminKey?: boolean;
      skipAuth?: boolean;
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers,
    };

    // Add API key if not skipping auth
    if (!options.skipAuth) {
      const key = options.useAdminKey ? (this.adminApiKey || this.apiKey) : this.apiKey;
      if (key) {
        headers['x-api-key'] = key;
      }
    }

    // Retry logic
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method: options.method,
          headers,
          body: options.body ? JSON.stringify(options.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Parse response
        const data = await response.json() as T | ApiError;

        // Check for error responses
        if (!response.ok) {
          const errorData = data as ApiError;
          throw new SemanticCacheError(
            errorData.message || errorData.error || `Request failed with status ${response.status}`,
            response.status,
            errorData
          );
        }

        return data as T;
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on client errors (4xx) or if it's our custom error
        if (error instanceof SemanticCacheError) {
          if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
            throw error;
          }
        }

        // Don't retry on abort (timeout)
        if (error instanceof Error && error.name === 'AbortError') {
          throw new SemanticCacheError(`Request timed out after ${this.timeout}ms`, 408);
        }

        // Wait before retry (exponential backoff)
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new SemanticCacheError('Request failed after retries');
  }
}

/**
 * Create a new SemanticCache client
 * 
 * Factory function for creating a cache client.
 * 
 * @param config - Configuration options
 * @returns SemanticCache instance
 * 
 * @example
 * ```typescript
 * const cache = createSemanticCache({
 *   baseUrl: 'http://localhost:3000',
 *   apiKey: process.env.CACHE_API_KEY
 * });
 * ```
 */
export function createSemanticCache(config: SemanticCacheConfig): SemanticCache {
  return new SemanticCache(config);
}
