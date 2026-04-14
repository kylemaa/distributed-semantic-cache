# Changelog

All notable changes to `@distributed-semantic-cache/sdk` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-14

### Added

- `SemanticCache` client with `query()`, `store()`, `chat()` core operations
- `SemanticCacheBuilder` fluent builder with presets (`development`, `production`, `testing`)
- `createOpenAIMiddleware()` — drop-in caching for OpenAI Chat Completions
- `createAnthropicMiddleware()` — drop-in caching for Anthropic Claude Messages
- `createGenericLLMMiddleware()` — caching wrapper for any LLM provider
- Admin endpoints: `getComprehensiveStats()`, `getLayerStats()`, `getFlowStats()`, `clearCache()`
- Health check and connection testing
- Automatic retry with exponential backoff
- Full TypeScript type definitions with declaration maps
- Multi-tenant support via `x-tenant-id` header
- Environment-based configuration via `fromEnvironment()`
