import './HomePage.css';

interface HomePageProps {
  onNavigate: (view: string) => void;
}

function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="home-page">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-bg">
          <div className="hero-orb hero-orb-1"></div>
          <div className="hero-orb hero-orb-2"></div>
          <div className="hero-orb hero-orb-3"></div>
          <div className="hero-grid"></div>
        </div>
        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-icon">⚡</span>
            <span>Open Source Semantic Caching</span>
          </div>
          <h1 className="hero-title">
            <span className="title-gradient">Distributed</span>
            <br />
            Semantic Cache
          </h1>
          <p className="hero-subtitle">
            Cut your LLM API costs by <strong>50-60%</strong> with intelligent semantic caching. 
            Cache similar queries, reduce latency, and scale your AI applications without breaking the bank.
          </p>
          <div className="hero-cta">
            <button className="btn btn-primary btn-lg" onClick={() => onNavigate('chat')}>
              <span>Try Live Demo</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => onNavigate('admin')}>
              <span>View Dashboard</span>
            </button>
          </div>
          <div className="hero-stats">
            <div className="stat-item">
              <span className="stat-value">50-60%</span>
              <span className="stat-label">Cost Reduction</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">&lt;5ms</span>
              <span className="stat-label">Cache Latency</span>
            </div>
            <div className="stat-divider"></div>
            <div className="stat-item">
              <span className="stat-value">100K+</span>
              <span className="stat-label">Vectors Supported</span>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="section how-it-works">
        <div className="section-container">
          <div className="section-header">
            <span className="section-badge">How It Works</span>
            <h2 className="section-title">Intelligent Caching for AI Applications</h2>
            <p className="section-subtitle">
              Our 3-layer cache architecture ensures optimal performance at every level
            </p>
          </div>
          
          <div className="flow-diagram">
            <div className="flow-step">
              <div className="flow-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                </svg>
              </div>
              <h3>Query Input</h3>
              <p>User submits a natural language query to your AI system</p>
            </div>
            
            <div className="flow-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
            
            <div className="flow-step highlighted">
              <div className="flow-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"/>
                </svg>
              </div>
              <h3>3-Layer Cache</h3>
              <p>Check exact match → embedding cache → semantic search</p>
              <div className="flow-layers">
                <span className="layer">L1: Exact</span>
                <span className="layer">L2: Hash</span>
                <span className="layer">L3: Semantic</span>
              </div>
            </div>
            
            <div className="flow-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
            
            <div className="flow-step">
              <div className="flow-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
              <h3>Instant Response</h3>
              <p>Return cached result in milliseconds or forward to LLM</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="section features">
        <div className="section-container">
          <div className="section-header">
            <span className="section-badge">Features</span>
            <h2 className="section-title">Built for Production</h2>
            <p className="section-subtitle">
              Everything you need to deploy intelligent caching at scale
            </p>
          </div>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon feature-icon-purple">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <h3>Local Embeddings</h3>
              <p>100% free embedding generation with local models. No API costs, complete privacy, works offline.</p>
              <ul className="feature-list">
                <li>MiniLM-L6, mpnet-base, e5-small</li>
                <li>Air-gapped environment support</li>
                <li>Zero external dependencies</li>
              </ul>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon feature-icon-blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
                </svg>
              </div>
              <h3>Enterprise Security</h3>
              <p>AES-256-GCM encryption, comprehensive audit logging, and full compliance support.</p>
              <ul className="feature-list">
                <li>HIPAA/GDPR ready</li>
                <li>Zero-log mode available</li>
                <li>Complete audit trails</li>
              </ul>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon feature-icon-green">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
                </svg>
              </div>
              <h3>Smart Matching</h3>
              <p>Intelligent query normalization with adaptive thresholds that learn optimal similarity.</p>
              <ul className="feature-list">
                <li>Multi-factor confidence scoring</li>
                <li>Pattern detection</li>
                <li>Adaptive thresholds</li>
              </ul>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon feature-icon-orange">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                </svg>
              </div>
              <h3>HNSW Indexing</h3>
              <p>O(log n) approximate nearest neighbor search for blazing fast vector lookups.</p>
              <ul className="feature-list">
                <li>100K+ vectors supported</li>
                <li>Matryoshka cascade search</li>
                <li>4-8x faster filtering</li>
              </ul>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon feature-icon-pink">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
              </div>
              <h3>Multi-Tenancy</h3>
              <p>Complete data isolation with quota management for SaaS deployments.</p>
              <ul className="feature-list">
                <li>Per-tenant rate limiting</li>
                <li>Usage analytics</li>
                <li>Resource quotas</li>
              </ul>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon feature-icon-cyan">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
              </div>
              <h3>Advanced Analytics</h3>
              <p>Real-time cost tracking, ROI dashboards, and time-series performance data.</p>
              <ul className="feature-list">
                <li>Cost savings visualization</li>
                <li>Hit rate monitoring</li>
                <li>Performance metrics</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Visualization */}
      <section className="section architecture">
        <div className="section-container">
          <div className="section-header">
            <span className="section-badge">Architecture</span>
            <h2 className="section-title">3-Layer Cache Architecture</h2>
            <p className="section-subtitle">
              Optimized for maximum hit rate and minimum latency
            </p>
          </div>
          
          <div className="architecture-diagram">
            <div className="arch-layer layer-1">
              <div className="layer-header">
                <span className="layer-badge">Layer 1</span>
                <h3>Exact Match Cache</h3>
              </div>
              <div className="layer-content">
                <div className="layer-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                  </svg>
                </div>
                <p>O(1) hash lookup for identical queries</p>
                <span className="layer-speed">⚡ &lt;1ms</span>
              </div>
            </div>
            
            <div className="arch-connector">
              <div className="connector-line"></div>
              <span className="connector-label">Miss</span>
            </div>
            
            <div className="arch-layer layer-2">
              <div className="layer-header">
                <span className="layer-badge">Layer 2</span>
                <h3>Embedding Hash Cache</h3>
              </div>
              <div className="layer-content">
                <div className="layer-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"/>
                  </svg>
                </div>
                <p>Quantized vector lookup with LSH</p>
                <span className="layer-speed">⚡ &lt;3ms</span>
              </div>
            </div>
            
            <div className="arch-connector">
              <div className="connector-line"></div>
              <span className="connector-label">Miss</span>
            </div>
            
            <div className="arch-layer layer-3">
              <div className="layer-header">
                <span className="layer-badge">Layer 3</span>
                <h3>Semantic Vector Search</h3>
              </div>
              <div className="layer-content">
                <div className="layer-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                  </svg>
                </div>
                <p>HNSW approximate nearest neighbor</p>
                <span className="layer-speed">⚡ &lt;5ms</span>
              </div>
            </div>
          </div>
          
          <div className="arch-benefits">
            <div className="benefit-item">
              <span className="benefit-icon">🎯</span>
              <span className="benefit-text">75% storage reduction with vector quantization</span>
            </div>
            <div className="benefit-item">
              <span className="benefit-icon">🔄</span>
              <span className="benefit-text">Automatic LRU eviction for memory efficiency</span>
            </div>
            <div className="benefit-item">
              <span className="benefit-icon">📊</span>
              <span className="benefit-text">&lt;1% accuracy loss with optimized compression</span>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Section */}
      <section className="section demos">
        <div className="section-container">
          <div className="section-header">
            <span className="section-badge">Interactive Demos</span>
            <h2 className="section-title">See It In Action</h2>
            <p className="section-subtitle">
              Explore our interactive demos to understand the power of semantic caching
            </p>
          </div>
          
          <div className="demo-cards">
            <div className="demo-card" onClick={() => onNavigate('chat')}>
              <div className="demo-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                </svg>
              </div>
              <div className="demo-card-content">
                <h3>💬 Chat Demo</h3>
                <p>Interactive chat interface with real-time cache hit/miss feedback. See semantic matching in action.</p>
                <span className="demo-link">Try Chat Demo →</span>
              </div>
            </div>
            
            <div className="demo-card" onClick={() => onNavigate('simulation')}>
              <div className="demo-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
              <div className="demo-card-content">
                <h3>⚡ Performance Simulation</h3>
                <p>Visualize cache performance with simulated workloads. Watch hit rates and latency in real-time.</p>
                <span className="demo-link">Run Simulation →</span>
              </div>
            </div>
            
            <div className="demo-card" onClick={() => onNavigate('cross-user')}>
              <div className="demo-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <div className="demo-card-content">
                <h3>👥 Cross-User Caching</h3>
                <p>Demonstrate cache sharing across multiple users. See how one user's queries benefit everyone.</p>
                <span className="demo-link">Explore Cross-User →</span>
              </div>
            </div>
            
            <div className="demo-card" onClick={() => onNavigate('admin')}>
              <div className="demo-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
                  <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                </svg>
              </div>
              <div className="demo-card-content">
                <h3>🎛️ Admin Dashboard</h3>
                <p>Full control over cache operations. Monitor stats, manage entries, and configure settings.</p>
                <span className="demo-link">Open Dashboard →</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Tech Stack */}
      <section className="section tech-stack">
        <div className="section-container">
          <div className="section-header">
            <span className="section-badge">Technology</span>
            <h2 className="section-title">Built With Modern Tech</h2>
          </div>
          
          <div className="tech-grid">
            <div className="tech-item">
              <div className="tech-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1.85c-.27 0-.55.07-.78.21L3.37 6.57c-.48.28-.77.79-.77 1.35v8.16c0 .56.29 1.07.77 1.35l7.85 4.51c.23.14.51.21.78.21s.55-.07.78-.21l7.85-4.51c.48-.28.77-.79.77-1.35V7.92c0-.56-.29-1.07-.77-1.35l-7.85-4.51c-.23-.14-.51-.21-.78-.21z"/>
                </svg>
              </div>
              <span>TypeScript</span>
            </div>
            <div className="tech-item">
              <div className="tech-icon react">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 9.861a2.139 2.139 0 100 4.278 2.139 2.139 0 000-4.278zm-5.992 6.394l-.472-.12C2.018 15.246 0 13.737 0 11.996s2.018-3.25 5.536-4.139l.472-.119.133.468a23.53 23.53 0 001.363 3.578l.101.213-.101.213a23.307 23.307 0 00-1.363 3.578l-.133.467z"/>
                </svg>
              </div>
              <span>React</span>
            </div>
            <div className="tech-item">
              <div className="tech-icon fastify">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.244 6.781L21.17 5.639l-.867-.48-2.074-1.148-.867-.474-2.067-1.141-.867-.481L12.36.767 11.5.292 9.433 1.44l-.866.481-2.068 1.14-.867.48L3.558 4.69l-.867.475L.623 6.312l.867 5.327 2.068 1.148.866.474 2.074 1.148.867.48 2.068 1.142.866.48 2.068 1.148.867.48 2.068-1.148.867-.48 2.068-1.142.866-.48 2.074-1.148.867-.474 2.068-1.148z"/>
                </svg>
              </div>
              <span>Fastify</span>
            </div>
            <div className="tech-item">
              <div className="tech-icon sqlite">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M21.678.521c-1.032-.92-2.28-.55-3.37.544A8.71 8.71 0 0016.9 2.4c-1.68 2.05-2.91 4.57-3.672 7.093a31.24 31.24 0 00-1.22 6.07c-.073.588-.12 1.177-.14 1.767-.02.59-.01 1.2.063 1.833.073.633.22 1.28.453 1.92.467 1.28 1.266 2.503 2.458 3.265 1.19.763 2.79.985 4.388.447 1.6-.54 3.106-1.834 4.116-3.71.505-.94.905-1.983 1.19-3.073a17.81 17.81 0 00.546-3.553 20.96 20.96 0 00-.12-3.393 22.61 22.61 0 00-.687-3.247 23.89 23.89 0 00-1.133-3.047 21.82 21.82 0 00-1.464-2.743z"/>
                </svg>
              </div>
              <span>SQLite</span>
            </div>
            <div className="tech-item">
              <div className="tech-icon docker">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185zm-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.186zm0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186zm-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186zm-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186zm5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185zm-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185zm-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186h-2.119a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185zm-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185zM23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288z"/>
                </svg>
              </div>
              <span>Docker</span>
            </div>
            <div className="tech-item">
              <div className="tech-icon kubernetes">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M10.204 14.35l.007.01-.999 2.413a5.171 5.171 0 01-2.075-2.597l2.578-.437.004.005a.44.44 0 01.485.606zm-.833-2.129a.44.44 0 00.173-.756l.002-.011L7.585 9.7a5.143 5.143 0 00-.73 3.255l2.514-.725.002-.009zm1.145-1.98a.44.44 0 00.699-.337l.01-.005.15-2.62a5.144 5.144 0 00-3.01 1.442l2.147 1.523.004-.003zm.76 2.75l.723.349.722-.347.18-.78-.5-.623h-.804l-.5.623zm1.166-2.748l2.149-1.52a5.16 5.16 0 00-3.01-1.442l.152 2.618.01.006a.44.44 0 00.699.338zm.988 1.973l2.515.724a5.15 5.15 0 00-.73-3.255l-1.96 1.754.003.01a.44.44 0 00.172.767zm-.022 1.883l2.577.437a5.18 5.18 0 01-2.075 2.597l-.999-2.412.005-.007a.44.44 0 00.492-.615z"/>
                </svg>
              </div>
              <span>Kubernetes</span>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section cta">
        <div className="section-container">
          <div className="cta-content">
            <h2>Ready to Cut Your LLM Costs?</h2>
            <p>Start saving 50-60% on API costs with intelligent semantic caching</p>
            <div className="cta-buttons">
              <button className="btn btn-primary btn-lg" onClick={() => onNavigate('chat')}>
                <span>Get Started Free</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </button>
              <a href="https://github.com" className="btn btn-ghost btn-lg" target="_blank" rel="noopener noreferrer">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                </svg>
                <span>View on GitHub</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="footer-logo">🚀</span>
            <span className="footer-name">Distributed Semantic Cache</span>
          </div>
          <div className="footer-links">
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
            <a href="#docs">Documentation</a>
            <a href="#license">License</a>
          </div>
          <div className="footer-license">
            <span>Open Core Model</span>
            <span className="footer-separator">•</span>
            <span>Apache 2.0 (Core) + Enterprise License</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;
