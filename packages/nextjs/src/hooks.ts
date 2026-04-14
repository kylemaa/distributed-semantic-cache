'use client';

import { useCallback, useRef, useState } from 'react';
import type {
  CacheQueryResponse,
  CacheStoreResponse,
  CacheStats,
} from '@distributed-semantic-cache/sdk';
import { SemanticCache } from '@distributed-semantic-cache/sdk';
import { useSemanticCacheContext } from './provider.js';

// ---------------------------------------------------------------------------
// useSemanticCache — returns the raw client
// ---------------------------------------------------------------------------

/**
 * Access the `SemanticCache` client from context.
 *
 * @example
 * ```tsx
 * const cache = useSemanticCache();
 * const result = await cache.query('What is React?');
 * ```
 */
export function useSemanticCache(): SemanticCache {
  return useSemanticCacheContext();
}

// ---------------------------------------------------------------------------
// useCachedQuery — query with loading/error state
// ---------------------------------------------------------------------------

export interface UseCachedQueryReturn {
  /** Trigger a cache query */
  query: (text: string, threshold?: number) => Promise<CacheQueryResponse>;
  /** Most recent query result */
  data: CacheQueryResponse | null;
  /** Whether a query is in flight */
  isLoading: boolean;
  /** Last error, if any */
  error: Error | null;
}

/**
 * React hook for querying the semantic cache with loading/error state.
 *
 * @example
 * ```tsx
 * function SearchBox() {
 *   const { query, data, isLoading, error } = useCachedQuery();
 *
 *   const handleSearch = async (text: string) => {
 *     const result = await query(text);
 *     if (result.hit) {
 *       console.log('Cache hit:', result.response);
 *     }
 *   };
 *
 *   return (
 *     <div>
 *       <input onChange={e => handleSearch(e.target.value)} />
 *       {isLoading && <p>Searching cache...</p>}
 *       {data?.hit && <p>Cached: {data.response}</p>}
 *       {error && <p>Error: {error.message}</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function useCachedQuery(): UseCachedQueryReturn {
  const cache = useSemanticCacheContext();
  const [data, setData] = useState<CacheQueryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const seqRef = useRef(0);

  const query = useCallback(
    async (text: string, threshold?: number): Promise<CacheQueryResponse> => {
      const seq = ++seqRef.current;
      setIsLoading(true);
      setError(null);

      try {
        const result = await cache.query(text, { threshold });
        // Only update state if this is still the latest request
        if (seq === seqRef.current) {
          setData(result);
        }
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        if (seq === seqRef.current) {
          setError(e);
        }
        throw e;
      } finally {
        if (seq === seqRef.current) {
          setIsLoading(false);
        }
      }
    },
    [cache],
  );

  return { query, data, isLoading, error };
}

// ---------------------------------------------------------------------------
// useCacheStore — store with loading/error state
// ---------------------------------------------------------------------------

export interface UseCacheStoreReturn {
  /** Store a query-response pair */
  store: (
    query: string,
    response: string,
    metadata?: Record<string, unknown>,
  ) => Promise<CacheStoreResponse>;
  /** Whether a store is in flight */
  isStoring: boolean;
  /** Last error, if any */
  error: Error | null;
}

/**
 * React hook for storing entries in the semantic cache.
 *
 * @example
 * ```tsx
 * function StoreButton() {
 *   const { store, isStoring } = useCacheStore();
 *
 *   return (
 *     <button
 *       disabled={isStoring}
 *       onClick={() => store('What is React?', 'React is a UI library.')}
 *     >
 *       {isStoring ? 'Storing...' : 'Store in cache'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useCacheStore(): UseCacheStoreReturn {
  const cache = useSemanticCacheContext();
  const [isStoring, setIsStoring] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const store = useCallback(
    async (
      queryText: string,
      response: string,
      metadata?: Record<string, unknown>,
    ): Promise<CacheStoreResponse> => {
      setIsStoring(true);
      setError(null);

      try {
        return await cache.store(queryText, response, { metadata });
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsStoring(false);
      }
    },
    [cache],
  );

  return { store, isStoring, error };
}

// ---------------------------------------------------------------------------
// useCacheStats
// ---------------------------------------------------------------------------

export interface UseCacheStatsReturn {
  /** Fetch cache stats */
  refresh: () => Promise<CacheStats>;
  /** Most recent stats */
  stats: CacheStats | null;
  /** Whether fetching */
  isLoading: boolean;
  /** Last error, if any */
  error: Error | null;
}

/**
 * React hook for fetching cache statistics.
 */
export function useCacheStats(): UseCacheStatsReturn {
  const cache = useSemanticCacheContext();
  const [stats, setStats] = useState<CacheStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async (): Promise<CacheStats> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await cache.getStats();
      setStats(result);
      return result;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setIsLoading(false);
    }
  }, [cache]);

  return { refresh, stats, isLoading, error };
}
