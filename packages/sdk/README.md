# @distributed-semantic-cache/sdk

The official TypeScript/JavaScript SDK for Distributed Semantic Cache - a high-performance semantic caching system that reduces LLM API costs by 50-80% through intelligent query matching.

[![npm version](https://badge.fury.io/js/%40distributed-semantic-cache%2Fsdk.svg)](https://www.npmjs.com/package/@distributed-semantic-cache/sdk)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## Features

- 🚀 **Zero-config LLM Integration** - Drop-in middleware for OpenAI, Anthropic, and custom LLMs
- 🎯 **Semantic Matching** - Cache hits on semantically similar queries, not just exact matches
- 📊 **Full TypeScript Support** - Complete type definitions for all APIs
- ⚡ **Fluent Builder API** - Chainable configuration for better developer experience
- ⚛️ **React Hooks** - First-class React integration (optional)
- 🔄 **Automatic Retry** - Configurable retry with exponential backoff
- 🔐 **Enterprise Ready** - Multi-tenant support, audit logging, HIPAA/GDPR compliant

## Installation

```bash
npm install @distributed-semantic-cache/sdk
# or
pnpm add @distributed-semantic-cache/sdk
# or
yarn add @distributed-semantic-cache/sdk
```

## Quick Start

```typescript
import { SemanticCache } from '@distributed-semantic-cache/sdk';

const cache = new SemanticCache({
  baseUrl: 'http://localhost:3000',
  apiKey: process.env.CACHE_API_KEY,
});

// Query the cache
const result = await cache.query('What is TypeScript?');

if (result.hit) {
  console.log('Cache hit! Saved an API call.');
  console.log('Response:', result.response);
  console.log('Similarity:', result.similarity);
} else {
  // Make your LLM call and store the result
  const llmResponse = await callLLM('What is TypeScript?');
  await cache.store('What is TypeScript?', llmResponse);
}
```

## 🔥 LLM Middleware Integration

The SDK includes drop-in middleware for popular LLM providers. Wrap your API calls to automatically cache responses.

### OpenAI Integration

```typescript
import { createOpenAIMiddleware, SemanticCache } from '@distributed-semantic-cache/sdk';
import OpenAI from 'openai';

const cache = new SemanticCache({
  baseUrl: process.env.CACHE_API_URL,
  apiKey: process.env.CACHE_API_KEY,
});

const middleware = createOpenAIMiddleware({
  cache,
  threshold: 0.85, // Similarity threshold for matches
  onCacheHit: (query, response) => console.log(`Cache hit! Saved ${response.similarity * 100}%`),
});

const openai = new OpenAI();

// Wrap your OpenAI calls
const result = await middleware.chat(
  {
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Explain quantum computing' }],
  },
  () => openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Explain quantum computing' }],
  })
);

if (result.cached) {
  console.log(`Saved API call! Similarity: ${result.similarity}`);
  console.log(`Estimated time saved: ${result.timeSavedMs}ms`);
}
```

### Anthropic Claude Integration

```typescript
import { createAnthropicMiddleware, SemanticCache } from '@distributed-semantic-cache/sdk';
import Anthropic from '@anthropic-ai/sdk';

const middleware = createAnthropicMiddleware({
  cache: new SemanticCache({
    baseUrl: process.env.CACHE_API_URL,
    apiKey: process.env.CACHE_API_KEY,
  }),
  threshold: 0.85,
});

const anthropic = new Anthropic();

const result = await middleware.messages(
  {
    model: 'claude-3-opus-20240229',
    messages: [{ role: 'user', content: 'What is machine learning?' }],
    max_tokens: 1024,
  },
  () => anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    messages: [{ role: 'user', content: 'What is machine learning?' }],
    max_tokens: 1024,
  })
);
```

### Custom LLM Integration

```typescript
import { createGenericLLMMiddleware } from '@distributed-semantic-cache/sdk';

interface MyLLMRequest {
  prompt: string;
  model: string;
}

interface MyLLMResponse {
  text: string;
  tokens: number;
}

const middleware = createGenericLLMMiddleware<MyLLMRequest, MyLLMResponse>({
  cache: new SemanticCache({ baseUrl: '...', apiKey: '...' }),
  keyExtractor: (req) => req.prompt,
  responseExtractor: (res) => res.text,
  responseBuilder: (cachedText, req) => ({
    text: cachedText,
    tokens: 0, // Cached, no tokens used
  }),
});

const result = await middleware.call(
  { prompt: 'Hello world', model: 'my-model' },
  () => myLLM.generate({ prompt: 'Hello world', model: 'my-model' })
);
```

## 🏗️ Fluent Builder API

Use the builder for complex configurations with better readability:

```typescript
import { SemanticCacheBuilder, buildCache } from '@distributed-semantic-cache/sdk';

// Full builder pattern
const cache = new SemanticCacheBuilder()
  .withBaseUrl('https://cache.example.com')
  .withApiKey(process.env.CACHE_API_KEY)
  .withAdminKey(process.env.CACHE_ADMIN_KEY)
  .withTimeout(10000)
  .withRetries(5, 500)
  .withTenantId('tenant-123')  // Multi-tenant support
  .build();

// Or use the shorthand
const devCache = buildCache()
  .withPreset('development')
  .withApiKey('dev-key')
  .build();

// Read from environment variables
const prodCache = buildCache()
  .fromEnvironment()  // Reads CACHE_API_URL, CACHE_API_KEY, etc.
  .withPreset('production')
  .build();
```

### Available Presets

| Preset | Timeout | Retries | Base Delay |
|--------|---------|---------|------------|
| `development` | 30s | 3 | 1000ms |
| `production` | 10s | 5 | 500ms |
| `testing` | 5s | 0 | - |

## 📖 Complete API Reference

### Core Operations

#### `query(query: string, options?: QueryOptions)`

Search the cache for a matching response.

```typescript
const result = await cache.query('What is Node.js?', {
  threshold: 0.8  // Custom similarity threshold (0-1)
});

// Result structure
{
  hit: boolean;           // Whether a match was found
  response?: string;      // The cached response (if hit)
  similarity?: number;    // Similarity score (0-1)
  source?: string;        // 'exact' | 'normalized' | 'semantic'
  confidence?: {
    level: string;        // 'exact' | 'very_high' | 'high' | 'medium' | 'low'
    score: number;
    explanation: string;
  };
  matchedQuery?: string;  // The original matched query
}
```

#### `store(query: string, response: string, options?: StoreOptions)`

Store a query-response pair in the cache.

```typescript
const result = await cache.store(
  'What is Node.js?',
  'Node.js is a JavaScript runtime built on Chrome\'s V8 engine.',
  {
    metadata: {
      source: 'gpt-4',
      version: '1.0',
      cost: 0.002,
    }
  }
);
```

#### `chat(message: string, response?: string)`

Combined query and store operation - ideal for chatbot integrations.

```typescript
const result = await cache.chat(
  'What is TypeScript?',
  'TypeScript is a typed superset of JavaScript.'
);

if (result.cached) {
  console.log('From cache:', result.response);
} else if (result.stored) {
  console.log('Stored new response');
}
```

### Statistics & Analytics

#### `getStats()`
Basic cache statistics.

#### `getComprehensiveStats()` *(Admin)*
Detailed statistics including all cache layers, hit rates, and performance metrics.

#### `getLayerStats()` *(Admin)*
Per-layer performance breakdown (L1: Exact, L2: Normalized, L3: Semantic).

#### `getFlowStats()` *(Admin)*
Query flow visualization data for monitoring dashboards.

### Admin Operations

#### `clearCache()` *(Admin)*
Clear all cache entries. **Cannot be undone!**

#### `healthCheck()`
Check API health (no authentication required).

#### `testConnection()`
Test connection and API key validity.

## 🔐 Configuration

### Full Configuration Options

```typescript
const cache = new SemanticCache({
  // Required
  baseUrl: 'https://cache.example.com',
  
  // Authentication
  apiKey: process.env.CACHE_API_KEY,           // Regular operations
  adminApiKey: process.env.CACHE_ADMIN_KEY,    // Admin operations
  
  // Request settings
  timeout: 30000,  // Request timeout in ms (default: 30000)
  
  // Custom headers
  headers: {
    'X-Custom-Header': 'value',
    'x-tenant-id': 'tenant-123',  // Multi-tenant
  },
  
  // Retry configuration
  retry: {
    maxRetries: 3,     // Max retry attempts (default: 3)
    baseDelay: 1000,   // Base delay in ms (default: 1000)
  }
});
```

### Environment Variables

```bash
# .env
CACHE_API_URL=https://cache.example.com
CACHE_API_KEY=your-api-key
CACHE_ADMIN_KEY=your-admin-key
CACHE_TIMEOUT=30000
```

```typescript
const cache = buildCache().fromEnvironment().build();
```

## 🚨 Error Handling

```typescript
import { SemanticCache, SemanticCacheError } from '@distributed-semantic-cache/sdk';

try {
  await cache.query('test');
} catch (error) {
  if (error instanceof SemanticCacheError) {
    console.error('Status:', error.statusCode);
    console.error('Message:', error.message);
    console.error('Response:', error.response);
    
    switch (error.statusCode) {
      case 401:
        console.error('Invalid API key');
        break;
      case 403:
        console.error('Admin access required');
        break;
      case 429:
        console.error('Rate limited - slow down');
        break;
    }
  }
}
```

## 📦 TypeScript Types

All types are exported for full TypeScript support:

```typescript
import type {
  // Configuration
  SemanticCacheConfig,
  RetryConfig,
  QueryOptions,
  StoreOptions,
  
  // Responses
  CacheQueryResponse,
  CacheStoreResponse,
  ChatResponse,
  HealthResponse,
  
  // Statistics
  CacheStats,
  ComprehensiveStats,
  LayerStats,
  FlowStats,
  
  // Errors
  SemanticCacheError,
  
  // Middleware types
  LLMMiddlewareConfig,
  OpenAIChatRequest,
  OpenAIChatResponse,
  AnthropicRequest,
  AnthropicResponse,
  CachedLLMResponse,
} from '@distributed-semantic-cache/sdk';
```

## 🏢 Enterprise Features

The SDK supports enterprise features when connected to a Distributed Semantic Cache Enterprise server:

- **Multi-Tenancy**: Use `withTenantId()` for tenant isolation
- **Audit Logging**: All operations are automatically logged
- **Advanced Analytics**: Access comprehensive statistics via admin endpoints
- **Rate Limiting**: Graceful handling of rate limit responses
- **Custom Metadata**: Store structured metadata with cache entries

## 📊 Cost Savings Calculator

```typescript
const stats = await cache.getComprehensiveStats();

const totalQueries = stats.overview.totalQueries;
const cacheHits = stats.overview.totalHits;
const hitRate = stats.overview.overallHitRate;
const costPerQuery = 0.002; // $0.002 per GPT-4 call

const savedCalls = cacheHits;
const savedCost = savedCalls * costPerQuery;

console.log(`Saved ${savedCalls} API calls`);
console.log(`Cost savings: $${savedCost.toFixed(2)}`);
console.log(`Hit rate: ${(hitRate * 100).toFixed(1)}%`);
```

## 📄 License

MIT - See [LICENSE](LICENSE) for details.

---

**Need Help?** Open an issue on GitHub or contact support@example.com

**Enterprise Support**: Contact sales@example.com for dedicated support and SLAs.
