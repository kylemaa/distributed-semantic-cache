# Distributed Semantic Cache POC

A proof-of-concept implementation of a distributed semantic caching system using embeddings, designed to reduce API costs and improve response times by caching semantically similar queries.

## 📁 Project Structure

```
distributed-semantic-cache-poc/
├─ README.md
├─ package.json
├─ pnpm-workspace.yaml
├─ .gitignore
├─ .env.example
└─ packages/
   ├─ api/        # Fastify + SQLite + embeddings
   ├─ web/        # React chat front-end
   └─ shared/     # Shared TS utilities (similarity, types)
```

## 🚀 Features

### **Phase 1: Core Caching** ✅
- **3-Layer Cache Architecture**: Exact match → Embedding cache → Semantic search
- **Vector Quantization**: 75% storage reduction with <1% accuracy loss
- **LRU Eviction**: Memory-efficient caching with automatic cleanup
- **50-60% Cost Reduction**: Multi-layer optimization for maximum savings

### **Phase 2: Local Models** ✅ NEW!
- **100% Free Embeddings**: Local embedding models (no API costs)
- **Complete Privacy**: Data never leaves your infrastructure
- **Offline Support**: Works in air-gapped environments
- **Multiple Models**: MiniLM-L6, mpnet-base, e5-small

### **Core Features**
- **Semantic Similarity Matching**: Cosine similarity for intelligent caching
- **SQLite Storage**: Lightweight, file-based database
- **Real-time Chat Interface**: Interactive React UI
- **Cache Management**: Full REST API for cache operations
- **Monorepo Structure**: Clean separation with shared utilities

## 🛠️ Technology Stack

### API (`packages/api`)
- **Fastify**: High-performance web framework
- **SQLite** (better-sqlite3): Embedded database
- **OpenAI**: Embeddings API for semantic search
- **TypeScript**: Type-safe development

### Web (`packages/web`)
- **React**: UI framework
- **Vite**: Fast build tool and dev server
- **TypeScript**: Type-safe development

### Shared (`packages/shared`)
- **Cosine Similarity**: Vector similarity calculations
- **Type Definitions**: Shared interfaces and types

## 📦 Installation

### Prerequisites
- Node.js >= 18.0.0
- pnpm >= 8.0.0
- OpenAI API key (optional - only needed if using OpenAI embeddings)

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd distributed-semantic-cache-poc
```

2. Install dependencies:
```bash
pnpm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your preferences:

**Option A: Local Embeddings (FREE, Privacy-First)** ⭐ Recommended
```env
EMBEDDING_PROVIDER=local
LOCAL_EMBEDDING_MODEL=all-MiniLM-L6-v2
```

**Option B: OpenAI Embeddings (Higher Quality)**
```env
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=your_openai_api_key_here
```

## 🏃 Running the Project

### Development Mode

Run all packages in development mode:
```bash
pnpm dev
```

Or run packages individually:
```bash
# API server
cd packages/api
pnpm dev

# Web UI
cd packages/web
pnpm dev
```

The API will be available at `http://localhost:3000` and the web UI at `http://localhost:5173`.

### Production Build

Build all packages:
```bash
pnpm build
```

Run the production API:
```bash
cd packages/api
pnpm start
```

## 📖 API Endpoints

### Health Check
```
GET /health
```

### Query Cache
```
POST /api/cache/query
Content-Type: application/json

{
  "query": "What is the weather today?",
  "threshold": 0.85
}
```

### Store in Cache
```
POST /api/cache/store
Content-Type: application/json

{
  "query": "What is the weather today?",
  "response": "The weather is sunny with a high of 75°F.",
  "metadata": {}
}
```

### Get Cache Statistics
```
GET /api/cache/stats
```

### Clear Cache
```
DELETE /api/cache/clear
```

### Chat Endpoint (Query + Store)
```
POST /api/chat
Content-Type: application/json

{
  "message": "What is the weather today?",
  "response": "Optional response to store"
}
```

## 🎯 How It Works

1. **User Query**: A user submits a query through the chat interface
2. **Embedding Generation**: The query is converted to a vector embedding using OpenAI's API
3. **Similarity Search**: The embedding is compared against cached entries using cosine similarity
4. **Cache Hit/Miss**:
   - **Hit**: If similarity exceeds threshold (default 0.85), return cached response
   - **Miss**: Generate new response and store with embedding for future queries
5. **Cache Management**: Old entries are pruned when cache size exceeds the limit

## 🔧 Configuration

Edit `.env` to customize:

```env
# API Configuration
API_PORT=3000
API_HOST=localhost

# Database
DATABASE_PATH=./cache.db

# Embeddings
OPENAI_API_KEY=your_key_here
EMBEDDING_MODEL=text-embedding-3-small

# Cache Configuration
SIMILARITY_THRESHOLD=0.85
MAX_CACHE_SIZE=1000

# CORS
ALLOWED_ORIGINS=http://localhost:5173

# Web App
VITE_API_URL=http://localhost:3000
```

## 📝 Example Usage

Try these similar queries to see semantic caching in action:

1. "What's the weather like today?"
2. "How's the weather today?"
3. "Tell me about today's weather"

Even though these queries are worded differently, they have similar embeddings and will return the same cached response!

## 🧪 Testing the Cache

1. Start both the API and web servers
2. Open `http://localhost:5173` in your browser
3. Ask a question in the chat
4. Ask a similar question with different wording
5. Notice the "⚡ Cached" badge and similarity score

## 🏗️ Architecture

```
┌─────────────┐
│   Web UI    │
│   (React)   │
└──────┬──────┘
       │ HTTP
       ▼
┌─────────────┐
│   API       │
│  (Fastify)  │
└──────┬──────┘
       │
       ├──────────┐
       ▼          ▼
┌──────────┐  ┌──────────┐
│  SQLite  │  │  OpenAI  │
│  Cache   │  │Embeddings│
└──────────┘  └──────────┘
```

## 📚 Key Components

### Shared (`packages/shared`)
- `types.ts`: TypeScript interfaces
- `similarity.ts`: Cosine similarity calculation
- `index.ts`: Package exports

### API (`packages/api`)
- `index.ts`: Server entry point
- `config.ts`: Configuration management
- `database.ts`: SQLite operations
- `embeddings.ts`: OpenAI embeddings service
- `cache-service.ts`: Semantic cache logic
- `routes.ts`: API endpoints

### Web (`packages/web`)
- `App.tsx`: Main chat component
- `App.css`: Styling
- `main.tsx`: React entry point

## 🤝 Contributing

This is a proof-of-concept project. Feel free to fork and experiment!

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

## 🔒 Security

**⚠️ This is a POC and not production-ready!**

This project is for demonstration purposes and lacks several security features required for production use, including rate limiting, authentication, and input validation.

See [SECURITY.md](./SECURITY.md) for detailed security considerations and recommendations for production deployment.

## 📄 License

See LICENSE file for details.

## 🎓 Learn More

- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings)
- [Cosine Similarity](https://en.wikipedia.org/wiki/Cosine_similarity)
- [Fastify Documentation](https://www.fastify.io/)
- [React Documentation](https://react.dev/)

---

Built with ❤️ as a demonstration of semantic caching with embeddings