/**
 * API routes
 */

import type { FastifyInstance } from 'fastify';
import { SemanticCacheService } from './cache-service.js';

export async function registerRoutes(app: FastifyInstance) {
  const cacheService = new SemanticCacheService();

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: Date.now() };
  });

  // Query the cache
  app.post<{
    Body: { query: string; threshold?: number };
  }>('/api/cache/query', async (request, reply) => {
    const { query, threshold } = request.body;

    if (!query) {
      return reply.code(400).send({ error: 'Query is required' });
    }

    try {
      const result = await cacheService.query({ query, threshold });
      return result;
    } catch (error) {
      console.error('Error querying cache:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Store in cache
  app.post<{
    Body: { query: string; response: string; metadata?: Record<string, any> };
  }>('/api/cache/store', async (request, reply) => {
    const { query, response, metadata } = request.body;

    if (!query || !response) {
      return reply.code(400).send({ error: 'Query and response are required' });
    }

    try {
      const entry = await cacheService.store(query, response, metadata);
      return { success: true, entry };
    } catch (error) {
      console.error('Error storing in cache:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get cache statistics
  app.get('/api/cache/stats', async () => {
    try {
      const stats = cacheService.getStats();
      return stats;
    } catch (error) {
      console.error('Error getting stats:', error);
      return { error: 'Internal server error' };
    }
  });

  // Clear cache
  app.delete('/api/cache/clear', async (request, reply) => {
    try {
      cacheService.clearCache();
      return { success: true, message: 'Cache cleared' };
    } catch (error) {
      console.error('Error clearing cache:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Chat endpoint (combines query and store)
  app.post<{
    Body: { message: string; response?: string };
  }>('/api/chat', async (request, reply) => {
    const { message, response } = request.body;

    if (!message) {
      return reply.code(400).send({ error: 'Message is required' });
    }

    try {
      // First, check if we have a cached response
      const cacheResult = await cacheService.query({ query: message });

      if (cacheResult.hit && cacheResult.response) {
        return {
          response: cacheResult.response,
          cached: true,
          similarity: cacheResult.similarity,
        };
      }

      // If a response is provided, store it
      if (response) {
        await cacheService.store(message, response);
        return {
          response,
          cached: false,
          stored: true,
        };
      }

      // No cache hit and no response provided
      return {
        cached: false,
        message: 'No cached response found',
      };
    } catch (error) {
      console.error('Error in chat endpoint:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    cacheService.close();
  });
}
