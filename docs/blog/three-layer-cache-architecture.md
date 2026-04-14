# How a 3-Layer Cache Architecture Cuts LLM API Costs by 75%

*The engineering decisions behind Distributed Semantic Cache — and why the middle layer matters more than you'd think.*

---

LLM API calls are slow and expensive. A single GPT-4 call costs $0.03-0.06 per 1K tokens and takes 500-2000ms. At scale, this adds up fast: 1M queries/month at even modest token counts can hit $30K/month in API costs alone.

The obvious solution is caching. But the obvious implementation — exact-match caching — only catches 20-30% of repeated queries. Users don't ask "What is TypeScript?" the same way twice. They ask "what is typescript?", "What's TypeScript?", "Explain TypeScript to me", and "Can you tell me about TS?" — all wanting the same answer, all generating separate API calls.

This post describes the three-layer cache architecture we built to solve this, why each layer exists, and the HNSW tradeoffs that make semantic matching practical at scale.

## The Architecture

```
Query → L1: Exact Match (hash lookup, <0.2ms)
         ↓ miss
       L2: Normalized Match (canonical form + hash, ~0.3ms)
         ↓ miss
       L3: Semantic Match (embedding similarity via HNSW, 5-50ms)
         ↓ miss
       LLM API call (100-2000ms, $$$)
```

Each layer trades a small amount of latency for a larger class of cache hits. The key insight is that **you don't need the expensive layer most of the time** — L1 and L2 handle 50-65% of hits at sub-millisecond cost, and L3 only runs for the remainder.

## Layer 1: Exact Match

The simplest layer. Hash the raw query string, check an in-memory LRU cache.

- **Complexity**: O(1)
- **Latency**: ~0.12ms
- **Hit rate contribution**: 10-40% (depends on workload)
- **Confidence**: 1.0 (exact match = guaranteed correct)

This catches repeated queries from the same user, retries, and automated systems that send identical requests. In a support chatbot scenario, this alone catches 40% of queries because users frequently ask the same top-20 questions verbatim.

Nothing novel here — this is what every caching system does. The value is in what comes next.

## Layer 2: Normalized Match (The Underrated Middle Layer)

Before giving up on cheap O(1) lookups, we normalize the query and try again:

```
"What's the weather TODAY?!?"
  → lowercase:            "what's the weather today?!?"
  → strip punctuation:    "whats the weather today"
  → expand contractions:  "what is the weather today"
  → normalize whitespace: "what is the weather today"
  → hash → LRU lookup
```

- **Complexity**: O(1) (normalization is O(n) on query length, but queries are short)
- **Latency**: ~0.29ms
- **Hit rate contribution**: +7-15% over L1 alone
- **Confidence**: 0.98

This layer is the highest-ROI addition to the system. It catches case variations, punctuation differences, and contraction mismatches — all at near-zero latency cost. In our ablation study, adding normalization boosted hit rate by **16.1 percentage points** while adding only ~0.17ms of latency.

Most semantic cache implementations skip straight from exact match to embeddings. This is a mistake. The normalized layer catches a surprising number of "almost exact" matches without paying the embedding cost.

### Why not just normalize at L1?

Because you lose exact-match confidence. An exact match at L1 is guaranteed to be the same query. A normalized match is *probably* the same, but "What is TypeScript?" and "what is typescript" might have been asked in different contexts. Keeping them separate lets us track confidence differently and give users transparent explanations of where their cache hit came from.

## Layer 3: Semantic Match

For queries that aren't string-similar but mean the same thing — "What is TypeScript?" vs. "Explain the TypeScript programming language" — we need embeddings.

The process:
1. Generate an embedding vector for the query (768 dimensions with `text-embedding-3-small`)
2. Search the vector index for the nearest neighbor above a similarity threshold
3. Return the cached response if confidence is sufficient

- **Complexity**: O(log n) with HNSW
- **Latency**: 5-50ms (depending on index size)
- **Hit rate contribution**: +15-30% over L1+L2
- **Confidence**: Variable (0.50-0.95, based on multi-factor scoring)

### The HNSW Tradeoff

The naive approach — compare the query embedding against every stored embedding using cosine similarity — is O(n) and works fine up to ~10K entries. Beyond that, it becomes impractical for real-time serving.

We use HNSW (Hierarchical Navigable Small World) graphs for approximate nearest neighbor search. The tradeoffs:

**What you gain:**
- O(log n) search instead of O(n)
- Sub-50ms queries at 100K entries
- Practical for real-time serving

**What you lose:**
- ~0.1% recall loss (99.7% vs 99.8% in our tests)
- Higher memory usage (graph structure overhead)
- O(log n) insert time (vs O(1) for flat index)

**The tuning knobs:**
- `M` (connections per node): Higher = better recall, more memory. We use M=16.
- `efSearch` (search beam width): Higher = better recall, slower search. We use efSearch=50.

In practice, the recall loss is negligible. Our ablation study showed that switching from brute force to HNSW dropped hit rate from 99.8% to 99.7% while making searches 17% faster.

### Adaptive Thresholds

A fixed similarity threshold (e.g., 0.85) doesn't work across all query types. Short queries need higher thresholds because small embedding differences are more meaningful. Questions need higher precision than commands.

We learn thresholds per query type using an exponential moving average:

```
new_threshold = α × success_score + (1 - α) × old_threshold
```

With length-based adjustment:
- Short queries (<10 chars): threshold += 0.05
- Long queries (>50 chars): threshold -= 0.05

This trades some recall for precision — our ablation showed a -13% hit rate vs. fixed thresholds, but those lost hits were low-quality matches that would have confused users.

### Confidence Scoring

Similarity alone isn't enough to decide whether to return a cached response. We combine multiple signals:

```
confidence = similarity × 0.5
           + layer_bonus × 0.2
           + (1 - age_decay) × 0.1
           + frequency_boost × 0.1
           + complexity_factor × 0.1
```

A 0.87 similarity match that's been hit 50 times today scores higher than a 0.90 match from 3 weeks ago. This lets the system learn which cache entries are reliable over time.

## Storage Efficiency: Quantization

768-dimensional float32 embeddings take ~3KB each. At 100K entries, that's 300MB just for vectors.

We use min-max uint8 quantization to compress each dimension from 4 bytes to 1 byte:

```
quantized = round(255 × (value - min) / (max - min))
```

This gives **74% storage reduction** with less than 0.1% accuracy loss in similarity calculations. The ranking order of nearest neighbors is preserved in 99.9% of cases.

## The Numbers

Real benchmark results from our test suite:

| Metric | Value |
|--------|-------|
| L1 latency | 0.12ms |
| L2 latency | 0.29ms |
| L3 latency | 5-50ms |
| Miss latency | 100-300ms |
| Combined hit rate | 60-75% |
| Storage per entry (quantized) | ~400 bytes |
| Throughput (L1/L2 hits) | ~5M qps |

### Cost Impact

At 1M queries/month with a 70% hit rate:

| | Without Cache | With Cache |
|---|---|---|
| LLM API calls | 1,000,000 | 300,000 |
| Monthly cost (GPT-4) | $30,000 | $9,000 |
| **Savings** | | **$21,000/month** |

The cache server itself runs on a single node with ~50MB of memory for 100K entries.

## Production Considerations

### Storage Backends

SQLite works for development and single-node deployments. For production:

- **PostgreSQL + pgvector** — ACID compliance, horizontal scaling via read replicas, managed service support (RDS, Supabase, Neon). This is what most teams should use.
- **Qdrant** — Purpose-built vector database, best for very large vector collections (1M+).
- **Redis** — For the L1/L2 fast path in distributed deployments where multiple API server instances need to share cache state.

The storage layer is pluggable — swap backends via environment variables without code changes.

### Privacy

In regulated environments, caching user queries raises compliance concerns. The system supports three privacy modes:

- **`strict`**: All cached content encrypted with AES-256-GCM, audit logs contain only query hashes
- **`normal`**: Full logging, no encryption
- **`off`**: No audit logging

### Multi-Tenancy

Each tenant gets isolated cache namespaces, per-tenant quotas, and independent hit rate tracking. Tenants can't see each other's cached data even when sharing the same infrastructure.

## What We'd Do Differently

1. **Start with pgvector in production sooner.** SQLite is great for development, but teams evaluating the system for production want to see it work with their existing Postgres.

2. **Binary quantization.** Min-max uint8 gives 4x compression. Binary (1-bit per dimension) would give 32x with ~5% recall loss — worth it for the L3 candidate filtering step.

3. **Matryoshka cascade.** We implemented this — using the first 64-256 dimensions as a fast pre-filter before full-dimension comparison — but it should have been the default from the start. It's 4-8x faster for the filtering step.

## Try It

The full system is open source: [github.com/kylemaa/distributed-semantic-cache-poc](https://github.com/kylemaa/distributed-semantic-cache-poc)

```bash
# Quick start
git clone https://github.com/kylemaa/distributed-semantic-cache-poc.git
cd distributed-semantic-cache-poc
pnpm install
pnpm dev
```

The SDK is available on npm:

```bash
npm install @distributed-semantic-cache/sdk
```

Drop-in middleware for OpenAI and Anthropic means you can add caching to an existing LLM app in about 5 lines of code:

```typescript
import { createOpenAIMiddleware, SemanticCache } from '@distributed-semantic-cache/sdk';

const middleware = createOpenAIMiddleware({
  cache: new SemanticCache({ baseUrl: 'http://localhost:3000' }),
});

// Wrap your existing OpenAI call
const result = await middleware.chat(
  { model: 'gpt-4', messages: [{ role: 'user', content: userQuery }] },
  () => openai.chat.completions.create({ model: 'gpt-4', messages })
);
```

---

*Built by [Kyle Ma](https://github.com/kylemaa). If this is useful, a star on GitHub helps others find it.*
