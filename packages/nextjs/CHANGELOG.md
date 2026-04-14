# Changelog

All notable changes to `@distributed-semantic-cache/nextjs` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-14

### Added

- `SemanticCacheProvider` — React context provider for sharing a client instance
- `useSemanticCache()` — access the raw `SemanticCache` client from context
- `useCachedQuery()` — query hook with `data`, `isLoading`, `error` state
- `useCacheStore()` — store hook with `isStoring`, `error` state
- `useCacheStats()` — stats hook with `stats`, `isLoading`, `error` state
- `createCacheHandler()` — App Router route handler (`GET` stats, `POST` query/store)
- `createCacheActions()` — typed server actions for Server Components
- `getSemanticCache()` — server-side singleton factory
- Dual entry points: `@distributed-semantic-cache/nextjs` (client) and `@distributed-semantic-cache/nextjs/server`
