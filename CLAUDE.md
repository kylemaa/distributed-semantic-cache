# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current Focus

Building benchmark credibility for blog post publication.
Working in: `packages/api/benchmarks/`
Current step: Creating quality-eval.ts in packages/api/benchmarks/

NOT touching: web dashboard, SDK middleware, API routes, storage layer

Last updated: [4/24/2026]

## Benchmark Status

REAL EMBEDDINGS (credible, use these):
- openai-embeddings-results-alpaca.json
- openai-embeddings-results-dolly.json  
- openai-embeddings-results-hhrlhf.json
- openai-embeddings-results-wizardlm.json
- cross-user-results-*.json

SYNTHETIC/BROKEN (do not cite):
- ablation-results.json (fake embeddings, 99.7% hit rate is meaningless)
- realworld-results.json (deterministic embeddings, not real semantics)
- statistical-results.json (broken - Cohen's d is 339 trillion, division by zero)
## Project Overview

A distributed semantic caching system for LLM applications built as a TypeScript monorepo. It reduces API costs by caching semantically similar queries using embedding-based similarity search across a 3-layer cache architecture.

## Monorepo Structure

pnpm workspaces with four packages:
- `packages/api` — Fastify REST API server (port 3000), core cache logic, all service implementations
- `packages/sdk` — Published TypeScript client SDK with LLM middleware (OpenAI, Anthropic, generic)
- `packages/shared` — Zero-dependency shared types and cosine similarity utilities
- `packages/web` — React 18 + Vite dashboard (port 5173, proxies `/api` to port 3000)

## Commands

```bash
# Root (all packages)
pnpm dev              # Run all packages in parallel dev mode
pnpm build            # Build all packages
pnpm test             # Run all tests
pnpm type-check       # TypeScript strict check across all packages

# API package (packages/api)
pnpm --filter api dev
pnpm --filter api test
pnpm --filter api test:watch
pnpm --filter api test:coverage
pnpm --filter api benchmark

# Single test file
cd packages/api && npx vitest run __tests__/cache-service.test.ts
```

Tests use Vitest. 220+ tests live in `packages/api/__tests__/`.

## 3-Layer Cache Architecture

**Layer 1 — Exact Match (O(1), <1ms):** In-memory LRU keyed on raw query hash. Confidence: 1.0.

**Layer 2 — Normalized Match (O(1), ~1ms):** In-memory LRU after query normalization (case folding, punctuation stripping, contraction expansion via `normalize.ts`). Confidence: 0.98.

**Layer 3 — Semantic Match (O(log n), ~50ms):** Embedding generation → HNSW approximate nearest-neighbor search over cosine similarity. Confidence: variable (0.50–0.95).

A miss at all three layers triggers fresh embedding generation, response generation, and storage into all layers.

## Key API Services (`packages/api/src/`)

| File | Role |
|------|------|
| `cache-service.ts` | Central orchestrator — 3-layer lookup, embedding, quantization, encryption, audit, stats |
| `embeddings.ts` | Dual-provider embedding: OpenAI (`text-embedding-3-small`) or local `@xenova/transformers` models with LRU cache |
| `database.ts` | SQLite via `better-sqlite3` |
| `hnsw-index.ts` | HNSW index for O(log n) semantic search |
| `matryoshka-cascade.ts` | Progressive dimension search (4–8× faster than full-dimension search) |
| `confidence.ts` | Multi-factor confidence scoring: `0.5×similarity + 0.2×layerBonus + 0.1×ageDecay + 0.1×frequency + 0.1×complexity` |
| `routes.ts` | Fastify REST endpoints with auth and validation |
| `config.ts` | Centralized environment-based configuration |
| `tenant-manager.ts` | Per-tenant isolation, quotas, feature flags, billing |
| `encryption.ts` | AES-256-GCM with PBKDF2 key derivation (used in `strict` privacy mode) |
| `quantization.ts` | Min-max uint8 quantization (~74% storage reduction) |
| `analytics-service.ts` | Cost savings, hit rates, latency percentiles, CSV/JSON export |
| `storage/` | Pluggable backends: SQLite (default), PostgreSQL, Redis, Qdrant, in-memory |

## Storage Abstraction

Three interfaces in `storage/interfaces.ts`:
- `ICacheStorage` — cache entries and metadata
- `IVectorStore` — embedding vectors (HNSW, Qdrant, pgvector)
- `IKVCache` — L1/L2 fast path (in-memory, Redis)

Configured via `CACHE_STORAGE` and `VECTOR_STORE` env vars.

## SDK Architecture (`packages/sdk/src/`)

- `client.ts` — `SemanticCache` class: `query()`, `store()`, `getStats()`
- `builder.ts` — Fluent builder for client configuration
- `middleware.ts` — Drop-in wrappers: `createOpenAIMiddleware()`, `createAnthropicMiddleware()`, `createGenericLLMMiddleware()`, `createSemanticCacheHooks()`

## Environment Configuration

Copy `.env.example`. Key variables:
```
EMBEDDING_PROVIDER=local|openai   # Default: local (no API key needed)
OPENAI_API_KEY=...                 # Required only if EMBEDDING_PROVIDER=openai
SIMILARITY_THRESHOLD=0.85          # Semantic match threshold
PRIVACY_MODE=strict|normal|off     # strict=AES-256-GCM encryption + hashed audit logs
CACHE_STORAGE=sqlite|redis|postgres
VECTOR_STORE=hnsw|qdrant|pgvector
AUTH_ENABLED=true|false
```

## Privacy Modes

| Mode | Encryption | Audit Logs | Analytics |
|------|-----------|------------|-----------|
| `strict` | AES-256-GCM | Hashed queries only | Disabled |
| `normal` | None | Full logging | Enabled |
| `off` | None | Disabled | Enabled |

## Running with Docker

```bash
docker compose up                  # API + optional Redis/Postgres/Grafana
docker compose up semantic-cache-api redis   # Minimal distributed setup
```

## Module Format

All packages use ES2020 modules (`"type": "module"` in package.json). Imports must use `.js` extensions even for `.ts` source files due to TypeScript ESM resolution.
