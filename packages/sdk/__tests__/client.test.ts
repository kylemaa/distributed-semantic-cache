/**
 * SDK Client Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { SemanticCache, createSemanticCache, SemanticCacheError } from '../src/index.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SemanticCache', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('constructor', () => {
    it('should create client with minimal config', () => {
      const cache = new SemanticCache({
        baseUrl: 'http://localhost:3000',
      });
      expect(cache).toBeInstanceOf(SemanticCache);
    });

    it('should normalize base URL (remove trailing slash)', () => {
      const cache = new SemanticCache({
        baseUrl: 'http://localhost:3000/',
        apiKey: 'test-key',
      });
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hit: false }),
      });

      cache.query('test');
      
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cache/query',
        expect.any(Object)
      );
    });
  });

  describe('query', () => {
    it('should send query request with correct payload', async () => {
      const cache = new SemanticCache({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          hit: true,
          response: 'Test response',
          similarity: 0.95,
        }),
      });

      const result = await cache.query('What is TypeScript?');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cache/query',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-api-key': 'test-key',
          }),
          body: JSON.stringify({ query: 'What is TypeScript?' }),
        })
      );

      expect(result.hit).toBe(true);
      expect(result.response).toBe('Test response');
    });

    it('should support custom threshold', async () => {
      const cache = new SemanticCache({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hit: false }),
      });

      await cache.query('test', { threshold: 0.9 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ query: 'test', threshold: 0.9 }),
        })
      );
    });
  });

  describe('store', () => {
    it('should send store request with correct payload', async () => {
      const cache = new SemanticCache({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          entry: { id: '123', query: 'test', response: 'answer', timestamp: Date.now() },
        }),
      });

      const result = await cache.store('test query', 'test response', {
        metadata: { source: 'test' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cache/store',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            query: 'test query',
            response: 'test response',
            metadata: { source: 'test' },
          }),
        })
      );

      expect(result.success).toBe(true);
      expect(result.entry.id).toBe('123');
    });
  });

  describe('chat', () => {
    it('should send chat request', async () => {
      const cache = new SemanticCache({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          cached: false,
          stored: true,
          response: 'New response',
        }),
      });

      const result = await cache.chat('Hello', 'World');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/chat',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ message: 'Hello', response: 'World' }),
        })
      );

      expect(result.cached).toBe(false);
      expect(result.stored).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should fetch cache statistics', async () => {
      const cache = new SemanticCache({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          totalEntries: 100,
          exactMatchCache: { hits: 50, misses: 50, hitRate: 0.5 },
        }),
      });

      const stats = await cache.getStats();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cache/stats',
        expect.objectContaining({ method: 'GET' })
      );

      expect(stats.totalEntries).toBe(100);
    });
  });

  describe('admin operations', () => {
    it('should use admin key for admin endpoints', async () => {
      const cache = new SemanticCache({
        baseUrl: 'http://localhost:3000',
        apiKey: 'regular-key',
        adminApiKey: 'admin-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ timestamp: Date.now(), overview: {} }),
      });

      await cache.getComprehensiveStats();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/admin/stats/comprehensive',
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'admin-key',
          }),
        })
      );
    });

    it('should fall back to apiKey if no adminApiKey', async () => {
      const cache = new SemanticCache({
        baseUrl: 'http://localhost:3000',
        apiKey: 'regular-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await cache.clearCache();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/cache/clear',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'x-api-key': 'regular-key',
          }),
        })
      );
    });
  });

  describe('healthCheck', () => {
    it('should not require authentication', async () => {
      const cache = new SemanticCache({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', timestamp: Date.now() }),
      });

      const health = await cache.healthCheck();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/health',
        expect.objectContaining({
          headers: expect.not.objectContaining({
            'x-api-key': expect.any(String),
          }),
        })
      );

      expect(health.status).toBe('ok');
    });
  });

  describe('error handling', () => {
    it('should throw SemanticCacheError on API error', async () => {
      const cache = new SemanticCache({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key',
        retry: { maxRetries: 0 }, // Disable retries for this test
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized', message: 'Invalid API key' }),
      });

      await expect(cache.query('test')).rejects.toThrow(SemanticCacheError);
    });

    it('should include status code and response in error', async () => {
      const cache = new SemanticCache({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key',
        retry: { maxRetries: 0 }, // Disable retries for this test
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Forbidden', message: 'Admin access required' }),
      });

      try {
        await cache.query('test');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SemanticCacheError);
        const cacheError = error as SemanticCacheError;
        expect(cacheError.statusCode).toBe(403);
        expect(cacheError.response?.error).toBe('Forbidden');
      }
    });
  });

  describe('factory function', () => {
    it('should create SemanticCache instance', () => {
      const cache = createSemanticCache({
        baseUrl: 'http://localhost:3000',
        apiKey: 'test-key',
      });

      expect(cache).toBeInstanceOf(SemanticCache);
    });
  });
});
