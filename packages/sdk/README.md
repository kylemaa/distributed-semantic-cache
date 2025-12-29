# @distributed-semantic-cache/sdk

Easy-to-use SDK for integrating the Distributed Semantic Cache into your applications.

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

// Create a client
const cache = new SemanticCache({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your-api-key'
});

// Query the cache
const result = await cache.query('What is TypeScript?');

if (result.hit) {
  console.log('Cache hit!');
  console.log('Response:', result.response);
  console.log('Similarity:', result.similarity);
} else {
  console.log('Cache miss');
}

// Store a response
await cache.store(
  'What is TypeScript?',
  'TypeScript is a typed superset of JavaScript that compiles to plain JavaScript.'
);
```

## Configuration

```typescript
const cache = new SemanticCache({
  // Required: Base URL of your cache API
  baseUrl: 'http://localhost:3000',
  
  // API key for authentication
  apiKey: process.env.CACHE_API_KEY,
  
  // Admin API key for privileged operations (optional)
  adminApiKey: process.env.CACHE_ADMIN_KEY,
  
  // Request timeout in milliseconds (default: 30000)
  timeout: 30000,
  
  // Custom headers for all requests
  headers: {
    'X-Custom-Header': 'value'
  },
  
  // Retry configuration
  retry: {
    maxRetries: 3,    // Maximum retry attempts
    baseDelay: 1000,  // Base delay between retries (ms)
  }
});
```

## API Reference

### Core Operations

#### `query(query: string, options?: QueryOptions)`

Search the cache for a matching response.

```typescript
const result = await cache.query('What is Node.js?', {
  threshold: 0.8  // Custom similarity threshold (0-1)
});

// Response structure
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
  matchedQuery?: string;  // The matched query (if different)
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
      source: 'documentation',
      version: '1.0'
    }
  }
);

// Response structure
{
  success: boolean;
  entry: {
    id: string;
    query: string;
    response: string;
    timestamp: number;
    metadata?: Record<string, unknown>;
  }
}
```

#### `chat(message: string, response?: string)`

Combined query and store operation. Useful for chatbot integrations.

```typescript
// Check cache and store if miss
const result = await cache.chat(
  'What is TypeScript?',
  'TypeScript is a typed superset of JavaScript.'  // Stored if no cache hit
);

if (result.cached) {
  console.log('From cache:', result.response);
} else if (result.stored) {
  console.log('Stored new response');
}
```

### Statistics

#### `getStats()`

Get basic cache statistics.

```typescript
const stats = await cache.getStats();

console.log('Total entries:', stats.totalEntries);
console.log('Exact match hit rate:', stats.exactMatchCache.hitRate);
console.log('Embedding cache hit rate:', stats.embeddingCache.hitRate);
```

#### `getComprehensiveStats()` (Admin)

Get comprehensive statistics including all cache layers.

```typescript
const stats = await cache.getComprehensiveStats();

console.log('Overall hit rate:', stats.overview.overallHitRate);
console.log('L1 (Exact) hits:', stats.layers.exact.hits);
console.log('L2 (Normalized) size:', stats.layers.normalized.size);
console.log('L3 (Semantic) entries:', stats.layers.semantic.totalEntries);
```

#### `getLayerStats()` (Admin)

Get per-layer performance metrics.

```typescript
const { layers, summary } = await cache.getLayerStats();

layers.forEach(layer => {
  console.log(`${layer.name}: ${layer.hitRate * 100}% hit rate, ${layer.avgLatencyMs}ms avg`);
});
```

#### `getFlowStats()` (Admin)

Get query flow visualization data.

```typescript
const flow = await cache.getFlowStats();

console.log('Incoming queries:', flow.flowData.incoming);
console.log('L1 hits:', flow.flowData.layer1.hit);
console.log('L2 hits:', flow.flowData.layer2.hit);
console.log('L3 hits:', flow.flowData.layer3.hit);
console.log('Total misses:', flow.flowData.layer3.miss);
```

### Admin Operations

#### `clearCache()` (Admin)

Clear all cache entries. **This cannot be undone!**

```typescript
await cache.clearCache();
console.log('Cache cleared');
```

### Health Check

#### `healthCheck()`

Check if the cache API is healthy.

```typescript
const health = await cache.healthCheck();

if (health.status === 'ok') {
  console.log('Cache is healthy');
}
```

#### `testConnection()`

Test the connection and API key validity.

```typescript
const isConnected = await cache.testConnection();

if (isConnected) {
  console.log('Successfully connected to cache');
} else {
  console.log('Connection failed');
}
```

## Error Handling

The SDK throws `SemanticCacheError` for API errors:

```typescript
import { SemanticCache, SemanticCacheError } from '@distributed-semantic-cache/sdk';

try {
  await cache.query('test');
} catch (error) {
  if (error instanceof SemanticCacheError) {
    console.error('Status:', error.statusCode);
    console.error('Message:', error.message);
    console.error('Response:', error.response);
  }
}
```

Common error codes:
- `401` - Unauthorized (invalid or missing API key)
- `403` - Forbidden (admin operation without admin key)
- `400` - Bad Request (invalid input)
- `429` - Too Many Requests (rate limited)
- `500` - Internal Server Error

## Factory Function

You can also use the factory function:

```typescript
import { createSemanticCache } from '@distributed-semantic-cache/sdk';

const cache = createSemanticCache({
  baseUrl: 'http://localhost:3000',
  apiKey: process.env.CACHE_API_KEY
});
```

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions:

```typescript
import type {
  SemanticCacheConfig,
  CacheQueryResponse,
  CacheStoreResponse,
  CacheStats,
  ComprehensiveStats,
  LayerStats,
  FlowStats,
  ConfidenceLevel,
} from '@distributed-semantic-cache/sdk';
```

## Environment Variables

Recommended environment variable setup:

```bash
# .env
CACHE_API_URL=http://localhost:3000
CACHE_API_KEY=your-api-key
CACHE_ADMIN_KEY=your-admin-key
```

```typescript
const cache = new SemanticCache({
  baseUrl: process.env.CACHE_API_URL!,
  apiKey: process.env.CACHE_API_KEY,
  adminApiKey: process.env.CACHE_ADMIN_KEY,
});
```

## License

MIT
