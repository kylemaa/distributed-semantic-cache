/**
 * API routes
 * 
 * SECURITY NOTE: This is a proof-of-concept implementation.
 * For production use, implement:
 * - Rate limiting (e.g., @fastify/rate-limit)
 * - Authentication and authorization
 * - Input validation and sanitization
 * - Request size limits
 * - CSRF protection
 */

import type { FastifyInstance } from 'fastify';
import { SemanticCacheService } from './cache-service.js';
import { TenantManager } from './tenant-manager.js';
import { AnalyticsService } from './analytics-service.js';

export async function registerRoutes(app: FastifyInstance) {
  // Create service instances
  const cacheService = new SemanticCacheService();
  const tenantManager = new TenantManager();
  const analyticsService = new AnalyticsService();

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

  // ============= TENANT MANAGEMENT ROUTES =============

  // Create tenant
  app.post<{
    Body: { tenantId: string; name: string; similarityThreshold?: number; maxQueries?: number; features?: any };
  }>('/api/tenants', async (request, reply) => {
    const { tenantId, name, similarityThreshold, maxQueries, features } = request.body;

    if (!tenantId || !name) {
      return reply.code(400).send({ error: 'tenantId and name are required' });
    }

    try {
      const tenant = tenantManager.createTenant({
        tenantId,
        name,
        similarityThreshold,
        maxQueries,
        features,
      });
      return { success: true, tenant };
    } catch (error: any) {
      console.error('Error creating tenant:', error);
      if (error.message?.includes('UNIQUE constraint')) {
        return reply.code(409).send({ error: 'Tenant already exists' });
      }
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get tenant
  app.get<{
    Params: { tenantId: string };
  }>('/api/tenants/:tenantId', async (request, reply) => {
    const { tenantId } = request.params;

    try {
      const tenant = tenantManager.getTenant(tenantId);
      if (!tenant) {
        return reply.code(404).send({ error: 'Tenant not found' });
      }
      return tenant;
    } catch (error) {
      console.error('Error getting tenant:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // List all tenants
  app.get('/api/tenants', async () => {
    try {
      const tenants = tenantManager.listTenants();
      return { tenants };
    } catch (error) {
      console.error('Error listing tenants:', error);
      return { error: 'Internal server error' };
    }
  });

  // Update tenant
  app.patch<{
    Params: { tenantId: string };
    Body: Partial<{ name: string; similarityThreshold: number; maxQueries: number; features: any }>;
  }>('/api/tenants/:tenantId', async (request, reply) => {
    const { tenantId } = request.params;
    const updates = request.body;

    try {
      const tenant = tenantManager.updateTenant(tenantId, updates);
      if (!tenant) {
        return reply.code(404).send({ error: 'Tenant not found' });
      }
      return { success: true, tenant };
    } catch (error) {
      console.error('Error updating tenant:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Delete tenant
  app.delete<{
    Params: { tenantId: string };
  }>('/api/tenants/:tenantId', async (request, reply) => {
    const { tenantId } = request.params;

    try {
      const deleted = tenantManager.deleteTenant(tenantId);
      if (!deleted) {
        return reply.code(404).send({ error: 'Tenant not found' });
      }
      return { success: true, message: 'Tenant deleted' };
    } catch (error) {
      console.error('Error deleting tenant:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get tenant usage
  app.get<{
    Params: { tenantId: string };
  }>('/api/tenants/:tenantId/usage', async (request, reply) => {
    const { tenantId } = request.params;

    try {
      const usage = tenantManager.getTenantUsage(tenantId);
      return usage;
    } catch (error) {
      console.error('Error getting tenant usage:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get tenant quota
  app.get<{
    Params: { tenantId: string };
  }>('/api/tenants/:tenantId/quota', async (request, reply) => {
    const { tenantId } = request.params;

    try {
      const quota = tenantManager.getTenantQuota(tenantId);
      if (!quota) {
        return reply.code(404).send({ error: 'Tenant not found' });
      }
      return quota;
    } catch (error) {
      console.error('Error getting tenant quota:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Get all tenants with stats
  app.get('/api/tenants/stats/all', async () => {
    try {
      const stats = tenantManager.getAllTenantsStats();
      return { tenants: stats };
    } catch (error) {
      console.error('Error getting all tenant stats:', error);
      return { error: 'Internal server error' };
    }
  });

  // ============= ANALYTICS ROUTES =============

  // Get cost savings
  app.get('/api/analytics/cost-savings', async (request) => {
    const { tenantId, days } = request.query as any;

    try {
      const costSavings = analyticsService.getCostSavings(
        tenantId,
        days ? parseInt(days) : 30
      );
      return costSavings;
    } catch (error) {
      console.error('Error getting cost savings:', error);
      return { error: 'Internal server error' };
    }
  });

  // Get time series data
  app.get('/api/analytics/time-series', async (request) => {
    const { tenantId, days, interval } = request.query as any;

    try {
      const timeSeries = analyticsService.getTimeSeries(
        tenantId,
        days ? parseInt(days) : 30,
        interval as 'hour' | 'day'
      );
      return { data: timeSeries };
    } catch (error) {
      console.error('Error getting time series:', error);
      return { error: 'Internal server error' };
    }
  });

  // Get top query patterns
  app.get('/api/analytics/patterns', async (request) => {
    const { tenantId, limit } = request.query as any;

    try {
      const patterns = analyticsService.getTopPatterns(
        tenantId,
        limit ? parseInt(limit) : 10
      );
      return { patterns };
    } catch (error) {
      console.error('Error getting patterns:', error);
      return { error: 'Internal server error' };
    }
  });

  // Get performance metrics
  app.get('/api/analytics/performance', async (request) => {
    const { tenantId, days } = request.query as any;

    try {
      const performance = analyticsService.getPerformanceMetrics(
        tenantId,
        days ? parseInt(days) : 7
      );
      return performance;
    } catch (error) {
      console.error('Error getting performance metrics:', error);
      return { error: 'Internal server error' };
    }
  });

  // Get comprehensive dashboard
  app.get('/api/analytics/dashboard', async (request) => {
    const { tenantId, days } = request.query as any;

    try {
      const dashboard = analyticsService.getDashboard(
        tenantId,
        days ? parseInt(days) : 30
      );
      return dashboard;
    } catch (error) {
      console.error('Error getting dashboard:', error);
      return { error: 'Internal server error' };
    }
  });

  // Export analytics (CSV)
  app.get('/api/analytics/export/csv', async (request, reply) => {
    const { tenantId, days } = request.query as any;

    try {
      const csv = analyticsService.exportCSV(
        tenantId,
        days ? parseInt(days) : 30
      );
      reply.type('text/csv');
      reply.header('Content-Disposition', 'attachment; filename="analytics.csv"');
      return csv;
    } catch (error) {
      console.error('Error exporting CSV:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Export analytics (JSON)
  app.get('/api/analytics/export/json', async (request, reply) => {
    const { tenantId, days } = request.query as any;

    try {
      const json = analyticsService.exportJSON(
        tenantId,
        days ? parseInt(days) : 30
      );
      reply.type('application/json');
      reply.header('Content-Disposition', 'attachment; filename="analytics.json"');
      return json;
    } catch (error) {
      console.error('Error exporting JSON:', error);
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // Graceful shutdown
  app.addHook('onClose', async () => {
    cacheService.close();
    tenantManager.close();
    analyticsService.close();
  });
}
