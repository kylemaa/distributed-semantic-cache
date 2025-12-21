# Open Core Architecture

## Overview

This project follows an **Open Core** model: core features are open source (Apache 2.0), while enterprise features require a commercial license.

---

## 🆓 Open Source Features (Apache 2.0)

### Core Caching (100% Open)
- **Three-layer cache architecture**: Exact → Normalized → Semantic
- **LRU cache**: In-memory exact match and normalized caches
- **Semantic matching**: Embedding-based similarity search
- **Vector quantization**: 75% storage reduction
- **Query normalization**: Case, punctuation, contraction handling
- **Confidence scoring**: Basic confidence calculation
- **Threshold adaptation**: Simplified threshold learning

**Files**: 
- `packages/api/src/cache-service.ts`
- `packages/api/src/database.ts`
- `packages/api/src/embeddings.ts`
- `packages/api/src/lru-cache.ts`
- `packages/api/src/exact-match-cache.ts`
- `packages/api/src/quantization.ts`
- `packages/api/src/normalize.ts`
- `packages/api/src/confidence.ts` (simplified public version)
- `packages/api/src/threshold-learner.ts` (simplified public version)

### Privacy Features (100% Open)
- **AES-256-GCM encryption**: Encrypt embeddings at rest
- **Audit logging**: Track all cache operations
- **Zero-log mode**: Disable telemetry completely
- **Local embeddings**: 100% offline operation with Transformer.js

**Files**:
- `packages/api/src/encryption.ts`
- `packages/api/src/local-embeddings.ts`

### API & Web Interface (100% Open)
- **REST API**: Full CRUD operations for cache
- **Web UI**: React-based chat interface
- **Health checks**: Production-ready endpoints
- **Statistics**: Basic cache metrics

**Files**:
- `packages/api/src/routes.ts` (excluding enterprise endpoints)
- `packages/api/src/index.ts`
- `packages/web/src/*`

### Self-Hosting (100% Open)
- **Docker**: Basic Dockerfile
- **docker-compose**: Single-instance deployment
- **Documentation**: Complete setup guides

**Files**:
- `Dockerfile`
- `docker-compose.yml` (basic profile)

---

## 💼 Enterprise Features (Proprietary)

### Multi-Tenancy 🏢
**Why Enterprise**: Complete data isolation requires sophisticated architecture and ongoing support

**Features**:
- Separate databases per tenant
- Quota management and enforcement
- Per-tenant feature flags
- Usage tracking and billing integration
- Tenant-level analytics
- Data export/import for migrations

**Files**:
- `packages/api/src/tenant-manager.ts` ⚠️ **PROPRIETARY**
- `packages/api/__tests__/tenant-manager.test.ts`

**Pricing**: Starting at $299/month

### Advanced Analytics 📊
**Why Enterprise**: Sophisticated ROI tracking and reporting for business value

**Features**:
- Cost savings dashboard with ROI calculations
- Time-series data visualization
- Query pattern detection and clustering (advanced)
- Performance metrics (P50, P95, P99)
- CSV/JSON export for BI tools
- Custom reporting periods

**Files**:
- `packages/api/src/analytics-service.ts` ⚠️ **PROPRIETARY**
- `packages/api/__tests__/analytics-service.test.ts`

**Pricing**: Included in Enterprise tier ($999+/month)

### Production Deployment Templates 🚀
**Why Enterprise**: Production-grade infrastructure requires expertise and maintenance

**Features**:
- Kubernetes manifests with auto-scaling (HPA)
- Terraform modules for AWS (ECS Fargate, VPC, ALB)
- High availability configurations
- Monitoring and alerting setup
- Security best practices
- Load balancing and failover

**Files**:
- `deploy/kubernetes/*` ⚠️ **PROPRIETARY**
- `deploy/terraform/*` ⚠️ **PROPRIETARY**

**Pricing**: Included in Enterprise tier ($999+/month)

### Priority Support & SLAs
- 24/7 support channel
- <4 hour response time
- 99.9% uptime SLA
- Dedicated Slack channel
- Custom deployment assistance

---

## 🔐 Trade Secrets (Not Published)

### Proprietary Algorithms
These algorithms are **not in the public repository** and remain trade secrets:

1. **Advanced Threshold Optimization**
   - Proprietary ML-based threshold learning
   - Multi-dimensional optimization
   - Cross-query-type learning

2. **Advanced Confidence Scoring**
   - Proprietary multi-factor weighting
   - User feedback loop integration
   - Contextual confidence adjustments

3. **Query Pattern Clustering (Advanced)**
   - Proprietary clustering algorithms
   - Real-time pattern detection
   - Predictive cache warming

4. **Performance Optimizations**
   - Proprietary indexing strategies
   - Custom database optimizations
   - Advanced caching layers

**Note**: Simplified versions of threshold learning and confidence scoring are available in the open source version for basic functionality.

---

## 📊 Feature Comparison

| Feature | Open Source | Enterprise |
|---------|-------------|------------|
| **Core Caching** | | |
| Semantic matching | ✅ Full | ✅ Full |
| Three-layer architecture | ✅ | ✅ |
| Vector quantization | ✅ | ✅ |
| LRU eviction | ✅ | ✅ |
| **Privacy** | | |
| Encryption at rest | ✅ | ✅ |
| Audit logging | ✅ | ✅ |
| Local embeddings | ✅ | ✅ |
| **Deployment** | | |
| Single instance (Docker) | ✅ | ✅ |
| Multi-instance (K8s) | ❌ | ✅ |
| Cloud infrastructure (Terraform) | ❌ | ✅ |
| **Scale** | | |
| Query volume | Up to 100K/mo | Unlimited |
| Tenants | 1 (single tenant) | Unlimited |
| Storage backend | SQLite only | SQLite, PostgreSQL, Redis |
| **Analytics** | | |
| Basic statistics | ✅ | ✅ |
| Cost savings dashboard | ❌ | ✅ |
| Time-series data | ❌ | ✅ |
| Pattern detection (basic) | ✅ | ✅ Advanced |
| Export (CSV/JSON) | ❌ | ✅ |
| **Support** | | |
| Community (GitHub) | ✅ | ✅ |
| Email support | ❌ | ✅ Priority |
| SLA | ❌ | ✅ 99.9% |
| Custom deployment | ❌ | ✅ |

---

## 🎯 Pricing Tiers

### Free (Open Source)
- **Cost**: $0
- **Features**: All open source features
- **Deployment**: Self-hosted only
- **Support**: Community (GitHub issues)
- **Best for**: Individuals, side projects, small teams

### Pro (Managed Hosting)
- **Cost**: $99-299/month
- **Features**: Open source + managed hosting
- **Deployment**: Cloud-hosted by us
- **Support**: Email support (business hours)
- **Limits**: Up to 500K queries/month
- **Best for**: Startups, small-medium businesses

### Enterprise
- **Cost**: $999+/month (custom pricing)
- **Features**: Everything + multi-tenancy + analytics + deployment templates
- **Deployment**: Your infrastructure (we help) or ours
- **Support**: Priority support + SLA + Slack
- **Limits**: Unlimited
- **Best for**: Large enterprises, SaaS platforms, compliance requirements

---

## 🤝 Contributing

### Open Source Contributions
We welcome contributions to open source features:
- Bug fixes
- Performance improvements
- Documentation
- Tests
- New features (core functionality only)

**Process**: Open a GitHub issue first to discuss, then submit PR

### Enterprise Features
Enterprise features are not accepting community contributions. If you have ideas for enterprise features, please reach out to discuss partnership opportunities.

---

## 📜 Licenses

### Open Source
- **License**: Apache License 2.0
- **File**: `LICENSE`
- **Applies to**: All files except those marked as PROPRIETARY

### Enterprise
- **License**: Proprietary Commercial License
- **File**: `LICENSE-ENTERPRISE`
- **Applies to**: 
  - `packages/api/src/tenant-manager.ts`
  - `packages/api/src/analytics-service.ts`
  - `deploy/` directory (all deployment templates)
  - Future enterprise features as designated

### Trade Secrets
- **Not published**: Advanced algorithms kept as trade secrets
- **Protection**: Not included in public repository

---

## ❓ FAQ

**Q: Can I use the open source version commercially?**  
A: Yes! Apache 2.0 allows commercial use. You can self-host and use it in production.

**Q: Do I need a commercial license for open source features?**  
A: No. Open source features are free forever, even for commercial use.

**Q: When do I need an Enterprise license?**  
A: When you need multi-tenancy, advanced analytics, or production deployment templates. Also if you want priority support or SLAs.

**Q: Can I see the enterprise code before buying?**  
A: Yes! Enterprise features are in the public repository. You get a 30-day evaluation period.

**Q: Can I modify enterprise features?**  
A: With an Enterprise license, yes. Modifications remain proprietary (can't be open sourced).

**Q: What if I only need multi-tenancy, not analytics?**  
A: Contact us for custom licensing. We can create a plan that fits your needs.

**Q: Is managed hosting available?**  
A: Yes, in Pro and Enterprise tiers. We handle infrastructure, updates, and monitoring.

**Q: Can I contribute to open source if I'm an Enterprise customer?**  
A: Absolutely! We encourage it. Enterprise customers can contribute to open source features.

---

## 📞 Contact

- **Open Source Questions**: GitHub Issues
- **Enterprise Licensing**: [your email]
- **Partnership Inquiries**: [your email]
- **Security Issues**: [security email]

---

**Last Updated**: December 20, 2025  
**Version**: 1.0
