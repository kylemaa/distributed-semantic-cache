import { useState, useRef, useEffect } from 'react';
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

function App() {
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

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/api/cache/stats`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

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
      console.error('Error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'Error: Could not connect to the server. Make sure the API is running.',
        sender: 'assistant',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
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
    <div className="app">
      <header className="header">
        <h1>🚀 Semantic Cache Chat</h1>
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
  );
}

export default App;
