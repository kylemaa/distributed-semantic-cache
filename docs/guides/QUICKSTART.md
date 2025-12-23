# Quick Start Guide

Get up and running with the Distributed Semantic Cache in 5 minutes!

## Prerequisites

- **Node.js 18+** installed
- **pnpm** package manager (`npm install -g pnpm`)
- **OpenAI API key** (optional - only if using OpenAI embeddings)

---

## Installation

### 1. Clone and Install

```bash
git clone <repository-url>
cd distributed-semantic-cache-poc
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

#### Option A: Free Local Embeddings (Recommended for Development)

No API key needed! Edit `.env`:

```env
EMBEDDING_PROVIDER=local
LOCAL_EMBEDDING_MODEL=all-MiniLM-L6-v2
```

#### Option B: OpenAI Embeddings (Higher Quality)

```env
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-your-key-here
```

### 3. Start the Application

**Terminal 1 - API Server:**
```bash
cd packages/api
pnpm dev
```

**Terminal 2 - Web Interface:**
```bash
cd packages/web
pnpm dev
```

### 4. Open the Application

Navigate to **http://localhost:5173** in your browser.

---

## Try It Out!

### Test Semantic Caching

1. Ask: **"What is the weather like today?"**
2. Wait for the response (marked as "🆕 Fresh")
3. Ask: **"How's the weather today?"** (slightly different wording)
4. Notice the instant response marked as "⚡ Cached" with a similarity score!

### Example Query Sets

Try these sets of semantically similar queries:

**Weather queries:**
- "What's the weather like today?"
- "How's the weather today?"
- "Tell me about today's weather"

**Definition queries:**
- "What is machine learning?"
- "Can you explain machine learning?"
- "Tell me about machine learning"

**Greeting queries:**
- "Hello, how are you?"
- "Hi there!"
- "Hey, what's up?"

---

## API Endpoints

Interact with the API directly:

### Query the cache

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is the weather today?"}'
```

### Store in cache

```bash
curl -X POST http://localhost:3000/api/cache/store \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the capital of France?",
    "response": "The capital of France is Paris."
  }'
```

### Get cache statistics

```bash
curl http://localhost:3000/api/cache/stats
```

### Clear the cache

```bash
curl -X DELETE http://localhost:3000/api/cache/clear
```

---

## Privacy Modes

### Normal Mode (Default)
```env
PRIVACY_MODE=normal
AUDIT_ENABLED=true
```

### Strict Mode (HIPAA/GDPR)
```env
PRIVACY_MODE=strict
ENCRYPTION_KEY=YourSecure32CharacterKeyHere!@#$
AUDIT_ENABLED=true
DISABLE_ANALYTICS=true
```

### Zero-Log Mode
```env
PRIVACY_MODE=off
AUDIT_ENABLED=false
```

---

## Configuration Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_PROVIDER` | `openai` | `openai` or `local` |
| `OPENAI_API_KEY` | - | Required for OpenAI |
| `LOCAL_EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Local model choice |
| `EMBEDDING_CACHE_SIZE` | `500` | Embedding LRU size |
| `EXACT_MATCH_CACHE_SIZE` | `1000` | L1 cache size |
| `SIMILARITY_THRESHOLD` | `0.85` | Match threshold |
| `ENABLE_QUANTIZATION` | `true` | 74% storage savings |
| `PRIVACY_MODE` | `normal` | strict/normal/off |

---

## Troubleshooting

### Port Already in Use

```env
API_PORT=3001
# Restart the API server
```

### First Query is Slow (Local Embeddings)

The first query downloads the model (~90MB). Subsequent queries are fast.

### CORS Errors

The web server proxies `/api` requests. Make sure both servers are running.

### Database Locked

```bash
rm packages/api/cache.db
# Restart the API server
```

---

## Next Steps

- 📖 [Examples](EXAMPLES.md) - Integration patterns
- 🏗️ [Architecture](../architecture/ARCHITECTURE.md) - System design
- 🔐 [Security](SECURITY.md) - Production hardening

---

*Last Updated: December 2025*
