'use client';

import React, { createContext, useContext, useMemo } from 'react';
import {
  SemanticCache,
  type SemanticCacheConfig,
} from '@distributed-semantic-cache/sdk';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const SemanticCacheContext = createContext<SemanticCache | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface SemanticCacheProviderProps {
  /** SDK config passed to `new SemanticCache(config)` */
  config: SemanticCacheConfig;
  children: React.ReactNode;
}

/**
 * Provides a `SemanticCache` instance to the React tree.
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { SemanticCacheProvider } from '@distributed-semantic-cache/nextjs';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <SemanticCacheProvider config={{
 *       baseUrl: process.env.NEXT_PUBLIC_CACHE_URL!,
 *       apiKey: process.env.NEXT_PUBLIC_CACHE_KEY,
 *     }}>
 *       {children}
 *     </SemanticCacheProvider>
 *   );
 * }
 * ```
 */
export function SemanticCacheProvider({
  config,
  children,
}: SemanticCacheProviderProps) {
  const client = useMemo(() => new SemanticCache(config), [config]);

  return (
    <SemanticCacheContext.Provider value={client}>
      {children}
    </SemanticCacheContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook (internal)
// ---------------------------------------------------------------------------

export function useSemanticCacheContext(): SemanticCache {
  const ctx = useContext(SemanticCacheContext);
  if (!ctx) {
    throw new Error(
      'useSemanticCache must be used within a <SemanticCacheProvider>',
    );
  }
  return ctx;
}
