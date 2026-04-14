/**
 * @distributed-semantic-cache/nextjs
 *
 * Next.js App Router integration for Distributed Semantic Cache.
 *
 * Client-side exports (provider + hooks):
 * ```tsx
 * import { SemanticCacheProvider, useSemanticCache, useCachedQuery } from '@distributed-semantic-cache/nextjs';
 * ```
 *
 * Server-side exports (route handlers + server actions):
 * ```ts
 * import { createCacheHandler, createCacheActions } from '@distributed-semantic-cache/nextjs/server';
 * ```
 */

// Client-side exports
export { SemanticCacheProvider, type SemanticCacheProviderProps } from './provider.js';
export {
  useSemanticCache,
  useCachedQuery,
  useCacheStore,
  useCacheStats,
  type UseCachedQueryReturn,
  type UseCacheStoreReturn,
  type UseCacheStatsReturn,
} from './hooks.js';

// Re-export core SDK types for convenience
export {
  SemanticCache,
  type SemanticCacheConfig,
  type CacheQueryResponse,
  type CacheStoreResponse,
  type CacheStats,
  SemanticCacheError,
} from '@distributed-semantic-cache/sdk';
