/**
 * Admin Dashboard - Comprehensive Cache Visualization
 * 
 * Displays real-time stats for all cache layers:
 * - Layer 1: Exact Match (O(1) hash lookup)
 * - Layer 2: Normalized Query (case/punctuation handling)
 * - Layer 3: Semantic Search (embedding similarity)
 * 
 * Shows performance metrics, hit rates, and flow visualization
 */

import { useState, useEffect } from 'react';
import './AdminDashboard.css';

interface LayerStats {
  layer: number;
  name: string;
  hits: number;
  hitRate: number;
  percentOfTotalHits: number;
  avgLatencyMs: number;
  size: number;
  capacity: number;
}

interface ComprehensiveStats {
  timestamp: number;
  overview: {
    totalQueries: number;
    cacheHits: number;
    cacheMisses: number;
    overallHitRate: number;
    totalEntriesStored: number;
  };
  layers: {
    exact: any;
    normalized: any;
    semantic: any;
  };
  smartMatching: any;
  embeddingCache: any;
  performance: any;
}

interface FlowData {
  flowData: {
    incoming: number;
    layer1: { hit: number; forward: number; hitRate: number };
    layer2: { hit: number; forward: number; hitRate: number };
    layer3: { hit: number; miss: number; hitRate: number };
  };
  visualization: {
    nodes: Array<{ id: string; label: string; value: number }>;
    edges: Array<{ from: string; to: string; value: number }>;
  };
}

export default function AdminDashboard() {
  const [comprehensiveStats, setComprehensiveStats] = useState<ComprehensiveStats | null>(null);
  const [layerStats, setLayerStats] = useState<{ layers: LayerStats[] } | null>(null);
  const [flowData, setFlowData] = useState<FlowData | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [demoMode, setDemoMode] = useState(false);

  // Demo data for when API is not available
  const demoStats: ComprehensiveStats = {
    timestamp: Date.now(),
    overview: {
      totalQueries: 12847,
      cacheHits: 9892,
      cacheMisses: 2955,
      overallHitRate: 0.77,
      totalEntriesStored: 3241,
    },
    layers: {
      exact: { hits: 4521, misses: 8326, hitRate: 0.35, size: 3241, capacity: 10000 },
      normalized: { size: 2156, capacity: 10000 },
      semantic: { totalEntries: 3241 },
    },
    smartMatching: {},
    embeddingCache: { hits: 8234, misses: 4613, hitRate: 0.64, size: 1000, capacity: 1000 },
    performance: { storageEfficiency: '75% reduction', privacyMode: 'standard', encryptionEnabled: false },
  };

  const demoLayerStats = {
    layers: [
      { layer: 1, name: 'Exact Match', hits: 4521, hitRate: 0.35, percentOfTotalHits: 45.7, avgLatencyMs: 0.5, size: 3241, capacity: 10000 },
      { layer: 2, name: 'Normalized', hits: 2134, hitRate: 0.17, percentOfTotalHits: 21.6, avgLatencyMs: 1, size: 2156, capacity: 10000 },
      { layer: 3, name: 'Semantic', hits: 3237, hitRate: 0.25, percentOfTotalHits: 32.7, avgLatencyMs: 25, size: 3241, capacity: -1 },
    ],
    summary: { totalHits: 9892, totalMisses: 2955, overallHitRate: 0.77, avgOverallLatency: 15 },
  };

  const demoFlowData: FlowData = {
    flowData: {
      incoming: 12847,
      layer1: { hit: 4521, forward: 8326, hitRate: 0.35 },
      layer2: { hit: 2134, forward: 6192, hitRate: 0.26 },
      layer3: { hit: 3237, miss: 2955, hitRate: 0.52 },
    },
    visualization: {
      nodes: [
        { id: 'incoming', label: 'Incoming Queries', value: 12847 },
        { id: 'layer1', label: 'L1: Exact Match', value: 4521 },
        { id: 'layer2', label: 'L2: Normalized', value: 2134 },
        { id: 'layer3', label: 'L3: Semantic', value: 3237 },
        { id: 'miss', label: 'Cache Miss', value: 2955 },
      ],
      edges: [],
    },
  };

  const fetchStats = async () => {
    try {
      const [comprehensiveRes, layersRes, flowRes] = await Promise.all([
        fetch('/api/admin/stats/comprehensive'),
        fetch('/api/admin/stats/layers'),
        fetch('/api/admin/stats/flow'),
      ]);

      if (!comprehensiveRes.ok || !layersRes.ok || !flowRes.ok) {
        // Switch to demo mode if API unavailable
        setDemoMode(true);
        setComprehensiveStats(demoStats);
        setLayerStats(demoLayerStats);
        setFlowData(demoFlowData);
        return;
      }

      const [comprehensive, layers, flow] = await Promise.all([
        comprehensiveRes.json(),
        layersRes.json(),
        flowRes.json(),
      ]);

      if (!comprehensive?.overview) {
        setDemoMode(true);
        setComprehensiveStats(demoStats);
        setLayerStats(demoLayerStats);
        setFlowData(demoFlowData);
        return;
      }

      setDemoMode(false);
      setComprehensiveStats(comprehensive);
      setLayerStats(layers);
      setFlowData(flow);
    } catch (err) {
      console.error('Error fetching admin stats:', err);
      // Switch to demo mode on error
      setDemoMode(true);
      setComprehensiveStats(demoStats);
      setLayerStats(demoLayerStats);
      setFlowData(demoFlowData);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchStats, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const formatNumber = (num: number) => {
    return num.toLocaleString();
  };

  const formatPercent = (num: number) => {
    return (num * 100).toFixed(1) + '%';
  };

  // Reserved for future memory usage display
  const _formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };
  void _formatBytes; // Suppress unused warning

  if (!comprehensiveStats || !layerStats || !flowData) {
    return (
      <div className="admin-dashboard loading">
        <h1>Admin Dashboard</h1>
        <p>Loading stats...</p>
      </div>
    );
  }

  const { overview, layers, smartMatching, embeddingCache, performance } = comprehensiveStats;

  return (
    <div className="admin-dashboard">
      {demoMode && (
        <div className="demo-banner">
          ✨ Demo Mode — Showing sample data (API not connected)
        </div>
      )}
      <header className="dashboard-header">
        <h1>🎛️ Cache Admin Dashboard</h1>
        <div className="controls">
          <label>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <select
            value={refreshInterval}
            onChange={(e) => setRefreshInterval(Number(e.target.value))}
            disabled={!autoRefresh}
          >
            <option value={1000}>1s</option>
            <option value={5000}>5s</option>
            <option value={10000}>10s</option>
            <option value={30000}>30s</option>
          </select>
          <button onClick={fetchStats} className="refresh-btn">
            🔄 Refresh Now
          </button>
        </div>
      </header>

      {/* Overview Cards */}
      <section className="overview-cards">
        <div className="stat-card primary">
          <h3>Total Queries</h3>
          <div className="stat-value">{formatNumber(overview.totalQueries)}</div>
        </div>
        <div className="stat-card success">
          <h3>Cache Hits</h3>
          <div className="stat-value">{formatNumber(overview.cacheHits)}</div>
          <div className="stat-subtitle">{formatPercent(overview.overallHitRate)} hit rate</div>
        </div>
        <div className="stat-card danger">
          <h3>Cache Misses</h3>
          <div className="stat-value">{formatNumber(overview.cacheMisses)}</div>
        </div>
        <div className="stat-card info">
          <h3>Stored Entries</h3>
          <div className="stat-value">{formatNumber(overview.totalEntriesStored)}</div>
        </div>
      </section>

      {/* Layer Performance Table */}
      <section className="layer-performance">
        <h2>📊 Layer-by-Layer Performance</h2>
        <table className="performance-table">
          <thead>
            <tr>
              <th>Layer</th>
              <th>Name</th>
              <th>Hits</th>
              <th>Hit Rate</th>
              <th>% of Total Hits</th>
              <th>Avg Latency</th>
              <th>Size / Capacity</th>
            </tr>
          </thead>
          <tbody>
            {layerStats.layers.map((layer) => (
              <tr key={layer.layer}>
                <td>
                  <span className={`layer-badge layer-${layer.layer}`}>L{layer.layer}</span>
                </td>
                <td><strong>{layer.name}</strong></td>
                <td>{formatNumber(layer.hits)}</td>
                <td>
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${layer.hitRate * 100}%` }}
                    />
                    <span className="progress-text">{formatPercent(layer.hitRate)}</span>
                  </div>
                </td>
                <td>{layer.percentOfTotalHits.toFixed(1)}%</td>
                <td className="latency">{layer.avgLatencyMs}ms</td>
                <td>
                  {layer.capacity === -1
                    ? `${formatNumber(layer.size)} (unlimited)`
                    : `${formatNumber(layer.size)} / ${formatNumber(layer.capacity)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Flow Visualization */}
      <section className="flow-visualization">
        <h2>🔄 Query Flow Through Layers</h2>
        <div className="flow-diagram">
          <div className="flow-node incoming">
            <div className="node-label">Incoming</div>
            <div className="node-value">{formatNumber(flowData.flowData.incoming)}</div>
            <div className="node-subtitle">queries</div>
          </div>

          <div className="flow-arrow">
            <div className="arrow-value">{formatNumber(flowData.flowData.incoming)}</div>
          </div>

          <div className="flow-node layer1">
            <div className="node-label">L1: Exact Match</div>
            <div className="node-value">{formatNumber(flowData.flowData.layer1.hit)}</div>
            <div className="node-subtitle">
              {formatPercent(flowData.flowData.layer1.hitRate)} hit rate
            </div>
          </div>

          <div className="flow-arrow">
            <div className="arrow-value">{formatNumber(flowData.flowData.layer1.forward)}</div>
            <div className="arrow-label">→ forward</div>
          </div>

          <div className="flow-node layer2">
            <div className="node-label">L2: Normalized</div>
            <div className="node-value">{formatNumber(flowData.flowData.layer2.hit)}</div>
            <div className="node-subtitle">
              {formatPercent(flowData.flowData.layer2.hitRate)} hit rate
            </div>
          </div>

          <div className="flow-arrow">
            <div className="arrow-value">{formatNumber(flowData.flowData.layer2.forward)}</div>
            <div className="arrow-label">→ forward</div>
          </div>

          <div className="flow-node layer3">
            <div className="node-label">L3: Semantic</div>
            <div className="node-value">{formatNumber(flowData.flowData.layer3.hit)}</div>
            <div className="node-subtitle">
              {formatPercent(flowData.flowData.layer3.hitRate)} hit rate
            </div>
          </div>

          <div className="flow-arrow miss">
            <div className="arrow-value">{formatNumber(flowData.flowData.layer3.miss)}</div>
            <div className="arrow-label">→ miss</div>
          </div>

          <div className="flow-node miss">
            <div className="node-label">Cache Miss</div>
            <div className="node-value">{formatNumber(flowData.flowData.layer3.miss)}</div>
            <div className="node-subtitle">query LLM</div>
          </div>
        </div>
      </section>

      {/* Layer Details */}
      <section className="layer-details">
        <h2>🔍 Layer Details</h2>
        <div className="layer-cards">
          <div className="layer-card">
            <h3>Layer 1: Exact Match</h3>
            <div className="layer-info">
              <p><strong>Type:</strong> <span>{layers.exact.type}</span></p>
              <p><strong>Complexity:</strong> <span>{layers.exact.complexity}</span></p>
              <p><strong>Avg Latency:</strong> <span>{layers.exact.avgLatency}</span></p>
              <p><strong>Size:</strong> <span>{formatNumber(layers.exact.size)} / {formatNumber(layers.exact.capacity)}</span></p>
              <p><strong>Hit Rate:</strong> <span>{formatPercent(layers.exact.hitRate)}</span></p>
            </div>
          </div>

          <div className="layer-card">
            <h3>Layer 2: Normalized</h3>
            <div className="layer-info">
              <p><strong>Type:</strong> <span>{layers.normalized.type}</span></p>
              <p><strong>Complexity:</strong> <span>{layers.normalized.complexity}</span></p>
              <p><strong>Avg Latency:</strong> <span>{layers.normalized.avgLatency}</span></p>
              <p><strong>Size:</strong> <span>{formatNumber(layers.normalized.size)} / {formatNumber(layers.normalized.capacity)}</span></p>
              <p><strong>Handles:</strong> <span>{layers.normalized.description}</span></p>
            </div>
          </div>

          <div className="layer-card">
            <h3>Layer 3: Semantic</h3>
            <div className="layer-info">
              <p><strong>Type:</strong> <span>{layers.semantic.type}</span></p>
              <p><strong>Complexity:</strong> <span>{layers.semantic.complexity}</span></p>
              <p><strong>Avg Latency:</strong> <span>{layers.semantic.avgLatency}</span></p>
              <p><strong>Entries:</strong> <span>{formatNumber(layers.semantic.totalEntries)}</span></p>
              <p><strong>Method:</strong> <span>{layers.semantic.description}</span></p>
            </div>
          </div>
        </div>
      </section>

      {/* Smart Matching Stats */}
      {smartMatching && smartMatching.thresholdLearning && (
        <section className="smart-matching">
          <h2>🧠 Smart Matching Features</h2>
          <div className="smart-cards">
            <div className="smart-card">
              <h3>Threshold Learning</h3>
              <p>Adaptive thresholds per query type</p>
              {smartMatching.thresholdLearning.map && (
                <pre>{JSON.stringify(smartMatching.thresholdLearning, null, 2)}</pre>
              )}
            </div>
            {smartMatching.clustering && (
              <div className="smart-card">
                <h3>Query Clustering</h3>
                <p>Pattern detection and analysis</p>
                <pre>{JSON.stringify(smartMatching.clustering, null, 2)}</pre>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Performance & System */}
      <section className="system-info">
        <h2>⚙️ System Configuration</h2>
        <div className="info-grid">
          <div className="info-item">
            <strong>Storage Efficiency:</strong>
            <span>{performance.storageEfficiency}</span>
          </div>
          <div className="info-item">
            <strong>Privacy Mode:</strong>
            <span>{performance.privacyMode}</span>
          </div>
          <div className="info-item">
            <strong>Encryption:</strong>
            <span>{performance.encryptionEnabled ? '✅ Enabled' : '❌ Disabled'}</span>
          </div>
          {embeddingCache && embeddingCache.hitRate !== undefined && (
            <>
              <div className="info-item">
                <strong>Embedding Cache Hit Rate:</strong>
                <span>{formatPercent(embeddingCache.hitRate)}</span>
              </div>
              <div className="info-item">
                <strong>Embedding Cache Size:</strong>
                <span>{formatNumber(embeddingCache.size || 0)}</span>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
