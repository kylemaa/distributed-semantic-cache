# Documentation

Welcome to the Distributed Semantic Cache documentation.

---

## Quick Links

| Document | Description |
|----------|-------------|
| [Quick Start](guides/QUICKSTART.md) | Get running in 5 minutes |
| [Architecture](architecture/ARCHITECTURE.md) | System design overview |
| [Examples](guides/EXAMPLES.md) | Integration patterns |
| [Benchmarks](BENCHMARKS.md) | Performance analysis |
| [Security](guides/SECURITY.md) | Production hardening |

---

## Documentation Structure

```
docs/
├── README.md                    # This file
├── BENCHMARKS.md                # Performance benchmarks
├── architecture/
│   ├── ARCHITECTURE.md          # Complete system design
│   ├── DEVELOPMENT_HISTORY.md   # Phase-by-phase evolution
│   └── TECHNICAL_PAPER.md       # Defensive publication
├── guides/
│   ├── QUICKSTART.md            # Getting started
│   ├── EXAMPLES.md              # Integration patterns
│   └── SECURITY.md              # Security considerations
└── business/
    ├── COMPETITIVE_STRATEGY.md  # Market positioning
    ├── OPTIMIZATION_STRATEGY.md # Cost reduction techniques
    └── IP_PROTECTION.md         # IP and licensing
```

---

## By Topic

### Getting Started

1. **[Quick Start](guides/QUICKSTART.md)** - Install and run in 5 minutes
2. **[Examples](guides/EXAMPLES.md)** - Common integration patterns
3. **[Configuration](#configuration)** - Environment variables

### Understanding the System

1. **[Architecture](architecture/ARCHITECTURE.md)** - 3-layer cache design
2. **[Development History](architecture/DEVELOPMENT_HISTORY.md)** - How we built it
3. **[Technical Paper](architecture/TECHNICAL_PAPER.md)** - Academic-style description

### Production Deployment

1. **[Security](guides/SECURITY.md)** - Hardening checklist
2. **[Optimization](business/OPTIMIZATION_STRATEGY.md)** - Cost reduction
3. **[Docker/K8s](../deploy/)** - Deployment templates

### Business & Strategy

1. **[Competitive Analysis](business/COMPETITIVE_STRATEGY.md)** - Market position
2. **[IP Protection](business/IP_PROTECTION.md)** - Licensing model
3. **[Open Core](architecture/OPEN_CORE_ARCHITECTURE.md)** - Feature split

---

## Configuration

### Essential Variables

```bash
# Embedding provider (local = free, openai = higher quality)
EMBEDDING_PROVIDER=local

# For OpenAI provider
OPENAI_API_KEY=sk-...

# Local model selection
LOCAL_EMBEDDING_MODEL=all-MiniLM-L6-v2
```

### Cache Settings

```bash
# L1 exact match cache
EXACT_MATCH_CACHE_SIZE=1000

# Embedding LRU cache
EMBEDDING_CACHE_SIZE=500

# Semantic match threshold (0.0-1.0)
SIMILARITY_THRESHOLD=0.85

# Storage optimization (74% savings)
ENABLE_QUANTIZATION=true
```

### Privacy Settings

```bash
# Privacy mode: strict (encrypted), normal, off
PRIVACY_MODE=normal

# Required for strict mode (32+ characters)
ENCRYPTION_KEY=YourSecure32CharacterKey...

# Audit logging
AUDIT_ENABLED=true
AUDIT_RETENTION_DAYS=30
```

### Server Settings

```bash
# API server port
API_PORT=3000

# Web server port (Vite)
WEB_PORT=5173

# Database path
DATABASE_PATH=./cache.db
```

---

## API Reference

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat` | Query with auto-cache |
| POST | `/api/cache/store` | Store query-response |
| POST | `/api/cache/query` | Query cache directly |
| GET | `/api/cache/stats` | Cache statistics |
| DELETE | `/api/cache/clear` | Clear all entries |

### Request/Response Examples

**Query the cache:**
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is machine learning?"}'
```

**Response:**
```json
{
  "response": "Machine learning is...",
  "cached": true,
  "similarity": 0.92,
  "confidence": {
    "score": 0.91,
    "level": "very_high",
    "layer": "semantic_match"
  }
}
```

---

## Support

### Community

- GitHub Issues for bug reports
- GitHub Discussions for questions
- Contributing guide: [CONTRIBUTING.md](../CONTRIBUTING.md)

### Enterprise

- Priority support available
- Custom features
- SLA agreements
- Contact: enterprise@yourcompany.com

---

*Last Updated: December 2025*
