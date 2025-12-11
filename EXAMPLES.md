# Usage Examples

## Example 1: Integrating with a Real LLM

Currently, the demo uses simulated responses. Here's how to integrate with OpenAI's GPT:

```typescript
// In packages/api/src/routes.ts

import OpenAI from 'openai';

// Add to the /api/chat endpoint:
app.post('/api/chat', async (request, reply) => {
  const { message } = request.body;

  // Check cache first
  const cacheResult = await cacheService.query({ query: message });

  if (cacheResult.hit && cacheResult.response) {
    return {
      response: cacheResult.response,
      cached: true,
      similarity: cacheResult.similarity,
    };
  }

  // No cache hit - call OpenAI
  const openai = new OpenAI({ apiKey: config.openai.apiKey });
  
  const completion = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: message }],
  });

  const response = completion.choices[0].message.content;

  // Store in cache
  await cacheService.store(message, response);

  return {
    response,
    cached: false,
  };
});
```

## Example 2: Custom Similarity Threshold

Different use cases need different thresholds:

```typescript
// Strict matching (0.95) - for FAQ systems
const result = await cacheService.query({
  query: userQuestion,
  threshold: 0.95,
});

// Loose matching (0.75) - for general conversation
const result = await cacheService.query({
  query: userQuestion,
  threshold: 0.75,
});
```

## Example 3: Adding Metadata to Cache Entries

Store additional context with cache entries:

```typescript
await cacheService.store(
  query,
  response,
  {
    userId: 'user123',
    timestamp: Date.now(),
    model: 'gpt-4',
    tokens: 150,
    category: 'technical-support',
  }
);
```

## Example 4: Batch Operations

Process multiple queries efficiently:

```typescript
// In packages/api/src/embeddings.ts
const queries = [
  'What is the weather?',
  'How is the weather?',
  'Weather today?',
];

const embeddings = await embeddingsService.generateEmbeddings(queries);

// Store all with responses
for (let i = 0; i < queries.length; i++) {
  await cacheService.store(
    queries[i],
    responses[i],
    { batch: 'weather-queries' }
  );
}
```

## Example 5: Cache Warming

Pre-populate the cache with common queries:

```typescript
// scripts/warm-cache.ts
import { SemanticCacheService } from '../packages/api/src/cache-service';

const commonQA = [
  {
    query: 'What are your business hours?',
    response: 'We are open Monday-Friday, 9 AM to 5 PM EST.',
  },
  {
    query: 'How do I reset my password?',
    response: 'Click "Forgot Password" on the login page and follow the email instructions.',
  },
  // ... more common Q&A
];

const cacheService = new SemanticCacheService();

for (const { query, response } of commonQA) {
  await cacheService.store(query, response, { type: 'faq' });
}

console.log('Cache warmed with', commonQA.length, 'entries');
```

## Example 6: Analytics and Monitoring

Track cache performance:

```typescript
// Add to packages/api/src/cache-service.ts

export class SemanticCacheService {
  private hits = 0;
  private misses = 0;

  async query(cacheQuery: CacheQuery): Promise<CacheResponse> {
    const result = await this.performQuery(cacheQuery);
    
    if (result.hit) {
      this.hits++;
    } else {
      this.misses++;
    }

    return result;
  }

  getAnalytics() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }
}

// Add endpoint in routes.ts
app.get('/api/cache/analytics', async () => {
  return cacheService.getAnalytics();
});
```

## Example 7: Distributed Cache with Redis

Scale beyond a single SQLite database:

```typescript
// packages/api/src/redis-cache.ts
import { createClient } from 'redis';
import type { CacheEntry } from '@distributed-semantic-cache/shared';

export class RedisCache {
  private client;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    this.client.connect();
  }

  async storeEntry(entry: CacheEntry): Promise<void> {
    // Store embedding in Redis with vector search capability
    await this.client.json.set(`cache:${entry.id}`, '$', {
      query: entry.query,
      response: entry.response,
      embedding: entry.embedding,
      timestamp: entry.timestamp,
    });
  }

  async searchSimilar(embedding: number[], threshold: number): Promise<CacheEntry[]> {
    // Use Redis Vector Similarity Search (RedisSearch module)
    // This is a simplified example
    const results = await this.client.ft.search(
      'idx:cache',
      `@embedding:[VECTOR_RANGE $radius $vector]`,
      {
        PARAMS: {
          radius: 1 - threshold,
          vector: Buffer.from(new Float32Array(embedding).buffer),
        },
      }
    );

    return results.documents.map(doc => doc.value as CacheEntry);
  }
}
```

## Example 8: Multi-Language Support

Cache responses in different languages:

```typescript
await cacheService.store(
  'What is the weather?',
  'The weather is sunny.',
  { language: 'en' }
);

await cacheService.store(
  '¿Qué tiempo hace?',
  'El tiempo es soleado.',
  { language: 'es' }
);

// Query with language filter
const result = await cacheService.query({
  query: userQuestion,
  threshold: 0.85,
  filters: { language: userLanguage },
});
```

## Example 9: Time-based Cache Expiration

Implement TTL for cache entries:

```typescript
// Modify database.ts to include expiration
insertEntry(entry: CacheEntry, ttlSeconds?: number): void {
  const expiresAt = ttlSeconds 
    ? Date.now() + (ttlSeconds * 1000)
    : null;

  this.db.prepare(`
    INSERT INTO cache_entries 
    (id, query, response, embedding, timestamp, metadata, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.query,
    entry.response,
    JSON.stringify(entry.embedding),
    entry.timestamp,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
    expiresAt
  );
}

// Clean expired entries
cleanExpired(): void {
  this.db.prepare(`
    DELETE FROM cache_entries 
    WHERE expires_at IS NOT NULL AND expires_at < ?
  `).run(Date.now());
}
```

## Example 10: A/B Testing Cache Strategies

Compare different similarity thresholds:

```typescript
// Split traffic to test different thresholds
const userId = request.headers['user-id'];
const threshold = userId % 2 === 0 ? 0.85 : 0.90;

const result = await cacheService.query({
  query: message,
  threshold,
});

// Log for analysis
analytics.track('cache_query', {
  userId,
  threshold,
  hit: result.hit,
  similarity: result.similarity,
});
```

## Production Considerations

1. **Rate Limiting**: Add rate limiting to prevent API abuse
2. **Authentication**: Secure your endpoints
3. **Monitoring**: Set up logging and alerting
4. **Backups**: Regular backup of the cache database
5. **Load Balancing**: Use multiple instances with shared cache
6. **Cost Optimization**: Cache embeddings to avoid regenerating
7. **Privacy**: Be careful with PII in cached data

## Resources

- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Vector Similarity Search](https://www.pinecone.io/learn/vector-similarity/)
- [Semantic Caching Best Practices](https://redis.io/docs/stack/search/reference/vectors/)
