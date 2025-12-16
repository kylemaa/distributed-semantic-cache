# Quick Start Guide

Get up and running with the Distributed Semantic Cache POC in 5 minutes!

## 🆕 Phase 2 Update: FREE Local Embeddings!

**NEW:** You can now run the cache with 100% FREE embeddings (no API key needed)!

## Prerequisites

Make sure you have:
- Node.js 18 or higher installed
- An OpenAI API key (optional - only if using OpenAI embeddings)

## Setup Steps

### 1. Install pnpm

If you don't have pnpm installed:

```bash
npm install -g pnpm
```

### 2. Clone and Install

```bash
git clone <repository-url>
cd distributed-semantic-cache-poc
pnpm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```env
OPENAI_API_KEY=sk-your-key-here
```

### 4. Start the Application

In one terminal, start the API server:

```bash
cd packages/api
pnpm dev
```

In another terminal, start the web UI:

```bash
cd packages/web
pnpm dev
```

### 5. Open the Application

Navigate to http://localhost:5173 in your browser.

## Try It Out!

### Test Semantic Caching

1. Ask: "What is the weather like today?"
2. Wait for the response (will be marked as "🆕 Fresh")
3. Ask: "How's the weather today?" (slightly different wording)
4. Notice the instant response marked as "⚡ Cached" with a similarity score!

### Example Queries to Test

Try these sets of semantically similar queries:

**Weather queries:**
- "What's the weather like today?"
- "How's the weather today?"
- "Tell me about today's weather"

**Greeting queries:**
- "Hello, how are you?"
- "Hi there!"
- "Hey, what's up?"

**Definition queries:**
- "What is machine learning?"
- "Can you explain machine learning?"
- "Tell me about machine learning"

## Architecture Overview

```
User → React Chat UI → Fastify API → OpenAI Embeddings
                           ↓
                       SQLite Cache
```

## Key Features Being Demonstrated

1. **Semantic Similarity**: Different wordings of the same question return the same cached answer
2. **Instant Responses**: Cached responses return immediately (no API call needed)
3. **Similarity Scores**: See how similar your query is to the cached entry
4. **Cache Statistics**: View how many entries are in the cache

## API Endpoints

You can also interact with the API directly:

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

## Troubleshooting

### Port already in use

If port 3000 or 5173 is already in use, you can change them in `.env`:

```env
API_PORT=3001
VITE_API_URL=http://localhost:3001
```

### OpenAI API errors

- Make sure your API key is valid and has credits
- Check that you've set `OPENAI_API_KEY` in `.env`
- The default model is `text-embedding-3-small` (very affordable)

### Database errors

The SQLite database is created automatically at `./cache.db`. If you get permission errors, make sure the directory is writable.

## Next Steps

- Experiment with different similarity thresholds (default: 0.85)
- Try different embedding models
- Integrate with a real LLM for generating responses
- Add authentication and authorization
- Deploy to production

## Learn More

See [README.md](./README.md) for complete documentation.
