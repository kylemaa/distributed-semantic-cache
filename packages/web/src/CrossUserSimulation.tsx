/**
 * Cross-User Cache Simulation - Animated Visualization
 * 
 * Demonstrates how semantic caching benefits organizations where
 * different users ask similar questions. Shows real-time cross-user
 * cache hits with user avatars, organization context, and cost savings.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import './CrossUserSimulation.css';

// Simulated organization users
const USERS = [
  { id: 1, name: 'Alice', role: 'Developer', color: '#4CAF50', avatar: '👩‍💻' },
  { id: 2, name: 'Bob', role: 'Data Scientist', color: '#2196F3', avatar: '👨‍🔬' },
  { id: 3, name: 'Carol', role: 'Product Manager', color: '#9C27B0', avatar: '👩‍💼' },
  { id: 4, name: 'Dave', role: 'DevOps Engineer', color: '#FF9800', avatar: '👨‍🔧' },
  { id: 5, name: 'Eve', role: 'Designer', color: '#E91E63', avatar: '👩‍🎨' },
  { id: 6, name: 'Frank', role: 'Analyst', color: '#00BCD4', avatar: '👨‍💼' },
];

// Query topics that users might ask (simulating real org usage)
const QUERY_TOPICS = [
  {
    topic: 'API Authentication',
    variants: [
      "How do I authenticate with the API?",
      "What's the authentication process for our API?",
      "How to get API access tokens?",
      "Explain API auth flow",
      "API authentication help",
    ]
  },
  {
    topic: 'Deployment Process',
    variants: [
      "How do I deploy to production?",
      "What's the deployment process?",
      "Steps to deploy our app",
      "Deployment guide for production",
      "How to push to prod?",
    ]
  },
  {
    topic: 'Database Queries',
    variants: [
      "How to optimize database queries?",
      "Database query optimization tips",
      "Make SQL queries faster",
      "Improve database performance",
      "Query optimization best practices",
    ]
  },
  {
    topic: 'Error Handling',
    variants: [
      "Best practices for error handling?",
      "How to handle errors properly?",
      "Error handling patterns",
      "Exception handling guidelines",
      "How should I handle exceptions?",
    ]
  },
  {
    topic: 'Code Review',
    variants: [
      "What's our code review process?",
      "How do code reviews work here?",
      "Code review guidelines",
      "PR review checklist",
      "How to submit code for review?",
    ]
  },
  {
    topic: 'Testing Strategy',
    variants: [
      "How should I write tests?",
      "Testing best practices",
      "Unit testing guidelines",
      "What's our testing strategy?",
      "How to write good tests?",
    ]
  },
];

interface User {
  id: number;
  name: string;
  role: string;
  color: string;
  avatar: string;
}

interface ActiveQuery {
  id: number;
  user: User;
  text: string;
  topic: string;
  status: 'sending' | 'processing' | 'hit' | 'miss' | 'complete';
  hitType?: 'exact' | 'semantic' | 'none';
  hitFrom?: User;
  similarity?: number;
  startTime: number;
  savedCost?: number;
  savedTime?: number;
}

interface CacheEntry {
  query: string;
  topic: string;
  user: User;
  timestamp: number;
  embedding: number[]; // Simplified mock embedding
}

interface Stats {
  totalQueries: number;
  cacheHits: number;
  exactHits: number;
  semanticHits: number;
  misses: number;
  totalSaved: number;
  avgResponseTime: number;
  usersBenefited: Set<number>;
}

// Mock embedding - simple word-based for visualization
const getEmbedding = (text: string): number[] => {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
  const vocab = ['how', 'what', 'api', 'deploy', 'database', 'error', 'code', 'test', 'review', 'auth', 'query', 'production', 'process', 'best', 'practices'];
  return vocab.map(v => words.includes(v) ? 1 : 0);
};

// Cosine similarity for mock embeddings
const cosineSimilarity = (a: number[], b: number[]): number => {
  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
  return magA && magB ? dotProduct / (magA * magB) : 0;
};

const LLM_COST = 0.03; // Cost per LLM call
const LLM_TIME = 2000; // Time per LLM call in ms
const CACHE_TIME = 20; // Time for cache hit in ms

export default function CrossUserSimulation() {
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [activeQueries, setActiveQueries] = useState<ActiveQuery[]>([]);
  const [cache, setCache] = useState<CacheEntry[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalQueries: 0,
    cacheHits: 0,
    exactHits: 0,
    semanticHits: 0,
    misses: 0,
    totalSaved: 0,
    avgResponseTime: 0,
    usersBenefited: new Set(),
  });
  const [recentEvents, setRecentEvents] = useState<Array<{
    id: number;
    text: string;
    type: 'hit' | 'miss' | 'info';
    user?: User;
    hitFrom?: User;
    time: number;
  }>>([]);
  const [connections, setConnections] = useState<Array<{
    id: number;
    from: User;
    to: User;
    active: boolean;
  }>>([]);

  const queryIdRef = useRef(0);
  const eventIdRef = useRef(0);
  const connectionIdRef = useRef(0);
  const responseTimesRef = useRef<number[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addEvent = useCallback((
    text: string, 
    type: 'hit' | 'miss' | 'info',
    user?: User,
    hitFrom?: User
  ) => {
    const event = {
      id: eventIdRef.current++,
      text,
      type,
      user,
      hitFrom,
      time: Date.now(),
    };
    setRecentEvents(prev => [event, ...prev].slice(0, 12));
  }, []);

  const showConnection = useCallback((from: User, to: User) => {
    const connId = connectionIdRef.current++;
    setConnections(prev => [...prev, { id: connId, from, to, active: true }]);
    setTimeout(() => {
      setConnections(prev => prev.filter(c => c.id !== connId));
    }, 1500 / speed);
  }, [speed]);

  const processQuery = useCallback((user: User) => {
    // Pick a random topic and variant
    const topicData = QUERY_TOPICS[Math.floor(Math.random() * QUERY_TOPICS.length)];
    const queryText = topicData.variants[Math.floor(Math.random() * topicData.variants.length)];
    
    const queryId = queryIdRef.current++;
    const startTime = Date.now();
    
    const newQuery: ActiveQuery = {
      id: queryId,
      user,
      text: queryText,
      topic: topicData.topic,
      status: 'sending',
      startTime,
    };

    setActiveQueries(prev => [...prev, newQuery]);

    const baseDelay = 600 / speed;

    // Processing phase
    setTimeout(() => {
      setActiveQueries(prev => prev.map(q => 
        q.id === queryId ? { ...q, status: 'processing' } : q
      ));
    }, baseDelay);

    // Check cache
    setTimeout(() => {
      const queryEmbedding = getEmbedding(queryText);
      
      // Check for exact match
      const exactMatch = cache.find(c => 
        c.query.toLowerCase() === queryText.toLowerCase()
      );
      
      if (exactMatch && exactMatch.user.id !== user.id) {
        // Exact hit from another user!
        const savedCost = LLM_COST;
        const savedTime = LLM_TIME - CACHE_TIME;
        
        setActiveQueries(prev => prev.map(q => 
          q.id === queryId ? { 
            ...q, 
            status: 'hit', 
            hitType: 'exact',
            hitFrom: exactMatch.user,
            savedCost,
            savedTime,
          } : q
        ));
        
        showConnection(exactMatch.user, user);
        addEvent(
          `Exact match! "${queryText.substring(0, 25)}..."`,
          'hit',
          user,
          exactMatch.user
        );

        responseTimesRef.current.push(CACHE_TIME);
        setStats(prev => ({
          ...prev,
          totalQueries: prev.totalQueries + 1,
          cacheHits: prev.cacheHits + 1,
          exactHits: prev.exactHits + 1,
          totalSaved: prev.totalSaved + savedCost,
          avgResponseTime: responseTimesRef.current.reduce((a, b) => a + b, 0) / responseTimesRef.current.length,
          usersBenefited: new Set([...prev.usersBenefited, user.id]),
        }));

        setTimeout(() => {
          setActiveQueries(prev => prev.map(q => 
            q.id === queryId ? { ...q, status: 'complete' } : q
          ));
        }, baseDelay);

        setTimeout(() => {
          setActiveQueries(prev => prev.filter(q => q.id !== queryId));
        }, baseDelay * 3);

        return;
      }

      // Check for semantic match
      let bestMatch: CacheEntry | null = null;
      let bestSimilarity = 0;

      for (const entry of cache) {
        if (entry.user.id === user.id) continue; // Skip own entries for demo
        const entryEmbedding = getEmbedding(entry.query);
        const similarity = cosineSimilarity(queryEmbedding, entryEmbedding);
        if (similarity > bestSimilarity && similarity >= 0.5) {
          bestSimilarity = similarity;
          bestMatch = entry;
        }
      }

      if (bestMatch) {
        // Semantic hit from another user!
        const savedCost = LLM_COST;
        const savedTime = LLM_TIME - CACHE_TIME;
        
        setActiveQueries(prev => prev.map(q => 
          q.id === queryId ? { 
            ...q, 
            status: 'hit', 
            hitType: 'semantic',
            hitFrom: bestMatch!.user,
            similarity: bestSimilarity,
            savedCost,
            savedTime,
          } : q
        ));
        
        showConnection(bestMatch.user, user);
        addEvent(
          `Semantic match (${(bestSimilarity * 100).toFixed(0)}%): "${queryText.substring(0, 20)}..."`,
          'hit',
          user,
          bestMatch.user
        );

        // Add this query variant to cache too
        setCache(prev => [...prev, {
          query: queryText,
          topic: topicData.topic,
          user,
          timestamp: Date.now(),
          embedding: queryEmbedding,
        }]);

        responseTimesRef.current.push(CACHE_TIME);
        setStats(prev => ({
          ...prev,
          totalQueries: prev.totalQueries + 1,
          cacheHits: prev.cacheHits + 1,
          semanticHits: prev.semanticHits + 1,
          totalSaved: prev.totalSaved + savedCost,
          avgResponseTime: responseTimesRef.current.reduce((a, b) => a + b, 0) / responseTimesRef.current.length,
          usersBenefited: new Set([...prev.usersBenefited, user.id]),
        }));

        setTimeout(() => {
          setActiveQueries(prev => prev.map(q => 
            q.id === queryId ? { ...q, status: 'complete' } : q
          ));
        }, baseDelay);

        setTimeout(() => {
          setActiveQueries(prev => prev.filter(q => q.id !== queryId));
        }, baseDelay * 3);

        return;
      }

      // Cache miss - query LLM
      setActiveQueries(prev => prev.map(q => 
        q.id === queryId ? { ...q, status: 'miss', hitType: 'none' } : q
      ));
      
      addEvent(
        `Cache miss: "${queryText.substring(0, 25)}..."`,
        'miss',
        user
      );

      // Add to cache
      setCache(prev => [...prev, {
        query: queryText,
        topic: topicData.topic,
        user,
        timestamp: Date.now(),
        embedding: queryEmbedding,
      }]);

      responseTimesRef.current.push(LLM_TIME);
      setStats(prev => ({
        ...prev,
        totalQueries: prev.totalQueries + 1,
        misses: prev.misses + 1,
        avgResponseTime: responseTimesRef.current.reduce((a, b) => a + b, 0) / responseTimesRef.current.length,
      }));

      setTimeout(() => {
        setActiveQueries(prev => prev.map(q => 
          q.id === queryId ? { ...q, status: 'complete' } : q
        ));
      }, baseDelay * 2);

      setTimeout(() => {
        setActiveQueries(prev => prev.filter(q => q.id !== queryId));
      }, baseDelay * 4);
    }, baseDelay * 2);
  }, [cache, speed, addEvent, showConnection]);

  // Auto-run simulation
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        const randomUser = USERS[Math.floor(Math.random() * USERS.length)];
        processQuery(randomUser);
      }, 1500 / speed);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, speed, processQuery]);

  const reset = () => {
    setIsRunning(false);
    setActiveQueries([]);
    setCache([]);
    setStats({
      totalQueries: 0,
      cacheHits: 0,
      exactHits: 0,
      semanticHits: 0,
      misses: 0,
      totalSaved: 0,
      avgResponseTime: 0,
      usersBenefited: new Set(),
    });
    setRecentEvents([]);
    setConnections([]);
    queryIdRef.current = 0;
    eventIdRef.current = 0;
    responseTimesRef.current = [];
  };

  const hitRate = stats.totalQueries > 0 
    ? ((stats.cacheHits / stats.totalQueries) * 100).toFixed(1) 
    : '0.0';

  return (
    <div className="cross-user-simulation">
      <header className="simulation-header">
        <h1>🏢 Cross-User Semantic Cache</h1>
        <p className="subtitle">
          Watch how team members benefit from each other's cached queries
        </p>
      </header>

      {/* Controls */}
      <div className="controls">
        <button 
          className={`control-btn ${isRunning ? 'stop' : 'start'}`}
          onClick={() => setIsRunning(!isRunning)}
        >
          {isRunning ? '⏸ Pause' : '▶ Start Simulation'}
        </button>
        <button className="control-btn reset" onClick={reset}>
          🔄 Reset
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
      </div>

      {/* Main visualization area */}
      <div className="visualization-container">
        {/* Users panel */}
        <div className="users-panel">
          <h3>👥 Organization Users</h3>
          <div className="users-grid">
            {USERS.map(user => {
              const userQueries = activeQueries.filter(q => q.user.id === user.id);
              const isActive = userQueries.length > 0;
              const hasHit = userQueries.some(q => q.status === 'hit');
              const hasMiss = userQueries.some(q => q.status === 'miss');
              
              return (
                <div 
                  key={user.id}
                  className={`user-card ${isActive ? 'active' : ''} ${hasHit ? 'hit' : ''} ${hasMiss ? 'miss' : ''}`}
                  style={{ '--user-color': user.color } as React.CSSProperties}
                >
                  <div className="user-avatar">{user.avatar}</div>
                  <div className="user-info">
                    <div className="user-name">{user.name}</div>
                    <div className="user-role">{user.role}</div>
                  </div>
                  {isActive && (
                    <div className="user-status">
                      {hasHit && <span className="status-hit">✓ Cache Hit!</span>}
                      {hasMiss && <span className="status-miss">⟳ Querying...</span>}
                      {!hasHit && !hasMiss && <span className="status-processing">🔍</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Central cache visualization */}
        <div className="cache-visualization">
          <div className="central-cache">
            <div className="cache-icon">🧠</div>
            <div className="cache-label">Shared Semantic Cache</div>
            <div className="cache-count">{cache.length} entries</div>
            
            {/* Connection lines */}
            <svg className="connections-svg">
              {connections.map(conn => (
                <line
                  key={conn.id}
                  className={`connection-line ${conn.active ? 'active' : ''}`}
                  x1="50%"
                  y1="50%"
                  x2={`${(USERS.findIndex(u => u.id === conn.to.id) + 1) * 15}%`}
                  y2="20%"
                  style={{ stroke: conn.from.color }}
                />
              ))}
            </svg>
          </div>

          {/* Floating query bubbles */}
          <div className="query-bubbles">
            {activeQueries.map(query => (
              <div 
                key={query.id}
                className={`query-bubble ${query.status}`}
                style={{ 
                  '--user-color': query.user.color,
                  animationDuration: `${1 / speed}s`,
                } as React.CSSProperties}
              >
                <span className="bubble-avatar">{query.user.avatar}</span>
                <span className="bubble-text">
                  {query.text.substring(0, 20)}...
                </span>
                {query.hitFrom && (
                  <span className="bubble-hit-from">
                    ← {query.hitFrom.avatar}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stats panel */}
        <div className="stats-panel">
          <h3>📊 Live Statistics</h3>
          
          <div className="stat-card primary">
            <div className="stat-value">{hitRate}%</div>
            <div className="stat-label">Cache Hit Rate</div>
          </div>

          <div className="stat-card savings">
            <div className="stat-value">${stats.totalSaved.toFixed(2)}</div>
            <div className="stat-label">Cost Saved</div>
          </div>

          <div className="stat-grid">
            <div className="stat-item">
              <span className="stat-num">{stats.totalQueries}</span>
              <span className="stat-name">Total Queries</span>
            </div>
            <div className="stat-item hit">
              <span className="stat-num">{stats.cacheHits}</span>
              <span className="stat-name">Cache Hits</span>
            </div>
            <div className="stat-item">
              <span className="stat-num">{stats.exactHits}</span>
              <span className="stat-name">Exact Hits</span>
            </div>
            <div className="stat-item">
              <span className="stat-num">{stats.semanticHits}</span>
              <span className="stat-name">Semantic Hits</span>
            </div>
            <div className="stat-item miss">
              <span className="stat-num">{stats.misses}</span>
              <span className="stat-name">Misses</span>
            </div>
            <div className="stat-item">
              <span className="stat-num">{stats.usersBenefited.size}</span>
              <span className="stat-name">Users Benefited</span>
            </div>
          </div>

          <div className="response-time">
            <div className="time-bar">
              <div 
                className="time-fill"
                style={{ 
                  width: `${Math.min(100, (stats.avgResponseTime / LLM_TIME) * 100)}%`,
                  backgroundColor: stats.avgResponseTime < 500 ? '#4CAF50' : stats.avgResponseTime < 1000 ? '#FF9800' : '#f44336'
                }}
              />
            </div>
            <div className="time-label">
              Avg Response: {stats.avgResponseTime.toFixed(0)}ms 
              <span className="time-compare">
                (vs {LLM_TIME}ms without cache)
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Feed and Cache side by side */}
      <div className="feed-cache-container">
        {/* Event feed */}
        <div className="event-feed">
          <h3>📝 Activity Feed</h3>
          <div className="events-list">
            {recentEvents.map(event => (
              <div key={event.id} className={`event-item ${event.type}`}>
                {event.user && (
                  <span className="event-user" style={{ color: event.user.color }}>
                    {event.user.avatar} {event.user.name}
                  </span>
                )}
                <span className="event-text">{event.text}</span>
                {event.hitFrom && (
                  <span className="event-hit-from" style={{ color: event.hitFrom.color }}>
                    (from {event.hitFrom.avatar} {event.hitFrom.name})
                  </span>
                )}
              </div>
            ))}
            {recentEvents.length === 0 && (
              <div className="event-item info">
                Press "Start Simulation" to begin...
              </div>
            )}
          </div>
        </div>

        {/* Cache contents preview */}
        <div className="cache-contents">
        <h3>🗄️ Cache Contents by Topic</h3>
        <div className="cache-topics">
          {QUERY_TOPICS.map(topic => {
            const topicEntries = cache.filter(c => c.topic === topic.topic);
            return (
              <div key={topic.topic} className="topic-card">
                <div className="topic-header">
                  <span className="topic-name">{topic.topic}</span>
                  <span className="topic-count">{topicEntries.length} cached</span>
                </div>
                <div className="topic-entries">
                  {topicEntries.slice(0, 3).map((entry, i) => (
                    <div key={i} className="topic-entry">
                      <span 
                        className="entry-user" 
                        style={{ color: entry.user.color }}
                      >
                        {entry.user.avatar}
                      </span>
                      <span className="entry-query">
                        {entry.query.substring(0, 30)}...
                      </span>
                    </div>
                  ))}
                  {topicEntries.length > 3 && (
                    <div className="topic-more">+{topicEntries.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>

      {/* Explanation */}
      <div className="explanation">
        <h3>💡 How Cross-User Caching Works</h3>
        <div className="explanation-cards">
          <div className="exp-card">
            <div className="exp-icon">👥</div>
            <div className="exp-title">Team Members Ask Questions</div>
            <div className="exp-text">
              Different users in an organization often ask similar questions about the same topics.
            </div>
          </div>
          <div className="exp-card">
            <div className="exp-icon">🧠</div>
            <div className="exp-title">Semantic Understanding</div>
            <div className="exp-text">
              The cache recognizes that "How do I deploy?" and "What's the deployment process?" mean the same thing.
            </div>
          </div>
          <div className="exp-card">
            <div className="exp-icon">⚡</div>
            <div className="exp-title">Instant Responses</div>
            <div className="exp-text">
              When User B asks something User A already asked, they get an instant cached response.
            </div>
          </div>
          <div className="exp-card">
            <div className="exp-icon">💰</div>
            <div className="exp-title">Cost Savings</div>
            <div className="exp-text">
              Each cache hit saves ${LLM_COST.toFixed(2)} in LLM API costs. At scale, this adds up to thousands saved.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
