# Distributed Semantic Cache

**Open-source semantic caching for LLM applications. Reduce API costs by 50-80% while improving response times.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Tests](https://img.shields.io/badge/Tests-220%2B%20Passing-brightgreen.svg)](packages/api/__tests__)

## 🎯 Why Distributed Semantic Cache?

| Challenge | Solution |
|-----------|----------|
| **High LLM API costs** | Semantic caching reduces calls by 50-80% |
| **Slow response times** | Sub-millisecond cache hits vs 1-3s API calls |
| **Exact match limitations** | Semantic similarity catches paraphrased queries |
| **Data privacy concerns** | 100% local embeddings, your data never leaves |
| **Production scalability** | Kubernetes-ready with HNSW indexing for 100K+ vectors |

## 📦 SDK - The Developer Experience

```bash
npm install @distributed-semantic-cache/sdk
```

### Drop-in LLM Integration

```typescript
import { createOpenAIMiddleware, SemanticCache } from '@distributed-semantic-cache/sdk';
import OpenAI from 'openai';

// Setup cache
const cache = new SemanticCache({
  baseUrl: process.env.CACHE_URL,
  apiKey: process.env.CACHE_API_KEY,
});

// Create middleware
const middleware = createOpenAIMiddleware({ cache, threshold: 0.85 });

// Wrap your OpenAI calls - that's it!
const result = await middleware.chat(
  { model: 'gpt-4', messages: [{ role: 'user', content: 'Explain quantum computing' }] },
  () => openai.chat.completions.create({ model: 'gpt-4', messages: [...] })
);

if (result.cached) {
  console.log(`💰 Saved API call! Similarity: ${result.similarity}`);
}
```

### Also Supports
- **Anthropic Claude** - `createAnthropicMiddleware()`
- **Custom LLMs** - `createGenericLLMMiddleware()`
- **React Apps** - `createSemanticCacheHooks(React)`
- **Fluent Config** - `buildCache().withPreset('production').build()`

[📚 Full SDK Documentation](packages/sdk/README.md)

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your Application                        │
├─────────────────────────────────────────────────────────────────┤
│                         SDK Middleware                          │
│    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│    │   OpenAI    │    │  Anthropic  │    │   Custom    │        │
│    │  Middleware │    │  Middleware │    │     LLM     │        │
│    └──────┬──────┘    └──────┬──────┘    └──────┬──────┘        │
└───────────┼──────────────────┼──────────────────┼───────────────┘
            │                  │                  │
            ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Semantic Cache API                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────┐         │
│  │ L1: Exact   │ →  │L2: Normalized│ →  │L3: Semantic │         │
│  │   Match     │    │    Match     │    │   Search    │         │
│  │   O(1)      │    │    O(1)      │    │  O(log n)   │         │
│  └─────────────┘    └──────────────┘    └─────────────┘         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │   HNSW      │    │  Matryoshka │    │  Predictive │          │
│  │   Index     │    │   Cascade   │    │   Warming   │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
            │                  │                  │
            ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Storage & Embeddings                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │   SQLite    │    │    Local    │    │   OpenAI    │          │
│  │   Storage   │    │  Embeddings │    │  Embeddings │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Features

### Features
- **3-Layer Cache Architecture** - Exact → Normalized → Semantic matching
- **Local Embeddings** - 100% free, privacy-first (MiniLM, mpnet, e5)
- **Query Normalization** - Case, punctuation, contraction handling
- **Confidence Scoring** - Multi-factor cache hit confidence
- **SQLite Storage** - Lightweight, file-based, zero-config
- **Full REST API** - Query, store, stats, admin endpoints
- **React Chat UI** - Interactive demo and testing interface
- **Multi-Tenancy** - Complete data isolation, per-tenant quotas
- **Analytics** - Cost tracking, ROI dashboards, time-series metrics
- **Predictive Cache Warming** - Pattern-based pre-population
- **HNSW Indexing** - O(log n) search for 100K+ vectors
- **Matryoshka Cascade** - Adaptive dimension search (4-8x faster)
- **Production Ready** - Docker, Kubernetes, Terraform templates

## 📊 Performance

| Metric | Value |
|--------|-------|
| **Cache Hit Latency** | < 5ms |
| **L1 (Exact) Lookup** | O(1) |
| **L3 (Semantic) Search** | O(log n) with HNSW |
| **Vector Capacity** | 100K+ entries |
| **Storage Reduction** | 75% with quantization |
| **API Cost Savings** | 50-80% typical |

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+
- pnpm 8+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/distributed-semantic-cache.git
cd distributed-semantic-cache

# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
```

### Configuration

**Option A: Local Embeddings (Free, Privacy-First)** ⭐ Recommended
```env
EMBEDDING_PROVIDER=local
LOCAL_EMBEDDING_MODEL=all-MiniLM-L6-v2
```

**Option B: OpenAI Embeddings (Higher Quality)**
```env
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key
```

### Run

```bash
# Development mode (all packages)
pnpm dev

# Or individually
cd packages/api && pnpm dev   # API: http://localhost:3000
cd packages/web && pnpm dev   # Web: http://localhost:5173
```

## 📡 API Reference

### Query Cache
```bash
curl -X POST http://localhost:3000/api/cache/query \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"query": "What is TypeScript?", "threshold": 0.85}'
```

### Store Response
```bash
curl -X POST http://localhost:3000/api/cache/store \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"query": "What is TypeScript?", "response": "TypeScript is..."}'
```

### Get Statistics
```bash
curl http://localhost:3000/api/cache/stats \
  -H "x-api-key: YOUR_API_KEY"
```

[📖 Full API Documentation](docs/guides/EXAMPLES.md)

## 🐳 Production Deployment

### Docker
```bash
docker-compose up -d
```

### Kubernetes
```bash
kubectl apply -f deploy/kubernetes/
```

### Terraform (AWS)
```bash
cd deploy/terraform/aws
terraform init && terraform apply
```

[🚀 Deployment Guide](docs/guides/QUICKSTART.md)

## 📁 Project Structure

```
distributed-semantic-cache/
├── packages/
│   ├── api/           # Fastify REST API server
│   ├── sdk/           # TypeScript SDK for developers
│   ├── web/           # React demo application
│   └── shared/        # Shared types and utilities
├── deploy/
│   ├── kubernetes/    # K8s manifests
│   ├── terraform/     # Infrastructure as code
│   └── nginx/         # Reverse proxy config
└── docs/
    ├── architecture/  # System design docs
    ├── guides/        # User guides
    └── business/      # Strategy docs
```

## 📄 License

This project is licensed under the **MIT License** - see [LICENSE](LICENSE) for details.

Free to use, modify, and distribute for any purpose.

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [SDK Documentation](packages/sdk/README.md) | TypeScript SDK reference |
| [Quick Start Guide](docs/guides/QUICKSTART.md) | Get running in 5 minutes |
| [Architecture](docs/architecture/ARCHITECTURE.md) | System design overview |
| [Security Guide](docs/guides/SECURITY.md) | Production hardening |
| [Examples](docs/guides/EXAMPLES.md) | Integration patterns |

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run SDK tests
cd packages/sdk && pnpm test

# Run API tests
cd packages/api && pnpm test
```

**220+ tests passing** across all packages.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## 📞 Support

Have questions or need help?

- 📝 [Open an Issue](../../issues) for bugs or feature requests
- 💬 [Discussions](../../discussions) for questions and ideas
- ⭐ Star this repo if you find it useful!

---

<p align="center">
  <strong>Reduce LLM costs. Improve performance. Ship faster.</strong>
</p>

<p align="center">
  Built with ❤️ for the AI community
</p>
