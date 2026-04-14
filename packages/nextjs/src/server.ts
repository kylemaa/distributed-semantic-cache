/**
 * Server-side utilities for Next.js App Router.
 *
 * This module provides:
 * - `createCacheHandler` — builds a GET/POST route handler for `/api/cache`
 * - `createCacheActions` — returns typed server actions for use in Server Components
 *
 * @module server
 */

import {
  SemanticCache,
  type SemanticCacheConfig,
  type CacheQueryResponse,
  type CacheStoreResponse,
  type CacheStats,
} from '@distributed-semantic-cache/sdk';

// ---------------------------------------------------------------------------
// Shared singleton
// ---------------------------------------------------------------------------

let _sharedClient: SemanticCache | null = null;

/**
 * Get or create a shared SemanticCache client (server-side singleton).
 * Avoids creating multiple connections across server actions / route handlers.
 */
export function getSemanticCache(config: SemanticCacheConfig): SemanticCache {
  if (!_sharedClient) {
    _sharedClient = new SemanticCache(config);
  }
  return _sharedClient;
}

// ---------------------------------------------------------------------------
// Route handler helper
// ---------------------------------------------------------------------------

export interface CacheHandlerConfig extends SemanticCacheConfig {
  /** Optional function to extract an API key from the request for auth gating */
  authorize?: (request: Request) => boolean | Promise<boolean>;
}

/**
 * Create a Next.js App Router route handler for cache operations.
 *
 * @example
 * ```ts
 * // app/api/cache/route.ts
 * import { createCacheHandler } from '@distributed-semantic-cache/nextjs/server';
 *
 * const handler = createCacheHandler({
 *   baseUrl: process.env.CACHE_API_URL!,
 *   apiKey: process.env.CACHE_API_KEY,
 * });
 *
 * export const GET = handler.GET;
 * export const POST = handler.POST;
 * ```
 */
export function createCacheHandler(config: CacheHandlerConfig) {
  const cache = getSemanticCache(config);

  async function checkAuth(request: Request): Promise<Response | null> {
    if (config.authorize) {
      const ok = await config.authorize(request);
      if (!ok) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }
    return null;
  }

  return {
    /** GET /api/cache — returns cache stats */
    async GET(request: Request): Promise<Response> {
      const denied = await checkAuth(request);
      if (denied) return denied;

      try {
        const stats = await cache.getStats();
        return Response.json(stats);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        return Response.json({ error: message }, { status: 500 });
      }
    },

    /** POST /api/cache — query or store */
    async POST(request: Request): Promise<Response> {
      const denied = await checkAuth(request);
      if (denied) return denied;

      try {
        const body = (await request.json()) as {
          action: 'query' | 'store';
          query: string;
          response?: string;
          threshold?: number;
          metadata?: Record<string, unknown>;
        };

        if (body.action === 'query') {
          const result = await cache.query(body.query, {
            threshold: body.threshold,
          });
          return Response.json(result);
        }

        if (body.action === 'store' && body.response) {
          const result = await cache.store(body.query, body.response, {
            metadata: body.metadata,
          });
          return Response.json(result);
        }

        return Response.json(
          { error: 'Invalid action. Use "query" or "store".' },
          { status: 400 },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        return Response.json({ error: message }, { status: 500 });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Server actions
// ---------------------------------------------------------------------------

export interface CacheActionsConfig extends SemanticCacheConfig {}

/**
 * Create typed server actions for use in React Server Components.
 *
 * @example
 * ```ts
 * // lib/cache-actions.ts
 * 'use server';
 * import { createCacheActions } from '@distributed-semantic-cache/nextjs/server';
 *
 * const actions = createCacheActions({
 *   baseUrl: process.env.CACHE_API_URL!,
 *   apiKey: process.env.CACHE_API_KEY,
 * });
 *
 * export const queryCache = actions.query;
 * export const storeInCache = actions.store;
 * export const getCacheStats = actions.getStats;
 * ```
 */
export function createCacheActions(config: CacheActionsConfig) {
  const cache = getSemanticCache(config);

  return {
    async query(
      queryText: string,
      threshold?: number,
    ): Promise<CacheQueryResponse> {
      return cache.query(queryText, { threshold });
    },

    async store(
      queryText: string,
      response: string,
      metadata?: Record<string, unknown>,
    ): Promise<CacheStoreResponse> {
      return cache.store(queryText, response, { metadata });
    },

    async getStats(): Promise<CacheStats> {
      return cache.getStats();
    },
  };
}

export type { SemanticCacheConfig, CacheQueryResponse, CacheStoreResponse, CacheStats };
