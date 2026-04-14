# @distributed-semantic-cache/nextjs

Next.js App Router integration for [Distributed Semantic Cache](https://github.com/kylemaa/distributed-semantic-cache-poc) — reduce LLM API costs by 50-80% with semantic query matching.

[![npm version](https://badge.fury.io/js/%40distributed-semantic-cache%2Fnextjs.svg)](https://www.npmjs.com/package/@distributed-semantic-cache/nextjs)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)

## Features

- **React hooks** — `useSemanticCache()`, `useCachedQuery()`, `useCacheStore()`, `useCacheStats()`
- **Server actions** — typed actions for Server Components via `createCacheActions()`
- **Route handler** — instant `/api/cache` endpoint via `createCacheHandler()`
- **Context provider** — singleton client shared across the component tree
- **Full TypeScript** — complete type definitions, re-exports core SDK types

## Installation

```bash
npm install @distributed-semantic-cache/nextjs @distributed-semantic-cache/sdk
```

## Quick Start

### 1. Add the provider

```tsx
// app/layout.tsx
import { SemanticCacheProvider } from '@distributed-semantic-cache/nextjs';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <SemanticCacheProvider config={{
          baseUrl: process.env.NEXT_PUBLIC_CACHE_URL!,
          apiKey: process.env.NEXT_PUBLIC_CACHE_KEY,
        }}>
          {children}
        </SemanticCacheProvider>
      </body>
    </html>
  );
}
```

### 2. Use hooks in client components

```tsx
'use client';
import { useCachedQuery, useCacheStore } from '@distributed-semantic-cache/nextjs';

export function ChatBox() {
  const { query, data, isLoading } = useCachedQuery();
  const { store } = useCacheStore();

  async function handleSubmit(text: string) {
    const result = await query(text);
    if (result.hit) {
      // Use cached response — saved an API call
      return result.response;
    }
    // Call your LLM, then store the result
    const llmResponse = await callYourLLM(text);
    await store(text, llmResponse);
    return llmResponse;
  }

  return (
    <div>
      {isLoading && <p>Searching cache...</p>}
      {data?.hit && <p>Cache hit! Similarity: {data.similarity}</p>}
    </div>
  );
}
```

### 3. Add a route handler (optional)

```ts
// app/api/cache/route.ts
import { createCacheHandler } from '@distributed-semantic-cache/nextjs/server';

const handler = createCacheHandler({
  baseUrl: process.env.CACHE_API_URL!,
  apiKey: process.env.CACHE_API_KEY,
});

export const GET = handler.GET;
export const POST = handler.POST;
```

### 4. Use server actions (optional)

```ts
// lib/cache-actions.ts
'use server';
import { createCacheActions } from '@distributed-semantic-cache/nextjs/server';

const actions = createCacheActions({
  baseUrl: process.env.CACHE_API_URL!,
  apiKey: process.env.CACHE_API_KEY,
});

export const queryCache = actions.query;
export const storeInCache = actions.store;
export const getCacheStats = actions.getStats;
```

```tsx
// app/page.tsx (Server Component)
import { queryCache } from '@/lib/cache-actions';

export default async function Page() {
  const result = await queryCache('What is Next.js?');
  return <div>{result.hit ? result.response : 'Not cached'}</div>;
}
```

## API Reference

### Client-side (hooks)

| Hook | Description |
|------|-------------|
| `useSemanticCache()` | Access the raw `SemanticCache` client |
| `useCachedQuery()` | Query with `{ data, isLoading, error }` state |
| `useCacheStore()` | Store with `{ isStoring, error }` state |
| `useCacheStats()` | Fetch stats with `{ stats, isLoading, error }` state |

### Server-side

| Function | Description |
|----------|-------------|
| `createCacheHandler(config)` | Returns `{ GET, POST }` route handlers |
| `createCacheActions(config)` | Returns `{ query, store, getStats }` server actions |
| `getSemanticCache(config)` | Server-side singleton client |

## Environment Variables

```bash
# Client-side (exposed to browser)
NEXT_PUBLIC_CACHE_URL=http://localhost:3000
NEXT_PUBLIC_CACHE_KEY=your-api-key

# Server-side only
CACHE_API_URL=http://localhost:3000
CACHE_API_KEY=your-api-key
```

## License

MIT
