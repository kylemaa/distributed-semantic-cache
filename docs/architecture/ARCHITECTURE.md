# System Architecture

A comprehensive overview of the Distributed Semantic Cache system architecture, featuring a 3-layer caching system with adaptive learning and privacy-first design.

## Table of Contents

1. [Overview](#overview)
2. [3-Layer Cache Architecture](#3-layer-cache-architecture)
3. [Core Components](#core-components)
4. [Smart Matching System](#smart-matching-system)
5. [Privacy & Security](#privacy--security)
6. [Performance Optimizations](#performance-optimizations)
7. [Enterprise Features](#enterprise-features)
8. [Data Flow](#data-flow)

---

## Overview

### Design Goals

| Goal | Solution |
|------|----------|
| **Cost Reduction** | 60-75% reduction in LLM API calls |
| **Low Latency** | Sub-millisecond exact matches, <50ms semantic matches |
| **Privacy First** | Local embeddings, AES-256 encryption, zero-log modes |
| **Adaptive Learning** | Self-tuning similarity thresholds per query type |
| **Scalability** | O(log n) HNSW search, handles 100K+ vectors |

### Technology Stack

```
┌─────────────────────────────────────────────────────────┐
│                    Web Interface                         │
│                  (React + Vite + TypeScript)            │
├─────────────────────────────────────────────────────────┤
│                     API Layer                            │
│                (Fastify + TypeScript)                    │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │  L1: Exact  │  │ L2: Normal  │  │  L3: Semantic   │  │
│  │  Match LRU  │  │  Match LRU  │  │   HNSW Index    │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────┤
│               Embedding Generation                       │
│        (OpenAI API or Local Transformer.js)             │
├─────────────────────────────────────────────────────────┤
│                   SQLite Storage                         │
│    (Quantized vectors, encrypted at rest optional)      │
└─────────────────────────────────────────────────────────┘
```

---

## 3-Layer Cache Architecture

### Layer 1: Exact Match Cache (O(1))

**Purpose:** Instant lookup for identical queries with zero cost.

```
Query → Hash Lookup → Hit/Miss
         ~0.5ms       100% confidence
```

- **Implementation:** LRU cache with configurable capacity (default: 1000)
- **Confidence:** 1.0 (perfect match)
- **Memory:** ~100KB per 1000 entries

### Layer 2: Normalized Match Cache (O(1))

**Purpose:** Catch query variations that are semantically identical.

```
Query → Normalize → Hash Lookup → Hit/Miss
         ~0.3ms       ~0.5ms       98% confidence
```

**Normalization Pipeline:**
1. **Case normalization:** "HELLO" → "hello"
2. **Whitespace collapsing:** "hello    world" → "hello world"
3. **Contraction expansion:** "what's" → "what is", "can't" → "cannot"
4. **Stop word removal** (optional): "what is the weather" → "what weather"

### Layer 3: Semantic Match (O(log n) with HNSW)

**Purpose:** Find conceptually similar queries using vector similarity.

```
Query → Embedding → HNSW Search → Top-K → Confidence Score
         ~50ms        ~5ms         ~1ms      Variable
```

- **Algorithm:** Cosine similarity on normalized embeddings
- **Index:** HNSW (Hierarchical Navigable Small World) graph
- **Confidence:** Variable (0.50-0.95 based on multiple factors)

### Layer Summary

| Layer | Lookup | Latency | Confidence | Use Case |
|-------|--------|---------|------------|----------|
| L1: Exact | O(1) | <1ms | 1.0 | Identical queries |
| L2: Normalized | O(1) | ~1ms | 0.98 | Case/punctuation variations |
| L3: Semantic | O(log n) | ~50ms | Variable | Conceptual similarity |

---

## Core Components

### Embeddings Service (`embeddings.ts`)

**Dual Provider Architecture:**

| Provider | Cost | Privacy | Quality | Latency |
|----------|------|---------|---------|---------|
| OpenAI | $0.02/1K | Low | Highest | 150-300ms |
| Local (Transformer.js) | FREE | Complete | High | 50-150ms |

**Supported Local Models:**
- `all-MiniLM-L6-v2` - 384 dimensions, fast (default)
- `all-mpnet-base-v2` - 768 dimensions, higher quality
- `e5-small-v2` - 384 dimensions, multilingual

**Caching:** LRU cache prevents duplicate embedding generation.

### Cache Service (`cache-service.ts`)

**Central orchestrator managing:**
- 3-layer cache lookup
- Embedding generation with provider selection
- Quantization/encryption pipeline
- Audit logging
- Statistics collection

### Database Layer (`database.ts`)

**SQLite schema:**
```sql
CREATE TABLE cache_entries (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  response TEXT NOT NULL,
  embedding TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  metadata TEXT,
  quantized_embedding BLOB,
  encrypted_embedding BLOB,
  encryption_metadata TEXT
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  action TEXT NOT NULL,
  entry_id TEXT,
  query_hash TEXT,
  success INTEGER NOT NULL,
  metadata TEXT
);
```

### HNSW Index (`hnsw-index.ts`)

**Approximate Nearest Neighbor search:**
- O(log n) lookup vs O(n) brute force
- Configurable M (connections) and efConstruction parameters
- Handles 100K+ vectors efficiently

### Matryoshka Cascade (`matryoshka-cascade.ts`)

**Multi-resolution vector search:**
- Starts with low-dimension prefix (faster filtering)
- Progressively uses more dimensions for precision
- 4-8x faster than full-dimension search

---

## Smart Matching System

### Confidence Scoring (`confidence.ts`)

**Multi-factor confidence calculation:**

```
Confidence = w₁×Similarity + w₂×LayerBonus + w₃×AgeDecay + w₄×FrequencyBoost + w₅×ComplexityAdjust
```

**Factors:**
| Factor | Weight | Description |
|--------|--------|-------------|
| Similarity | 0.5 | Base cosine similarity |
| Layer Bonus | 0.2 | L1=+0.2, L2=+0.15, L3=0 |
| Age Decay | 0.1 | Newer entries score higher |
| Frequency | 0.1 | Popular entries get boost |
| Complexity | 0.1 | Longer queries tolerate lower similarity |

**Confidence Levels:**
- **VERY_HIGH** (0.95-1.0): Use with complete confidence
- **HIGH** (0.85-0.95): Reliable match
- **MEDIUM** (0.70-0.85): Acceptable with caution
- **LOW** (0.50-0.70): Review before using
- **VERY_LOW** (<0.50): Not recommended

### Adaptive Threshold Learning (`threshold-learner.ts`)

**Self-tuning similarity thresholds per query type:**

| Query Type | Initial Threshold | Learning Mechanism |
|------------|-------------------|-------------------|
| Question | 0.88 | Stricter (accuracy important) |
| Command | 0.82 | More lenient |
| Statement | 0.85 | Balanced |
| Greeting | 0.90 | Very strict |

**Learning Algorithm:** Exponential Moving Average
```
threshold_new = α × feedback + (1-α) × threshold_old
```

### Query Pattern Clustering (`query-clusterer.ts`)

**Identifies recurring query patterns:**

1. **Keyword Extraction:** Pulls key terms from queries
2. **Jaccard Similarity:** Clusters queries with similar terms
3. **Pattern Centroids:** Top 10 terms per cluster
4. **Frequency Tracking:** Identifies popular patterns

**Example:** "weather in NYC", "NYC weather", "New York weather" → Same pattern

---

## Privacy & Security

### Encryption (`encryption.ts`)

**AES-256-GCM encryption at rest:**
- PBKDF2 key derivation (100,000 iterations)
- Random 16-byte IV per encryption
- Authentication tags prevent tampering

### Privacy Modes

| Mode | Encryption | Audit Logs | Analytics |
|------|------------|------------|-----------|
| **strict** | AES-256-GCM | Hashed queries only | Disabled |
| **normal** | None | Full logging | Enabled |
| **off** | None | Disabled | Enabled |

### Compliance Features

| Framework | Feature Support |
|-----------|----------------|
| **HIPAA** | ✅ Encryption, ✅ Audit trails, ✅ Access controls |
| **GDPR** | ✅ Right to erasure, ✅ Data minimization, ✅ Retention policies |
| **SOC 2** | ✅ Monitoring, ✅ Logical access, ✅ Data classification |

---

## Performance Optimizations

### Vector Quantization (`quantization.ts`)

**Compresses 384-dim embeddings by 74%:**

```
Original:   float32[384] = 1,536 bytes
Quantized:  uint8[384] + min/max = 400 bytes
Reduction:  74%
Accuracy:   <1% cosine similarity error
```

**Algorithm:** Min-max scaling to [0, 255] with per-vector scale factors.

### Embedding Cache

**LRU cache for generated embeddings:**
- Prevents duplicate OpenAI API calls
- Default: 500 embeddings (~750KB)
- 30-40% API call reduction

### Expected Performance

| Database Size | Storage | Query Latency (L3) |
|--------------|---------|-------------------|
| 100 entries | 39 KB | ~20ms |
| 1,000 entries | 391 KB | ~25ms |
| 10,000 entries | 3.9 MB | ~35ms |
| 100,000 entries | 39 MB | ~50ms |

---

## Enterprise Features

### Multi-Tenancy (`tenant-manager.ts`)

**Complete data isolation:**
- Per-tenant databases
- Quota management (monthly limits)
- Feature flags (encryption, audit, smart matching)
- Usage statistics and billing

### Advanced Analytics (`analytics-service.ts`)

**Comprehensive insights:**
- Real-time cost savings dashboard
- Time-series hit rate data
- Query pattern detection
- P50, P95, P99 latency percentiles
- CSV/JSON export

### Production Deployment

**Deployment Options:**
- **Docker:** Multi-stage build, <100MB image
- **Kubernetes:** HPA (2-10 replicas), persistent volumes
- **AWS ECS Fargate:** Serverless containers
- **Terraform IaC:** Automated infrastructure

---

## Data Flow

### Query Flow (Complete)

```
                                    ┌─────────────────┐
                                    │    Client       │
                                    └────────┬────────┘
                                             │
                                    ┌────────▼────────┐
                                    │  API Gateway    │
                                    └────────┬────────┘
                                             │
              ┌──────────────────────────────┼──────────────────────────────┐
              │                              │                              │
              ▼                              ▼                              ▼
    ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
    │   L1: Exact     │   MISS   │  L2: Normalized │   MISS   │  L3: Semantic   │
    │   Match LRU     │ ───────► │   Match LRU     │ ───────► │   HNSW Search   │
    └────────┬────────┘          └────────┬────────┘          └────────┬────────┘
             │ HIT                        │ HIT                        │ HIT
             │                            │                            │
             └──────────────┬─────────────┴──────────────┬─────────────┘
                            │                            │
                   ┌────────▼────────┐          ┌────────▼────────┐
                   │   Confidence    │          │    Generate     │
                   │   Calculation   │          │    Embedding    │
                   └────────┬────────┘          └────────┬────────┘
                            │                            │
                   ┌────────▼────────┐          ┌────────▼────────┐
                   │   Audit Log     │          │  Store in DB    │
                   └────────┬────────┘          └────────┬────────┘
                            │                            │
                   ┌────────▼────────────────────────────▼────────┐
                   │              Response to Client               │
                   └───────────────────────────────────────────────┘
```

### Store Flow

```
Query + Response
       │
       ▼
┌─────────────────┐
│   Normalize     │
│     Query       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│   Generate      │     │  Check Embed    │
│   Embedding     │ ◄── │     Cache       │
└────────┬────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│   Quantize      │     │    Encrypt      │
│   (optional)    │ ──► │  (strict mode)  │
└────────┬────────┘     └────────┬────────┘
         │                       │
         ▼                       ▼
┌───────────────────────────────────────────┐
│           SQLite Storage                   │
│  (query, response, embedding, metadata)   │
└───────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Update L1 LRU  │     │  Update L2 LRU  │
└─────────────────┘     └─────────────────┘
         │
         ▼
┌─────────────────┐
│   Audit Log     │
└─────────────────┘
```

---

## Configuration Reference

### Environment Variables

```bash
# Embedding Provider
EMBEDDING_PROVIDER=local           # 'openai' or 'local'
OPENAI_API_KEY=sk-...             # Required for openai provider
LOCAL_EMBEDDING_MODEL=all-MiniLM-L6-v2

# Cache Configuration
EMBEDDING_CACHE_SIZE=500           # LRU cache for embeddings
EXACT_MATCH_CACHE_SIZE=1000        # L1 cache size
NORMALIZED_CACHE_SIZE=1000         # L2 cache size
SIMILARITY_THRESHOLD=0.85          # Base semantic threshold

# Storage
ENABLE_QUANTIZATION=true           # 74% storage reduction
DATABASE_PATH=./cache.db           # SQLite database path

# Privacy
PRIVACY_MODE=normal                # 'strict', 'normal', 'off'
ENCRYPTION_KEY=...                 # Required for strict mode (32+ chars)
AUDIT_ENABLED=true                 # Enable audit logging
AUDIT_RETENTION_DAYS=30            # Days to keep audit logs

# Performance
HNSW_M=16                          # HNSW connections per node
HNSW_EF_CONSTRUCTION=200           # HNSW build quality
HNSW_EF_SEARCH=50                  # HNSW search quality
```

---

## Development History

This architecture evolved through multiple development phases:

| Phase | Focus | Key Additions |
|-------|-------|---------------|
| **Phase 1** | Core Caching | LRU cache, exact match, quantization |
| **Phase 2.1** | Local Models | Transformer.js, 100% free embeddings |
| **Phase 2.2** | Privacy | AES-256 encryption, audit logs |
| **Phase 2.3** | Smart Matching | Normalization, confidence, thresholds |
| **Phase 3** | Enterprise | Multi-tenancy, analytics, deployment |
| **Phase 4** | Scale | HNSW index, Matryoshka cascade |

---

## File Reference

### Core Files

| File | Purpose | Lines |
|------|---------|-------|
| `cache-service.ts` | Central cache orchestrator | ~400 |
| `embeddings.ts` | Embedding generation | ~200 |
| `database.ts` | SQLite operations | ~250 |
| `hnsw-index.ts` | HNSW nearest neighbor | ~300 |
| `matryoshka-cascade.ts` | Multi-resolution search | ~200 |

### Smart Matching

| File | Purpose | Lines |
|------|---------|-------|
| `normalize.ts` | Query normalization | ~200 |
| `confidence.ts` | Confidence scoring | ~150 |
| `threshold-learner.ts` | Adaptive thresholds | ~200 |
| `query-clusterer.ts` | Pattern detection | ~220 |

### Privacy

| File | Purpose | Lines |
|------|---------|-------|
| `encryption.ts` | AES-256-GCM encryption | ~270 |
| `tenant-manager.ts` | Multi-tenancy | ~470 |

### Analytics

| File | Purpose | Lines |
|------|---------|-------|
| `analytics-service.ts` | Cost/performance analytics | ~536 |

---

*Last Updated: December 2025*
