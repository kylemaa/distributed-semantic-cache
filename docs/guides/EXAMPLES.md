# Usage Examples

Practical integration patterns for the Distributed Semantic Cache.

---

## Table of Contents

1. [Integrating with Real LLMs](#example-1-integrating-with-a-real-llm)
2. [Custom Similarity Thresholds](#example-2-custom-similarity-threshold)
3. [Adding Metadata](#example-3-adding-metadata-to-cache-entries)
4. [Batch Operations](#example-4-batch-operations)
5. [Cache Warming](#example-5-cache-warming)
6. [Confidence-Based Decisions](#example-6-confidence-based-decisions)
7. [Analytics Integration](#example-7-analytics-and-monitoring)
8. [Multi-Tenant Setup](#example-8-multi-tenant-setup)
9. [Privacy Mode Configuration](#example-9-privacy-mode-configuration)

---

## Example 1: Integrating with a Real LLM

Replace simulated responses with actual OpenAI GPT calls:

```typescript
import OpenAI from 'openai';
import { SemanticCacheService } from './cache-service.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const cache = new SemanticCacheService();

async function chat(message: string) {
  // Check cache first
  const cacheResult = await cache.query({ query: message });

  if (cacheResult.hit && cacheResult.response) {
    console.log(`Cache hit! Similarity: ${cacheResult.similarity}`);
    return {
      response: cacheResult.response,
      cached: true,
      similarity: cacheResult.similarity,
      confidence: cacheResult.confidence,
    };
  }

  // No cache hit - call OpenAI
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: message }],
  });

  const response = completion.choices[0].message.content!;

  // Store in cache for future use
  await cache.store(message, response);

  return {
    response,
    cached: false,
  };
}

// Usage
const result = await chat("What is machine learning?");
```

---

## Example 2: Custom Similarity Threshold

Different use cases need different thresholds:

```typescript
// Strict matching (0.95) - for FAQ systems where accuracy is critical
const faqResult = await cacheService.query({
  query: userQuestion,
  threshold: 0.95,
});

// Balanced matching (0.85) - default, good for most cases
const generalResult = await cacheService.query({
  query: userQuestion,
  threshold: 0.85,
});

// Loose matching (0.75) - for casual conversation, catch more variations
const chatResult = await cacheService.query({
  query: userQuestion,
  threshold: 0.75,
});
```

**Threshold Guidelines:**

| Use Case | Threshold | Rationale |
|----------|-----------|-----------|
| FAQ/Support | 0.92-0.95 | Accuracy critical |
| Technical docs | 0.88-0.92 | Balance accuracy/coverage |
| General chat | 0.82-0.88 | Catch variations |
| Creative/casual | 0.75-0.82 | Maximize reuse |

---

## Example 3: Adding Metadata to Cache Entries

Store additional context for analytics and filtering:

```typescript
await cacheService.store(
  "How do I reset my password?",
  "Go to Settings > Security > Reset Password",
  {
    // User context
    userId: 'user123',
    sessionId: 'sess_abc',
    
    // Response metadata
    model: 'gpt-4',
    tokens: 150,
    latencyMs: 1250,
    
    // Business context
    category: 'technical-support',
    department: 'IT',
    priority: 'medium',
    
    // Timestamps
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400000, // 24 hours
  }
);
```

---

## Example 4: Batch Operations

Process multiple queries efficiently:

```typescript
// Pre-populate FAQ entries
const faqEntries = [
  { query: "What are your hours?", response: "9 AM - 5 PM EST, Monday-Friday" },
  { query: "How do I contact support?", response: "Email support@example.com" },
  { query: "What's your refund policy?", response: "30-day money-back guarantee" },
];

// Batch store
for (const { query, response } of faqEntries) {
  await cacheService.store(query, response, { type: 'faq', batch: 'initial-load' });
}

console.log(`Loaded ${faqEntries.length} FAQ entries`);
```

---

## Example 5: Cache Warming

Pre-populate the cache on startup with common queries:

```typescript
// scripts/warm-cache.ts
import { SemanticCacheService } from '../packages/api/src/cache-service.js';

const commonQA = [
  {
    query: 'What are your business hours?',
    response: 'We are open Monday-Friday, 9 AM to 5 PM EST.',
    category: 'general',
  },
  {
    query: 'How do I reset my password?',
    response: 'Click "Forgot Password" on the login page and follow the email instructions.',
    category: 'account',
  },
  {
    query: 'What payment methods do you accept?',
    response: 'We accept Visa, MasterCard, American Express, and PayPal.',
    category: 'billing',
  },
  // ... add more common Q&A
];

async function warmCache() {
  const cacheService = new SemanticCacheService();

  for (const { query, response, category } of commonQA) {
    await cacheService.store(query, response, { 
      type: 'faq', 
      category,
      warmedAt: Date.now(),
    });
  }

  console.log(`✅ Cache warmed with ${commonQA.length} entries`);
}

warmCache();
```

Run with:
```bash
cd packages/api
tsx scripts/warm-cache.ts
```

---

## Example 6: Confidence-Based Decisions

Use confidence scores to make intelligent decisions:

```typescript
async function smartQuery(userQuery: string) {
  const result = await cacheService.query({ query: userQuery });

  if (!result.hit) {
    // Cache miss - fetch fresh response
    return await fetchFreshResponse(userQuery);
  }

  // Use confidence levels to decide
  switch (result.confidence?.level) {
    case 'very_high':
      // 95%+ confidence - use directly
      return {
        response: result.response,
        source: 'cache',
        action: 'direct_use',
      };

    case 'high':
      // 85-95% confidence - use but maybe log for review
      console.log(`High confidence match: ${result.confidence.score}`);
      return {
        response: result.response,
        source: 'cache',
        action: 'use_with_logging',
      };

    case 'medium':
      // 70-85% confidence - show to user with caveat
      return {
        response: result.response,
        source: 'cache',
        action: 'use_with_caveat',
        disclaimer: 'This is a similar previous answer. Would you like a fresh response?',
      };

    case 'low':
    case 'very_low':
      // <70% confidence - fetch fresh
      console.log(`Low confidence (${result.confidence.score}), fetching fresh`);
      return await fetchFreshResponse(userQuery);

    default:
      return await fetchFreshResponse(userQuery);
  }
}
```

---

## Example 7: Analytics and Monitoring

Track cache performance metrics:

```typescript
// Custom analytics wrapper
class CacheAnalytics {
  private metrics = {
    queries: 0,
    hits: 0,
    misses: 0,
    totalLatencyMs: 0,
    layerHits: { exact: 0, normalized: 0, semantic: 0 },
    confidenceLevels: { very_high: 0, high: 0, medium: 0, low: 0, very_low: 0 },
  };

  async query(cacheService: SemanticCacheService, userQuery: string) {
    const start = performance.now();
    const result = await cacheService.query({ query: userQuery });
    const latency = performance.now() - start;

    // Track metrics
    this.metrics.queries++;
    this.metrics.totalLatencyMs += latency;

    if (result.hit) {
      this.metrics.hits++;
      if (result.confidence?.layer === 'exact_match') this.metrics.layerHits.exact++;
      if (result.confidence?.layer === 'normalized_match') this.metrics.layerHits.normalized++;
      if (result.confidence?.layer === 'semantic_match') this.metrics.layerHits.semantic++;
      if (result.confidence?.level) {
        this.metrics.confidenceLevels[result.confidence.level]++;
      }
    } else {
      this.metrics.misses++;
    }

    return result;
  }

  getReport() {
    const total = this.metrics.queries || 1;
    return {
      hitRate: (this.metrics.hits / total * 100).toFixed(2) + '%',
      avgLatencyMs: (this.metrics.totalLatencyMs / total).toFixed(2),
      layerDistribution: {
        exact: (this.metrics.layerHits.exact / this.metrics.hits * 100).toFixed(1) + '%',
        normalized: (this.metrics.layerHits.normalized / this.metrics.hits * 100).toFixed(1) + '%',
        semantic: (this.metrics.layerHits.semantic / this.metrics.hits * 100).toFixed(1) + '%',
      },
      confidenceDistribution: this.metrics.confidenceLevels,
    };
  }
}
```

---

## Example 8: Multi-Tenant Setup

Enterprise deployment with customer isolation:

```typescript
import { TenantManager, SemanticCacheService } from './index.js';

// Create tenant manager
const tenantManager = new TenantManager('./tenants');

// Create a new tenant
const tenant = await tenantManager.createTenant({
  name: 'Acme Corp',
  plan: 'enterprise',
  quotaLimit: 100000,  // 100K queries/month
  features: {
    encryption: true,
    auditLog: true,
    smartMatching: true,
  },
});

console.log(`Created tenant: ${tenant.id}`);

// Get tenant-specific cache service
const tenantCache = tenantManager.getCacheService(tenant.id);

// All operations are isolated to this tenant
await tenantCache.store("What is your API?", "Our API documentation is at docs.example.com");
const result = await tenantCache.query({ query: "Where are the API docs?" });

// Check quota usage
const usage = await tenantManager.getUsage(tenant.id);
console.log(`Queries used: ${usage.queriesUsed} / ${usage.quotaLimit}`);
```

---

## Example 9: Privacy Mode Configuration

HIPAA/GDPR compliant deployment:

```typescript
// Environment configuration for strict privacy
// .env
PRIVACY_MODE=strict
ENCRYPTION_KEY=YourSecure32CharacterEncryptionKey!@#
AUDIT_ENABLED=true
AUDIT_RETENTION_DAYS=90
DISABLE_ANALYTICS=true

// Application code
import { SemanticCacheService } from './cache-service.js';

const cache = new SemanticCacheService();

// Store sensitive data - automatically encrypted
await cache.store(
  "Patient symptoms: headache and fever",
  "Recommend: rest, fluids, consult physician if persists"
);

// Query - automatically decrypted
const result = await cache.query({ 
  query: "Patient has headache symptoms" 
});

// Audit logs contain hashed queries only (not plaintext)
const logs = cache.getAuditLogs(100);
// logs[0].query_hash = "abc123..." (SHA-256, cannot be reversed)
// logs[0].query = undefined (never stored in strict mode)

// Clean up old audit logs (GDPR compliance)
cache.clearOldAuditLogs(90); // Keep last 90 days
```

---

## Example 10: Express.js Integration

Using with Express instead of Fastify:

```typescript
import express from 'express';
import { SemanticCacheService } from '@distributed-semantic-cache/api';

const app = express();
app.use(express.json());

const cache = new SemanticCacheService();

// Query endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    const result = await cache.query({ query: message });
    
    if (result.hit && result.response) {
      return res.json({
        response: result.response,
        cached: true,
        similarity: result.similarity,
        confidence: result.confidence,
      });
    }

    // Generate fresh response (your logic here)
    const freshResponse = await generateResponse(message);
    await cache.store(message, freshResponse);

    res.json({
      response: freshResponse,
      cached: false,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Stats endpoint
app.get('/api/cache/stats', async (req, res) => {
  res.json(cache.getStats());
});

app.listen(3000, () => console.log('Server running on port 3000'));
```

---

*Last Updated: December 2025*
