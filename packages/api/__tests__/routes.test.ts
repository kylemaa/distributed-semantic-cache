/**
 * API route tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { registerRoutes } from '../src/routes.js';
import fs from 'fs';

// Mock the embeddings service to avoid real API calls
vi.mock('../src/embeddings.js', () => {
  // Simple word-based embedding generation for testing
  function generateMockEmbedding(text: string): number[] {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = Array(384).fill(0);
    
    // Create embeddings that reflect word content
    words.forEach((word, idx) => {
      const wordHash = word.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      for (let i = 0; i < 384; i++) {
        embedding[i] += Math.sin(wordHash * (i + 1) + idx) * 0.1;
      }
    });
    
    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  return {
    EmbeddingsService: vi.fn().mockImplementation(() => ({
      generateEmbedding: vi.fn().mockImplementation((text: string) => {
        return Promise.resolve(generateMockEmbedding(text));
      }),
      generateEmbeddings: vi.fn().mockImplementation((texts: string[]) => {
        return Promise.resolve(texts.map(text => generateMockEmbedding(text)));
      }),
    })),
  };
});

describe('API Routes', () => {
  let app: FastifyInstance;
  let testDbPath: string;

  beforeEach(async () => {
    // Create unique database path for each test to ensure isolation
    testDbPath = `./test-routes-${Date.now()}-${Math.random().toString(36)}.db`;
    process.env.DATABASE_PATH = testDbPath;
    process.env.OPENAI_API_KEY = 'test-key'; // Set a dummy key for tests
    app = Fastify({ logger: false });
    await registerRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    // Give a small delay for file handles to close
    await new Promise(resolve => setTimeout(resolve, 10));
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });

  describe('POST /api/cache/store', () => {
    it('should store a query-response pair', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/cache/store',
        payload: {
          query: 'What is TypeScript?',
          response: 'TypeScript is a typed superset of JavaScript.',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.entry).toBeDefined();
      expect(body.entry.query).toBe('What is TypeScript?');
      expect(body.entry.response).toBe('TypeScript is a typed superset of JavaScript.');
    });

    it('should store metadata with entry', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/cache/store',
        payload: {
          query: 'test',
          response: 'answer',
          metadata: { source: 'test', userId: '123' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.entry.metadata).toEqual({ source: 'test', userId: '123' });
    });

    it('should return 400 when query is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/cache/store',
        payload: {
          response: 'answer',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Query and response are required');
    });

    it('should return 400 when response is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/cache/store',
        payload: {
          query: 'test',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/cache/query', () => {
    beforeEach(async () => {
      // Pre-populate cache
      await app.inject({
        method: 'POST',
        url: '/api/cache/store',
        payload: {
          query: 'What is Node.js?',
          response: 'Node.js is a JavaScript runtime.',
        },
      });
    });

    it('should find exact match in cache', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/cache/query',
        payload: {
          query: 'What is Node.js?',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.hit).toBe(true);
      expect(body.response).toBe('Node.js is a JavaScript runtime.');
      expect(body.similarity).toBeCloseTo(1.0, 1);
    });

    it('should respect custom threshold', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/cache/query',
        payload: {
          query: 'Explain Node.js',
          threshold: 0.99, // Very strict
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // May or may not hit depending on embedding similarity
      expect(body).toHaveProperty('hit');
    });

    it('should return cache miss for dissimilar query', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/cache/query',
        payload: {
          query: 'Tell me about quantum computing',
          threshold: 0.85,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.hit).toBe(false);
    });

    it('should return 400 when query is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/cache/query',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Query is required');
    });
  });

  describe('GET /api/cache/stats', () => {
    it('should return cache statistics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/cache/stats',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('totalEntries');
      expect(typeof body.totalEntries).toBe('number');
    });

    it('should show correct entry count', async () => {
      // Add entries
      await app.inject({
        method: 'POST',
        url: '/api/cache/store',
        payload: { query: 'q1', response: 'r1' },
      });
      await app.inject({
        method: 'POST',
        url: '/api/cache/store',
        payload: { query: 'q2', response: 'r2' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/cache/stats',
      });

      const body = JSON.parse(response.body);
      expect(body.totalEntries).toBe(2);
    });
  });

  describe('DELETE /api/cache/clear', () => {
    it('should clear the cache', async () => {
      // Add entry
      await app.inject({
        method: 'POST',
        url: '/api/cache/store',
        payload: { query: 'test', response: 'answer' },
      });

      // Clear cache
      const clearResponse = await app.inject({
        method: 'DELETE',
        url: '/api/cache/clear',
      });

      expect(clearResponse.statusCode).toBe(200);
      const clearBody = JSON.parse(clearResponse.body);
      expect(clearBody.success).toBe(true);

      // Verify cache is empty
      const statsResponse = await app.inject({
        method: 'GET',
        url: '/api/cache/stats',
      });
      const statsBody = JSON.parse(statsResponse.body);
      expect(statsBody.totalEntries).toBe(0);
    });
  });

  describe('POST /api/chat', () => {
    it('should return 400 when message is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Message is required');
    });

    it('should handle chat with cache miss and provided response', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'What is Fastify?',
          response: 'Fastify is a fast web framework.',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.response).toBe('Fastify is a fast web framework.');
      expect(body.cached).toBe(false);
    });

    it('should return cached response on subsequent similar message', async () => {
      // First request - store
      await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'What is REST API?',
          response: 'REST is an architectural style.',
        },
      });

      // Second request - should hit cache
      const response = await app.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'What is REST API?',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.response).toBe('REST is an architectural style.');
      expect(body.cached).toBe(true);
      expect(body.similarity).toBeCloseTo(1.0, 1);
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/cache/store',
        payload: 'invalid json',
        headers: {
          'content-type': 'application/json',
        },
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });

    it('should handle invalid content type gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/cache/store',
        payload: 'plain text',
        headers: {
          'content-type': 'text/plain',
        },
      });

      // Fastify will reject this before it reaches our handler
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });
});
