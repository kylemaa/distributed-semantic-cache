/**
 * Fluent Builder for SemanticCache
 * 
 * Provides a chainable API for configuring the cache client.
 * 
 * @module builder
 */

import { SemanticCache } from './client.js';
import type { SemanticCacheConfig } from './types.js';

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
}

/**
 * Fluent builder for creating SemanticCache instances
 * 
 * @example
 * ```typescript
 * import { SemanticCacheBuilder } from '@distributed-semantic-cache/sdk';
 * 
 * const cache = new SemanticCacheBuilder()
 *   .withBaseUrl('http://localhost:3000')
 *   .withApiKey(process.env.API_KEY)
 *   .withAdminKey(process.env.ADMIN_KEY)
 *   .withTimeout(10000)
 *   .withRetries(5, 500)
 *   .build();
 * ```
 */
export class SemanticCacheBuilder {
  private config: Partial<SemanticCacheConfig> = {};

  /**
   * Set the base URL for the cache API
   */
  withBaseUrl(url: string): this {
    this.config.baseUrl = url;
    return this;
  }

  /**
   * Set the API key for authentication
   */
  withApiKey(key: string | undefined): this {
    this.config.apiKey = key;
    return this;
  }

  /**
   * Set the admin API key for privileged operations
   */
  withAdminKey(key: string | undefined): this {
    this.config.adminApiKey = key;
    return this;
  }

  /**
   * Set the request timeout in milliseconds
   */
  withTimeout(ms: number): this {
    this.config.timeout = ms;
    return this;
  }

  /**
   * Add custom headers to all requests
   */
  withHeaders(headers: Record<string, string>): this {
    this.config.headers = { ...this.config.headers, ...headers };
    return this;
  }

  /**
   * Add a single custom header
   */
  withHeader(key: string, value: string): this {
    this.config.headers = { ...this.config.headers, [key]: value };
    return this;
  }

  /**
   * Configure retry behavior
   */
  withRetries(maxRetries: number, baseDelay?: number): this {
    this.config.retry = {
      maxRetries,
      baseDelay: baseDelay ?? 1000,
    };
    return this;
  }

  /**
   * Set complete retry configuration
   */
  withRetryConfig(retry: RetryConfig): this {
    this.config.retry = retry;
    return this;
  }

  /**
   * Disable retries
   */
  withoutRetries(): this {
    this.config.retry = { maxRetries: 0 };
    return this;
  }

  /**
   * Set tenant ID for multi-tenant environments
   */
  withTenantId(tenantId: string): this {
    return this.withHeader('x-tenant-id', tenantId);
  }

  /**
   * Set request ID for tracing
   */
  withRequestId(requestId: string): this {
    return this.withHeader('x-request-id', requestId);
  }

  /**
   * Configure from environment variables
   * 
   * Reads: CACHE_API_URL, CACHE_API_KEY, CACHE_ADMIN_KEY, CACHE_TIMEOUT
   */
  fromEnvironment(): this {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.CACHE_API_URL) {
        this.config.baseUrl = process.env.CACHE_API_URL;
      }
      if (process.env.CACHE_API_KEY) {
        this.config.apiKey = process.env.CACHE_API_KEY;
      }
      if (process.env.CACHE_ADMIN_KEY) {
        this.config.adminApiKey = process.env.CACHE_ADMIN_KEY;
      }
      if (process.env.CACHE_TIMEOUT) {
        this.config.timeout = parseInt(process.env.CACHE_TIMEOUT, 10);
      }
    }
    return this;
  }

  /**
   * Apply a preset configuration
   */
  withPreset(preset: 'development' | 'production' | 'testing'): this {
    switch (preset) {
      case 'development':
        return this
          .withBaseUrl('http://localhost:3000')
          .withTimeout(30000)
          .withRetries(3, 1000);
      
      case 'production':
        return this
          .withTimeout(10000)
          .withRetries(5, 500);
      
      case 'testing':
        return this
          .withTimeout(5000)
          .withoutRetries();
    }
  }

  /**
   * Validate the configuration
   * @throws Error if configuration is invalid
   */
  validate(): this {
    if (!this.config.baseUrl) {
      throw new Error('baseUrl is required. Use withBaseUrl() or fromEnvironment()');
    }
    return this;
  }

  /**
   * Build the SemanticCache instance
   * @throws Error if required configuration is missing
   */
  build(): SemanticCache {
    this.validate();
    return new SemanticCache(this.config as SemanticCacheConfig);
  }

  /**
   * Get the current configuration (for debugging)
   */
  getConfig(): Partial<SemanticCacheConfig> {
    return { ...this.config };
  }
}

/**
 * Start building a SemanticCache with the fluent builder
 * 
 * @example
 * ```typescript
 * import { buildCache } from '@distributed-semantic-cache/sdk';
 * 
 * const cache = buildCache()
 *   .fromEnvironment()
 *   .withPreset('production')
 *   .build();
 * ```
 */
export function buildCache(): SemanticCacheBuilder {
  return new SemanticCacheBuilder();
}
