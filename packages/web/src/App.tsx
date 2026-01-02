import { useState, useRef, useEffect } from 'react';
import AdminDashboard from './AdminDashboard';
import CacheSimulation from './CacheSimulation';
import CrossUserSimulation from './CrossUserSimulation';
import HomePage from './HomePage';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  cached?: boolean;
  similarity?: number;
  timestamp: number;
}

interface CacheStats {
  count: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
}

type View = 'home' | 'chat' | 'admin' | 'simulation' | 'cross-user';

function App() {
  const [view, setView] = useState<View>('home');
  const [demoMenuOpen, setDemoMenuOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<CacheStats | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    fetchStats();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setDemoMenuOpen(false);
    if (demoMenuOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [demoMenuOpen]);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/api/cache/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      // Silently ignore - demo mode works without API
      console.log('API not available, running in demo mode');
    }
  };

  const handleNavigate = (newView: string) => {
    setView(newView as View);
    setDemoMenuOpen(false);
  };

  // Home page view
  if (view === 'home') {
    return <HomePage onNavigate={handleNavigate} />;
  }

  // Helper component for navigation
  const Navigation = ({ currentView }: { currentView: View }) => (
    <nav className="app-nav">
      <button onClick={() => setView('home')} className="nav-btn nav-brand">
        🚀 Semantic Cache
      </button>
      <div className="nav-spacer"></div>
      <div className="nav-dropdown" onClick={(e) => e.stopPropagation()}>
        <button 
          onClick={() => setDemoMenuOpen(!demoMenuOpen)} 
          className={`nav-btn nav-dropdown-trigger ${['chat', 'simulation', 'cross-user'].includes(currentView) ? 'active' : ''}`}
        >
          🎮 Demos
          <svg className={`dropdown-arrow ${demoMenuOpen ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        {demoMenuOpen && (
          <div className="nav-dropdown-menu">
            <button onClick={() => handleNavigate('chat')} className={`dropdown-item ${currentView === 'chat' ? 'active' : ''}`}>
              💬 Chat Demo
            </button>
            <button onClick={() => handleNavigate('simulation')} className={`dropdown-item ${currentView === 'simulation' ? 'active' : ''}`}>
              ⚡ Simulation
            </button>
            <button onClick={() => handleNavigate('cross-user')} className={`dropdown-item ${currentView === 'cross-user' ? 'active' : ''}`}>
              👥 Cross-User
            </button>
          </div>
        )}
      </div>
      <button onClick={() => setView('admin')} className={`nav-btn ${currentView === 'admin' ? 'active' : ''}`}>
        🎛️ Dashboard
      </button>
    </nav>
  );

  if (view === 'simulation') {
    return (
      <div className="app-container simulation-view">
        <Navigation currentView={view} />
        <CacheSimulation />
      </div>
    );
  }

  if (view === 'cross-user') {
    return (
      <div className="app-container simulation-view">
        <Navigation currentView={view} />
        <CrossUserSimulation />
      </div>
    );
  }

  if (view === 'admin') {
    return (
      <div className="app-container admin-view">
        <Navigation currentView={view} />
        <AdminDashboard />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: input,
      sender: 'user',
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // First, check cache
      const cacheResponse = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      });

      if (!cacheResponse.ok) {
        throw new Error('API unavailable');
      }

      const cacheData = await cacheResponse.json();

      if (cacheData.cached && cacheData.response) {
        // Cache hit
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: cacheData.response,
          sender: 'assistant',
          cached: true,
          similarity: cacheData.similarity,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        // No cache hit - simulate a response (in real app, call LLM here)
        const simulatedResponse = `This is a simulated response to: "${input}". In a production system, this would call an LLM API.`;

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: simulatedResponse,
          sender: 'assistant',
          cached: false,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        // Store in cache
        await fetch(`${API_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: input,
            response: simulatedResponse,
          }),
        });
      }

      // Refresh stats
      await fetchStats();
    } catch (error) {
      // Demo mode - provide simulated response without API
      console.log('Running in demo mode - simulating response');
      const demoResponse = `[Demo Mode] This is a simulated response to: "${input}"\n\nIn production with the API connected, this would:\n1. Check semantic cache for similar queries\n2. Call LLM if no cache hit\n3. Store the response for future queries`;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: demoResponse,
        sender: 'assistant',
        cached: false,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearCache = async () => {
    if (!window.confirm('Are you sure you want to clear the cache?')) return;

    try {
      await fetch(`${API_URL}/api/cache/clear`, {
        method: 'DELETE',
      });
      await fetchStats();
      alert('Cache cleared successfully');
    } catch (error) {
      console.error('Error clearing cache:', error);
      alert('Error clearing cache');
    }
  };

  return (
    <div className="app-container">
      <Navigation currentView={view} />
      
      <div className="app">
        <header className="header">
          <h1>💬 Semantic Cache Chat</h1>
          <div className="stats">
            <span>Cache Entries: {stats?.count || 0}</span>
            <button onClick={handleClearCache} className="clear-btn">
              Clear Cache
            </button>
          </div>
        </header>

      <div className="chat-container">
        <div className="messages">
          {messages.length === 0 && (
            <div className="welcome">
              <h2>Welcome to Semantic Cache Chat!</h2>
              <p>
                This demo uses semantic embeddings to cache responses. Similar queries
                will return cached results instantly.
              </p>
              <p className="hint">Try asking similar questions to see the cache in action!</p>
            </div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`message ${message.sender}`}>
              <div className="message-content">
                <p>{message.text}</p>
                {message.cached !== undefined && (
                  <div className="message-meta">
                    {message.cached ? (
                      <span className="cached-badge">
                        ⚡ Cached (similarity: {message.similarity?.toFixed(3)})
                      </span>
                    ) : (
                      <span className="fresh-badge">🆕 Fresh</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="message assistant">
              <div className="message-content">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSubmit} className="input-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isLoading}
            className="input-field"
          />
          <button type="submit" disabled={isLoading || !input.trim()} className="send-btn">
            Send
          </button>
        </form>
      </div>
    </div>
    </div>
  );
}

export default App;
