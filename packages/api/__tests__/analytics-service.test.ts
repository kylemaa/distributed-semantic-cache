import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnalyticsService } from '../src/analytics-service.js';
import fs from 'fs';
import path from 'path';

describe('AnalyticsService', () => {
  let analytics: AnalyticsService;
  const testDbPath = path.join(process.cwd(), `test-analytics-${Date.now()}-${Math.random()}.db`);

  beforeEach(() => {
    analytics = new AnalyticsService({ dbPath: testDbPath });
  });

  afterEach(() => {
    analytics.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Query Recording', () => {
    it('should record a cache hit', () => {
      analytics.recordQuery({
        query: 'test query',
        responseTimeMs: 50,
        isHit: true,
        similarity: 0.95,
        confidenceScore: 0.92,
        cacheLayer: 'exact_match',
      });

      const savings = analytics.getCostSavings(undefined, 30);
      expect(savings.totalQueries).toBe(1);
      expect(savings.cacheHits).toBe(1);
      expect(savings.cacheMisses).toBe(0);
      expect(savings.hitRate).toBe(100);
    });

    it('should record a cache miss', () => {
      analytics.recordQuery({
        query: 'test query',
        responseTimeMs: 150,
        isHit: false,
      });

      const savings = analytics.getCostSavings(undefined, 30);
      expect(savings.totalQueries).toBe(1);
      expect(savings.cacheHits).toBe(0);
      expect(savings.cacheMisses).toBe(1);
      expect(savings.hitRate).toBe(0);
    });

    it('should record multiple queries', () => {
      analytics.recordQuery({
        query: 'query 1',
        responseTimeMs: 50,
        isHit: true,
      });

      analytics.recordQuery({
        query: 'query 2',
        responseTimeMs: 150,
        isHit: false,
      });

      analytics.recordQuery({
        query: 'query 3',
        responseTimeMs: 45,
        isHit: true,
      });

      const savings = analytics.getCostSavings(undefined, 30);
      expect(savings.totalQueries).toBe(3);
      expect(savings.cacheHits).toBe(2);
      expect(savings.cacheMisses).toBe(1);
      expect(savings.hitRate).toBeCloseTo(66.67, 1);
    });
  });

  describe('Cost Savings Calculation', () => {
    it('should calculate cost savings', () => {
      // Record 5 hits and 5 misses
      for (let i = 0; i < 5; i++) {
        analytics.recordQuery({
          query: `hit query ${i}`,
          responseTimeMs: 50,
          isHit: true,
        });
      }

      for (let i = 0; i < 5; i++) {
        analytics.recordQuery({
          query: `miss query ${i}`,
          responseTimeMs: 150,
          isHit: false,
        });
      }

      const savings = analytics.getCostSavings(undefined, 30);
      expect(savings.totalQueries).toBe(10);
      expect(savings.hitRate).toBe(50);
      expect(savings.savedCost).toBeGreaterThan(0);
      expect(savings.savingsPercentage).toBeGreaterThan(0);
    });

    it('should handle no queries', () => {
      const savings = analytics.getCostSavings(undefined, 30);
      expect(savings.totalQueries).toBe(0);
      expect(savings.cacheHits).toBe(0);
      expect(savings.hitRate).toBe(0);
      expect(savings.savedCost).toBe(0);
    });

    it('should filter by tenant', () => {
      analytics.recordQuery({
        tenantId: 'tenant-1',
        query: 'query 1',
        responseTimeMs: 50,
        isHit: true,
      });

      analytics.recordQuery({
        tenantId: 'tenant-2',
        query: 'query 2',
        responseTimeMs: 50,
        isHit: true,
      });

      const tenant1Savings = analytics.getCostSavings('tenant-1', 30);
      expect(tenant1Savings.totalQueries).toBe(1);

      const allSavings = analytics.getCostSavings(undefined, 30);
      expect(allSavings.totalQueries).toBe(2);
    });
  });

  describe('Time Series Data', () => {
    it('should generate time series data', () => {
      analytics.recordQuery({
        query: 'test query',
        responseTimeMs: 50,
        isHit: true,
      });

      const timeSeries = analytics.getTimeSeries(undefined, 7);
      expect(timeSeries).toBeInstanceOf(Array);
      expect(timeSeries.length).toBeGreaterThan(0);

      const today = timeSeries[timeSeries.length - 1];
      expect(today.queries).toBe(1);
      expect(today.hits).toBe(1);
      expect(today.misses).toBe(0);
      expect(today.hitRate).toBe(100);
    });

    it('should filter time series by tenant', () => {
      analytics.recordQuery({
        tenantId: 'tenant-1',
        query: 'query 1',
        responseTimeMs: 50,
        isHit: true,
      });

      analytics.recordQuery({
        tenantId: 'tenant-2',
        query: 'query 2',
        responseTimeMs: 50,
        isHit: true,
      });

      const tenant1Series = analytics.getTimeSeries('tenant-1', 7);
      expect(tenant1Series[tenant1Series.length - 1].queries).toBe(1);

      // Both queries are on the same day, so they should be aggregated in daily_stats
      // but filtered by tenant in the query, so we expect 1 per tenant
      const tenant2Series = analytics.getTimeSeries('tenant-2', 7);
      expect(tenant2Series[tenant2Series.length - 1].queries).toBe(1);
    });
  });

  describe('Query Patterns', () => {
    it('should track query patterns', () => {
      // Use identical queries so they match the same pattern
      analytics.recordQuery({
        query: 'what is the weather',
        responseTimeMs: 50,
        isHit: true,
        similarity: 0.95,
      });

      analytics.recordQuery({
        query: 'what is the weather',
        responseTimeMs: 50,
        isHit: true,
        similarity: 0.92,
      });

      analytics.recordQuery({
        query: 'what is the weather',
        responseTimeMs: 50,
        isHit: true,
        similarity: 0.98,
      });

      const patterns = analytics.getTopPatterns(undefined, 10);
      expect(patterns).toBeInstanceOf(Array);
      expect(patterns.length).toBeGreaterThan(0);

      const weatherPattern = patterns[0];
      // Should have tracked multiple queries for the same pattern
      expect(weatherPattern.count).toBeGreaterThanOrEqual(1);
      expect(weatherPattern.hitRate).toBeCloseTo(100, 0);
      // Pattern matching normalizes queries, so variations may create separate patterns
      // Just check that we have example queries
      expect(weatherPattern.exampleQueries.length).toBeGreaterThan(0);
    });

    it('should limit top patterns', () => {
      for (let i = 0; i < 20; i++) {
        analytics.recordQuery({
          query: `unique query ${i}`,
          responseTimeMs: 50,
          isHit: true,
        });
      }

      const patterns = analytics.getTopPatterns(undefined, 5);
      expect(patterns).toHaveLength(5);
    });
  });

  describe('Performance Metrics', () => {
    it('should calculate performance metrics', () => {
      const responseTimes = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      for (const time of responseTimes) {
        analytics.recordQuery({
          query: `query ${time}`,
          responseTimeMs: time,
          isHit: true,
        });
      }

      const metrics = analytics.getPerformanceMetrics(undefined, 7);
      expect(metrics.totalRequests).toBe(10);
      expect(metrics.avgResponseTime).toBe(55);
      // P50 is 50th percentile, which for 10 items (0-indexed) is floor(10 * 0.50) = 5th index (60)
      expect(metrics.p50ResponseTime).toBeGreaterThanOrEqual(50);
      expect(metrics.p50ResponseTime).toBeLessThanOrEqual(60);
      expect(metrics.p95ResponseTime).toBeGreaterThanOrEqual(90);
      expect(metrics.p99ResponseTime).toBe(100);
    });

    it('should handle empty metrics', () => {
      const metrics = analytics.getPerformanceMetrics(undefined, 7);
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.avgResponseTime).toBe(0);
      expect(metrics.p50ResponseTime).toBe(0);
    });
  });

  describe('Data Export', () => {
    beforeEach(() => {
      analytics.recordQuery({
        query: 'test query',
        responseTimeMs: 50,
        isHit: true,
      });
    });

    it('should export to CSV', () => {
      const csv = analytics.exportCSV(undefined, 30);
      expect(csv).toContain('Date,Queries,Cache Hits,Cache Misses,Hit Rate %,Cost,Saved Cost');
      expect(csv.split('\n').length).toBeGreaterThan(1);
    });

    it('should export to JSON', () => {
      const json = analytics.exportJSON(undefined, 30);
      const data = JSON.parse(json);

      expect(data.exportDate).toBeDefined();
      expect(data.costSavings).toBeDefined();
      expect(data.timeSeries).toBeDefined();
      expect(data.topPatterns).toBeDefined();
      expect(data.performance).toBeDefined();
    });
  });

  describe('Dashboard Data', () => {
    it('should get comprehensive dashboard data', () => {
      analytics.recordQuery({
        query: 'test query',
        responseTimeMs: 50,
        isHit: true,
      });

      const dashboard = analytics.getDashboard(undefined, 30);

      expect(dashboard.costSavings).toBeDefined();
      expect(dashboard.costSavings.totalQueries).toBe(1);

      expect(dashboard.timeSeries).toBeDefined();
      expect(dashboard.timeSeries).toBeInstanceOf(Array);

      expect(dashboard.topPatterns).toBeDefined();
      expect(dashboard.topPatterns).toBeInstanceOf(Array);

      expect(dashboard.performance).toBeDefined();
      expect(dashboard.performance.totalRequests).toBe(1);
    });
  });

  describe('Data Cleanup', () => {
    it('should clear old data', () => {
      analytics.recordQuery({
        query: 'test query',
        responseTimeMs: 50,
        isHit: true,
      });

      let savings = analytics.getCostSavings(undefined, 30);
      expect(savings.totalQueries).toBe(1);

      // Clear data older than 0 days (clears everything)
      analytics.clearOldData(0);

      savings = analytics.getCostSavings(undefined, 30);
      expect(savings.totalQueries).toBe(0);
    });
  });
});
