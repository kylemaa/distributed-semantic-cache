/**
 * Cache Simulation - Animated Visualization
 * 
 * An impressive, interactive demonstration of the 3-layer cache architecture.
 * Shows queries as animated particles flowing through each cache layer with
 * real-time visual feedback, glowing effects, and a live query feed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import './CacheSimulation.css';

// Mock queries for simulation
const MOCK_QUERIES = [
  { text: "What is artificial intelligence?", type: "question" },
  { text: "Explain machine learning", type: "command" },
  { text: "Tell me about neural networks", type: "command" },
  { text: "What is AI?", type: "question" },  // Will hit L2 (normalized)
  { text: "WHAT IS ARTIFICIAL INTELLIGENCE?", type: "question" },  // Will hit L2
  { text: "How does deep learning work?", type: "question" },
  { text: "Describe artificial intelligence", type: "command" },  // Will hit L3 (semantic)
  { text: "What is artificial intelligence?", type: "question" },  // Will hit L1 (exact)
  { text: "Explain ML algorithms", type: "command" },  // Will hit L3
  { text: "What's the weather today?", type: "question" },  // Cache miss
  { text: "How do transformers work?", type: "question" },
  { text: "what is machine learning", type: "question" },  // Will hit L2
  { text: "Define AI", type: "command" },  // Will hit L3
  { text: "Explain machine learning", type: "command" },  // Will hit L1
  { text: "What are large language models?", type: "question" },
];

interface Query {
  id: number;
  text: string;
  type: string;
  status: 'entering' | 'l1-check' | 'l1-hit' | 'l2-check' | 'l2-hit' | 'l3-check' | 'l3-hit' | 'miss' | 'complete';
  result?: 'L1' | 'L2' | 'L3' | 'MISS';
  similarity?: number;
  startTime: number;
  position: number;
}

interface CacheEntry {
  query: string;
  normalized: string;
  timestamp: number;
  hitCount: number;
}

interface SimulationStats {
  totalQueries: number;
  l1Hits: number;
  l2Hits: number;
  l3Hits: number;
  misses: number;
  avgLatency: number;
}

// Normalize query for L2 matching
const normalizeQuery = (query: string): string => {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// Simple semantic similarity (mock)
const calculateSimilarity = (q1: string, q2: string): number => {
  const words1 = new Set(normalizeQuery(q1).split(' '));
  const words2 = new Set(normalizeQuery(q2).split(' '));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size;
};

export default function CacheSimulation() {
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [queries, setQueries] = useState<Query[]>([]);
  const [cache, setCache] = useState<CacheEntry[]>([]);
  const [stats, setStats] = useState<SimulationStats>({
    totalQueries: 0,
    l1Hits: 0,
    l2Hits: 0,
    l3Hits: 0,
    misses: 0,
    avgLatency: 0,
  });
  const [recentEvents, setRecentEvents] = useState<Array<{id: number; text: string; type: string; time: number}>>([]);
  const [activeLayer, setActiveLayer] = useState<number | null>(null);
  const [pulseLayer, setPulseLayer] = useState<number | null>(null);
  
  const queryIdRef = useRef(0);
  const eventIdRef = useRef(0);
  const latenciesRef = useRef<number[]>([]);

  const addEvent = useCallback((text: string, type: 'hit' | 'miss' | 'check' | 'info') => {
    const event = {
      id: eventIdRef.current++,
      text,
      type,
      time: Date.now(),
    };
    setRecentEvents(prev => [event, ...prev].slice(0, 15));
  }, []);

  const triggerPulse = useCallback((layer: number) => {
    setPulseLayer(layer);
    setTimeout(() => setPulseLayer(null), 500);
  }, []);

  const processQuery = useCallback((queryText: string, queryType: string) => {
    const queryId = queryIdRef.current++;
    const startTime = Date.now();
    
    const newQuery: Query = {
      id: queryId,
      text: queryText,
      type: queryType,
      status: 'entering',
      startTime,
      position: 0,
    };

    setQueries(prev => [...prev, newQuery]);
    addEvent(`📥 "${queryText.substring(0, 30)}${queryText.length > 30 ? '...' : ''}"`, 'info');

    // Simulate processing through layers
    const baseDelay = 800 / speed;

    // L1 Check
    setTimeout(() => {
      setQueries(prev => prev.map(q => 
        q.id === queryId ? { ...q, status: 'l1-check', position: 1 } : q
      ));
      setActiveLayer(1);
      addEvent('🔍 L1: Checking exact hash match...', 'check');
    }, baseDelay);

    // L1 Result
    setTimeout(() => {
      const exactMatch = cache.find(c => c.query === queryText);
      
      if (exactMatch) {
        // L1 HIT!
        setQueries(prev => prev.map(q => 
          q.id === queryId ? { ...q, status: 'l1-hit', result: 'L1', position: 1 } : q
        ));
        triggerPulse(1);
        addEvent(`✅ L1 HIT! Exact match found (< 1ms)`, 'hit');
        
        setStats(prev => ({
          ...prev,
          totalQueries: prev.totalQueries + 1,
          l1Hits: prev.l1Hits + 1,
        }));
        
        setCache(prev => prev.map(c => 
          c.query === queryText ? { ...c, hitCount: c.hitCount + 1 } : c
        ));

        const latency = 0.5;
        latenciesRef.current.push(latency);
        setStats(prev => ({
          ...prev,
          avgLatency: latenciesRef.current.reduce((a, b) => a + b, 0) / latenciesRef.current.length,
        }));

        setTimeout(() => {
          setQueries(prev => prev.map(q => 
            q.id === queryId ? { ...q, status: 'complete' } : q
          ));
          setActiveLayer(null);
        }, baseDelay);

        setTimeout(() => {
          setQueries(prev => prev.filter(q => q.id !== queryId));
        }, baseDelay * 3);

        return;
      }

      // Forward to L2
      setQueries(prev => prev.map(q => 
        q.id === queryId ? { ...q, status: 'l2-check', position: 2 } : q
      ));
      setActiveLayer(2);
      addEvent('➡️ Forwarding to L2...', 'info');
      addEvent('🔍 L2: Normalizing query...', 'check');
    }, baseDelay * 2);

    // L2 Result
    setTimeout(() => {
      const normalizedInput = normalizeQuery(queryText);
      const normalizedMatch = cache.find(c => c.normalized === normalizedInput && c.query !== queryText);
      
      if (normalizedMatch) {
        // L2 HIT!
        setQueries(prev => prev.map(q => 
          q.id === queryId ? { ...q, status: 'l2-hit', result: 'L2', position: 2 } : q
        ));
        triggerPulse(2);
        addEvent(`✅ L2 HIT! Normalized match: "${normalizedMatch.query.substring(0, 25)}..."`, 'hit');
        
        setStats(prev => ({
          ...prev,
          totalQueries: prev.totalQueries + 1,
          l2Hits: prev.l2Hits + 1,
        }));

        const latency = 1.2;
        latenciesRef.current.push(latency);
        setStats(prev => ({
          ...prev,
          avgLatency: latenciesRef.current.reduce((a, b) => a + b, 0) / latenciesRef.current.length,
        }));

        setTimeout(() => {
          setQueries(prev => prev.map(q => 
            q.id === queryId ? { ...q, status: 'complete' } : q
          ));
          setActiveLayer(null);
        }, baseDelay);

        setTimeout(() => {
          setQueries(prev => prev.filter(q => q.id !== queryId));
        }, baseDelay * 3);

        return;
      }

      // Forward to L3
      setQueries(prev => prev.map(q => 
        q.id === queryId ? { ...q, status: 'l3-check', position: 3 } : q
      ));
      setActiveLayer(3);
      addEvent('➡️ Forwarding to L3...', 'info');
      addEvent('🔍 L3: Computing embedding similarity...', 'check');
    }, baseDelay * 3);

    // L3 Result
    setTimeout(() => {
      let bestMatch: CacheEntry | null = null;
      let bestSimilarity = 0;

      for (const entry of cache) {
        const similarity = calculateSimilarity(queryText, entry.query);
        if (similarity > bestSimilarity && similarity >= 0.4) {
          bestSimilarity = similarity;
          bestMatch = entry;
        }
      }

      if (bestMatch && bestSimilarity >= 0.4) {
        // L3 HIT!
        setQueries(prev => prev.map(q => 
          q.id === queryId ? { ...q, status: 'l3-hit', result: 'L3', similarity: bestSimilarity, position: 3 } : q
        ));
        triggerPulse(3);
        addEvent(`✅ L3 HIT! Semantic match: ${(bestSimilarity * 100).toFixed(1)}% similar`, 'hit');
        
        setStats(prev => ({
          ...prev,
          totalQueries: prev.totalQueries + 1,
          l3Hits: prev.l3Hits + 1,
        }));

        const latency = 15 + Math.random() * 20;
        latenciesRef.current.push(latency);
        setStats(prev => ({
          ...prev,
          avgLatency: latenciesRef.current.reduce((a, b) => a + b, 0) / latenciesRef.current.length,
        }));

        setTimeout(() => {
          setQueries(prev => prev.map(q => 
            q.id === queryId ? { ...q, status: 'complete' } : q
          ));
          setActiveLayer(null);
        }, baseDelay);

        setTimeout(() => {
          setQueries(prev => prev.filter(q => q.id !== queryId));
        }, baseDelay * 3);

        return;
      }

      // MISS - Add to cache
      setQueries(prev => prev.map(q => 
        q.id === queryId ? { ...q, status: 'miss', result: 'MISS', position: 4 } : q
      ));
      addEvent(`❌ CACHE MISS - Querying LLM...`, 'miss');
      
      setStats(prev => ({
        ...prev,
        totalQueries: prev.totalQueries + 1,
        misses: prev.misses + 1,
      }));

      // Add to cache
      const newEntry: CacheEntry = {
        query: queryText,
        normalized: normalizeQuery(queryText),
        timestamp: Date.now(),
        hitCount: 0,
      };
      setCache(prev => [...prev, newEntry]);
      
      const latency = 150 + Math.random() * 100;
      latenciesRef.current.push(latency);
      setStats(prev => ({
        ...prev,
        avgLatency: latenciesRef.current.reduce((a, b) => a + b, 0) / latenciesRef.current.length,
      }));

      setTimeout(() => {
        addEvent(`💾 Cached: "${queryText.substring(0, 25)}..."`, 'info');
        setQueries(prev => prev.map(q => 
          q.id === queryId ? { ...q, status: 'complete' } : q
        ));
        setActiveLayer(null);
      }, baseDelay * 1.5);

      setTimeout(() => {
        setQueries(prev => prev.filter(q => q.id !== queryId));
      }, baseDelay * 4);
    }, baseDelay * 4.5);
  }, [cache, speed, addEvent, triggerPulse]);

  // Auto-run simulation
  useEffect(() => {
    if (!isRunning) return;

    let queryIndex = 0;
    const interval = setInterval(() => {
      const mockQuery = MOCK_QUERIES[queryIndex % MOCK_QUERIES.length];
      processQuery(mockQuery.text, mockQuery.type);
      queryIndex++;
    }, 2500 / speed);

    return () => clearInterval(interval);
  }, [isRunning, speed, processQuery]);

  const resetSimulation = () => {
    setIsRunning(false);
    setQueries([]);
    setCache([]);
    setStats({
      totalQueries: 0,
      l1Hits: 0,
      l2Hits: 0,
      l3Hits: 0,
      misses: 0,
      avgLatency: 0,
    });
    setRecentEvents([]);
    latenciesRef.current = [];
    queryIdRef.current = 0;
    eventIdRef.current = 0;
  };

  const totalHits = stats.l1Hits + stats.l2Hits + stats.l3Hits;
  const hitRate = stats.totalQueries > 0 ? (totalHits / stats.totalQueries) * 100 : 0;

  return (
    <div className="cache-simulation">
      {/* Header */}
      <header className="sim-header">
        <div className="sim-title">
          <h1>⚡ Cache Flow Simulator</h1>
          <p>Watch queries flow through the 3-layer semantic cache in real-time</p>
        </div>
        <div className="sim-controls">
          <button 
            className={`control-btn ${isRunning ? 'running' : 'stopped'}`}
            onClick={() => setIsRunning(!isRunning)}
          >
            {isRunning ? '⏸ Pause' : '▶ Start'} Simulation
          </button>
          <div className="speed-control">
            <label>Speed:</label>
            <input 
              type="range" 
              min="0.5" 
              max="3" 
              step="0.5" 
              value={speed}
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
            />
            <span>{speed}x</span>
          </div>
          <button className="reset-btn" onClick={resetSimulation}>
            🔄 Reset
          </button>
        </div>
      </header>

      {/* Main Visualization */}
      <div className="sim-main">
        {/* Stats Panel */}
        <aside className="stats-panel">
          <h2>📊 Live Statistics</h2>
          <div className="stat-group">
            <div className="stat-item total">
              <span className="stat-label">Total Queries</span>
              <span className="stat-value">{stats.totalQueries}</span>
            </div>
            <div className="stat-item hit-rate">
              <span className="stat-label">Hit Rate</span>
              <span className="stat-value">{hitRate.toFixed(1)}%</span>
              <div className="hit-rate-bar">
                <div className="hit-rate-fill" style={{ width: `${hitRate}%` }} />
              </div>
            </div>
          </div>
          
          <div className="layer-stats">
            <div className="layer-stat l1">
              <div className="layer-icon">L1</div>
              <div className="layer-info">
                <span className="layer-name">Exact Match</span>
                <span className="layer-hits">{stats.l1Hits} hits</span>
              </div>
              <div className="layer-bar">
                <div 
                  className="layer-fill" 
                  style={{ width: `${stats.totalQueries > 0 ? (stats.l1Hits / stats.totalQueries) * 100 : 0}%` }} 
                />
              </div>
            </div>
            <div className="layer-stat l2">
              <div className="layer-icon">L2</div>
              <div className="layer-info">
                <span className="layer-name">Normalized</span>
                <span className="layer-hits">{stats.l2Hits} hits</span>
              </div>
              <div className="layer-bar">
                <div 
                  className="layer-fill" 
                  style={{ width: `${stats.totalQueries > 0 ? (stats.l2Hits / stats.totalQueries) * 100 : 0}%` }} 
                />
              </div>
            </div>
            <div className="layer-stat l3">
              <div className="layer-icon">L3</div>
              <div className="layer-info">
                <span className="layer-name">Semantic</span>
                <span className="layer-hits">{stats.l3Hits} hits</span>
              </div>
              <div className="layer-bar">
                <div 
                  className="layer-fill" 
                  style={{ width: `${stats.totalQueries > 0 ? (stats.l3Hits / stats.totalQueries) * 100 : 0}%` }} 
                />
              </div>
            </div>
            <div className="layer-stat miss">
              <div className="layer-icon">❌</div>
              <div className="layer-info">
                <span className="layer-name">Misses</span>
                <span className="layer-hits">{stats.misses}</span>
              </div>
              <div className="layer-bar">
                <div 
                  className="layer-fill" 
                  style={{ width: `${stats.totalQueries > 0 ? (stats.misses / stats.totalQueries) * 100 : 0}%` }} 
                />
              </div>
            </div>
          </div>

          <div className="latency-stat">
            <span className="stat-label">Avg Latency</span>
            <span className="stat-value">{stats.avgLatency.toFixed(1)}ms</span>
          </div>

          <div className="cache-size">
            <span className="stat-label">Cache Size</span>
            <span className="stat-value">{cache.length} entries</span>
          </div>
        </aside>

        {/* Flow Visualization */}
        <div className="flow-container">
          {/* Query Input */}
          <div className="flow-stage input-stage">
            <div className="stage-header">
              <span className="stage-icon">📥</span>
              <span className="stage-label">Incoming Queries</span>
            </div>
            <div className="query-queue">
              {queries.filter(q => q.status === 'entering').map(q => (
                <div key={q.id} className="query-particle entering">
                  <span className="query-text">{q.text.substring(0, 20)}...</span>
                </div>
              ))}
            </div>
          </div>

          {/* Connection Line */}
          <div className="flow-connector">
            <div className="connector-line" />
            <div className="connector-arrow">→</div>
          </div>

          {/* Layer 1 */}
          <div className={`flow-stage layer-stage l1 ${activeLayer === 1 ? 'active' : ''} ${pulseLayer === 1 ? 'pulse' : ''}`}>
            <div className="stage-header">
              <span className="stage-icon">🔑</span>
              <span className="stage-label">L1: Exact Match</span>
              <span className="stage-speed">&lt;1ms</span>
            </div>
            <div className="layer-visual">
              <div className="hash-table">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className={`hash-slot ${cache.length > i ? 'filled' : ''}`}>
                    {cache.length > i && <span className="slot-key">#</span>}
                  </div>
                ))}
              </div>
            </div>
            <div className="layer-queries">
              {queries.filter(q => q.status === 'l1-check' || q.status === 'l1-hit').map(q => (
                <div key={q.id} className={`query-particle ${q.status}`}>
                  {q.status === 'l1-hit' && <span className="hit-badge">HIT!</span>}
                </div>
              ))}
            </div>
            <div className="layer-description">O(1) Hash Lookup</div>
          </div>

          {/* Connection */}
          <div className="flow-connector">
            <div className="connector-line" />
            <div className="connector-label">miss →</div>
          </div>

          {/* Layer 2 */}
          <div className={`flow-stage layer-stage l2 ${activeLayer === 2 ? 'active' : ''} ${pulseLayer === 2 ? 'pulse' : ''}`}>
            <div className="stage-header">
              <span className="stage-icon">📝</span>
              <span className="stage-label">L2: Normalized</span>
              <span className="stage-speed">~1ms</span>
            </div>
            <div className="layer-visual">
              <div className="normalize-steps">
                <span className="step">lowercase</span>
                <span className="step-arrow">→</span>
                <span className="step">trim</span>
                <span className="step-arrow">→</span>
                <span className="step">hash</span>
              </div>
            </div>
            <div className="layer-queries">
              {queries.filter(q => q.status === 'l2-check' || q.status === 'l2-hit').map(q => (
                <div key={q.id} className={`query-particle ${q.status}`}>
                  {q.status === 'l2-hit' && <span className="hit-badge">HIT!</span>}
                </div>
              ))}
            </div>
            <div className="layer-description">Case & Punctuation Normalization</div>
          </div>

          {/* Connection */}
          <div className="flow-connector">
            <div className="connector-line" />
            <div className="connector-label">miss →</div>
          </div>

          {/* Layer 3 */}
          <div className={`flow-stage layer-stage l3 ${activeLayer === 3 ? 'active' : ''} ${pulseLayer === 3 ? 'pulse' : ''}`}>
            <div className="stage-header">
              <span className="stage-icon">🧠</span>
              <span className="stage-label">L3: Semantic</span>
              <span className="stage-speed">~25ms</span>
            </div>
            <div className="layer-visual">
              <div className="embedding-visual">
                <div className="vector-space">
                  {cache.slice(0, 6).map((_, i) => (
                    <div 
                      key={i} 
                      className="vector-point"
                      style={{
                        left: `${20 + Math.random() * 60}%`,
                        top: `${20 + Math.random() * 60}%`,
                      }}
                    />
                  ))}
                  <div className="query-vector" />
                </div>
              </div>
            </div>
            <div className="layer-queries">
              {queries.filter(q => q.status === 'l3-check' || q.status === 'l3-hit').map(q => (
                <div key={q.id} className={`query-particle ${q.status}`}>
                  {q.status === 'l3-hit' && (
                    <span className="hit-badge">{((q.similarity || 0) * 100).toFixed(0)}%</span>
                  )}
                </div>
              ))}
            </div>
            <div className="layer-description">HNSW + Cosine Similarity</div>
          </div>

          {/* Connection */}
          <div className="flow-connector">
            <div className="connector-line miss-line" />
            <div className="connector-label miss-label">miss →</div>
          </div>

          {/* LLM / Cache Miss */}
          <div className="flow-stage output-stage miss-stage">
            <div className="stage-header">
              <span className="stage-icon">🤖</span>
              <span className="stage-label">LLM Query</span>
            </div>
            <div className="llm-visual">
              <div className="llm-icon">⚡</div>
              <span className="llm-label">Generate Response</span>
              <span className="llm-time">~200ms</span>
            </div>
            <div className="layer-queries">
              {queries.filter(q => q.status === 'miss').map(q => (
                <div key={q.id} className="query-particle miss">
                  <span className="miss-badge">NEW</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Event Log */}
        <aside className="event-log">
          <h2>📋 Live Event Log</h2>
          <div className="events-container">
            {recentEvents.map(event => (
              <div key={event.id} className={`event-item ${event.type}`}>
                <span className="event-text">{event.text}</span>
              </div>
            ))}
            {recentEvents.length === 0 && (
              <div className="no-events">
                Click "Start Simulation" to begin...
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Cache Contents */}
      <section className="cache-contents">
        <h2>💾 Cache Contents ({cache.length} entries)</h2>
        <div className="cache-entries">
          {cache.slice(-8).map((entry, i) => (
            <div key={i} className="cache-entry">
              <span className="entry-query">{entry.query}</span>
              <span className="entry-hits">{entry.hitCount} hits</span>
            </div>
          ))}
          {cache.length === 0 && (
            <div className="no-cache">Cache is empty. Run the simulation to populate it.</div>
          )}
        </div>
      </section>

      {/* Legend */}
      <footer className="sim-legend">
        <div className="legend-item l1">
          <span className="legend-color" />
          <span>L1: Exact Match (fastest)</span>
        </div>
        <div className="legend-item l2">
          <span className="legend-color" />
          <span>L2: Normalized Match</span>
        </div>
        <div className="legend-item l3">
          <span className="legend-color" />
          <span>L3: Semantic Match</span>
        </div>
        <div className="legend-item miss">
          <span className="legend-color" />
          <span>Cache Miss (slowest)</span>
        </div>
      </footer>
    </div>
  );
}
