/**
 * Analytics Service
 * Advanced analytics for cost savings, performance metrics, and query patterns
 * 
 * MIT License - See LICENSE for details
 */

import Database from 'better-sqlite3';
import path from 'path';

export interface CostSavings {
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  totalCostWithoutCache: number; // What you would have paid
  actualCost: number; // What you actually paid
  savedCost: number; // Difference
  savingsPercentage: number;
}

export interface QueryPattern {
  pattern: string;
  count: number;
  avgSimilarity: number;
  hitRate: number;
  exampleQueries: string[];
}

export interface PerformanceMetrics {
  avgResponseTime: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  totalRequests: number;
  errorsCount: number;
  errorRate: number;
}

export interface TimeSeriesData {
  timestamp: number;
  queries: number;
  hits: number;
  misses: number;
  hitRate: number;
  cost: number;
  savedCost: number;
}

export interface AnalyticsConfig {
  dbPath?: string;
  embeddingCostPer1M?: number; // Cost per 1M tokens
  llmCostPer1M?: number; // Cost per 1M tokens
  avgTokensPerQuery?: number;
}

export class AnalyticsService {
  private db: Database.Database;
  private dbPath: string;
  private embeddingCostPer1M: number;
  private llmCostPer1M: number;
  private avgTokensPerQuery: number;

  constructor(config: AnalyticsConfig = {}) {
    this.dbPath = config.dbPath || path.join(process.cwd(), 'analytics.db');
    this.db = new Database(this.dbPath);
    
    // Default costs (OpenAI pricing as of Dec 2025)
    this.embeddingCostPer1M = config.embeddingCostPer1M || 0.13; // text-embedding-3-small
    this.llmCostPer1M = config.llmCostPer1M || 2.50; // gpt-4-turbo output
    this.avgTokensPerQuery = config.avgTokensPerQuery || 500;

    this.initializeTables();
  }

  private initializeTables(): void {
    // Query log table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS query_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT,
        query TEXT NOT NULL,
        response_time_ms INTEGER,
        is_hit INTEGER NOT NULL,
        similarity REAL,
        confidence_score REAL,
        cache_layer TEXT,
        timestamp INTEGER NOT NULL,
        cost REAL DEFAULT 0,
        saved_cost REAL DEFAULT 0
      )
    `);

    // Daily aggregates table for faster queries
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT,
        date TEXT NOT NULL,
        total_queries INTEGER DEFAULT 0,
        cache_hits INTEGER DEFAULT 0,
        cache_misses INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0,
        saved_cost REAL DEFAULT 0,
        avg_response_time REAL DEFAULT 0,
        UNIQUE(tenant_id, date)
      )
    `);

    // Query patterns table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS query_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT,
        pattern TEXT NOT NULL,
        count INTEGER DEFAULT 1,
        total_similarity REAL DEFAULT 0,
        total_hits INTEGER DEFAULT 0,
        example_queries TEXT,
        last_seen INTEGER NOT NULL,
        UNIQUE(tenant_id, pattern)
      )
    `);

    // Create indices
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_query_log_tenant ON query_log(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_query_log_timestamp ON query_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_daily_stats_tenant ON daily_stats(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);
      CREATE INDEX IF NOT EXISTS idx_patterns_tenant ON query_patterns(tenant_id);
    `);
  }

  /**
   * Record a query execution
   */
  recordQuery(params: {
    tenantId?: string;
    query: string;
    responseTimeMs: number;
    isHit: boolean;
    similarity?: number;
    confidenceScore?: number;
    cacheLayer?: string;
  }): void {
    const now = Date.now();
    const cost = params.isHit ? 0 : this.calculateQueryCost();
    const savedCost = params.isHit ? this.calculateQueryCost() : 0;

    // Insert into query log
    const stmt = this.db.prepare(`
      INSERT INTO query_log (
        tenant_id, query, response_time_ms, is_hit, similarity, confidence_score, cache_layer, timestamp, cost, saved_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      params.tenantId || null,
      params.query,
      params.responseTimeMs,
      params.isHit ? 1 : 0,
      params.similarity ?? null,
      params.confidenceScore ?? null,
      params.cacheLayer || null,
      now,
      cost,
      savedCost
    );

    // Update daily aggregates
    this.updateDailyStats(params.tenantId || null, params.isHit, cost, savedCost, params.responseTimeMs);

    // Update query patterns (extract keywords and store)
    this.updateQueryPattern(params.tenantId || null, params.query, params.isHit, params.similarity || 0);
  }

  private updateDailyStats(tenantId: string | null, isHit: boolean, cost: number, savedCost: number, responseTime: number): void {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const stmt = this.db.prepare(`
      INSERT INTO daily_stats (tenant_id, date, total_queries, cache_hits, cache_misses, total_cost, saved_cost, avg_response_time)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, date) DO UPDATE SET
        total_queries = total_queries + 1,
        cache_hits = cache_hits + ?,
        cache_misses = cache_misses + ?,
        total_cost = total_cost + ?,
        saved_cost = saved_cost + ?,
        avg_response_time = (avg_response_time * total_queries + ?) / (total_queries + 1)
    `);

    const hit = isHit ? 1 : 0;
    const miss = isHit ? 0 : 1;

    stmt.run(
      tenantId,
      date,
      hit,
      miss,
      cost,
      savedCost,
      responseTime,
      hit,
      miss,
      cost,
      savedCost,
      responseTime
    );
  }

  private updateQueryPattern(tenantId: string | null, query: string, isHit: boolean, similarity: number): void {
    // Extract pattern (simplified - just lowercase and remove numbers/special chars)
    const pattern = query
      .toLowerCase()
      .replace(/\d+/g, 'N')
      .replace(/[^\w\s]/g, '')
      .trim()
      .substring(0, 100);

    const now = Date.now();
    const exampleQueries = JSON.stringify([query]);

    const stmt = this.db.prepare(`
      INSERT INTO query_patterns (tenant_id, pattern, count, total_similarity, total_hits, example_queries, last_seen)
      VALUES (?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, pattern) DO UPDATE SET
        count = count + 1,
        total_similarity = total_similarity + ?,
        total_hits = total_hits + ?,
        example_queries = CASE 
          WHEN count < 5 THEN json_insert(example_queries, '$[' || count || ']', ?)
          ELSE example_queries
        END,
        last_seen = ?
    `);

    const hit = isHit ? 1 : 0;

    stmt.run(
      tenantId,
      pattern,
      similarity,
      hit,
      exampleQueries,
      now,
      similarity,
      hit,
      query,
      now
    );
  }

  /**
   * Calculate cost for a single query (embedding + LLM)
   */
  private calculateQueryCost(): number {
    const tokens = this.avgTokensPerQuery;
    const embeddingCost = (tokens / 1000000) * this.embeddingCostPer1M;
    const llmCost = (tokens / 1000000) * this.llmCostPer1M;
    return embeddingCost + llmCost;
  }

  /**
   * Get cost savings summary
   */
  getCostSavings(tenantId?: string, days: number = 30): CostSavings {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.getTime();

    let query = `
      SELECT 
        COUNT(*) as total_queries,
        SUM(CASE WHEN is_hit = 1 THEN 1 ELSE 0 END) as cache_hits,
        SUM(CASE WHEN is_hit = 0 THEN 1 ELSE 0 END) as cache_misses,
        SUM(cost) as actual_cost,
        SUM(saved_cost) as saved_cost
      FROM query_log
      WHERE timestamp >= ?
    `;

    const params: any[] = [cutoffTimestamp];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const stmt = this.db.prepare(query);
    const row = stmt.get(...params) as any;

    const totalQueries = row.total_queries || 0;
    const cacheHits = row.cache_hits || 0;
    const cacheMisses = row.cache_misses || 0;
    const actualCost = row.actual_cost || 0;
    const savedCost = row.saved_cost || 0;
    const hitRate = totalQueries > 0 ? (cacheHits / totalQueries) * 100 : 0;
    const totalCostWithoutCache = actualCost + savedCost;
    const savingsPercentage = totalCostWithoutCache > 0 ? (savedCost / totalCostWithoutCache) * 100 : 0;

    return {
      totalQueries,
      cacheHits,
      cacheMisses,
      hitRate: Math.round(hitRate * 100) / 100,
      totalCostWithoutCache: Math.round(totalCostWithoutCache * 100) / 100,
      actualCost: Math.round(actualCost * 100) / 100,
      savedCost: Math.round(savedCost * 100) / 100,
      savingsPercentage: Math.round(savingsPercentage * 100) / 100,
    };
  }

  /**
   * Get time series data for charts
   */
  getTimeSeries(tenantId?: string, days: number = 30, interval: 'hour' | 'day' = 'day'): TimeSeriesData[] {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoff = cutoffDate.toISOString().split('T')[0];

    let query = `
      SELECT 
        date,
        total_queries,
        cache_hits,
        cache_misses,
        total_cost,
        saved_cost
      FROM daily_stats
      WHERE date >= ?
    `;

    const params: any[] = [cutoff];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    query += ' ORDER BY date ASC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => {
      const hitRate = row.total_queries > 0 ? (row.cache_hits / row.total_queries) * 100 : 0;
      return {
        timestamp: new Date(row.date).getTime(),
        queries: row.total_queries,
        hits: row.cache_hits,
        misses: row.cache_misses,
        hitRate: Math.round(hitRate * 100) / 100,
        cost: Math.round(row.total_cost * 100) / 100,
        savedCost: Math.round(row.saved_cost * 100) / 100,
      };
    });
  }

  /**
   * Get top query patterns
   */
  getTopPatterns(tenantId?: string, limit: number = 10): QueryPattern[] {
    let query = `
      SELECT 
        pattern,
        count,
        total_similarity,
        total_hits,
        example_queries
      FROM query_patterns
    `;

    const params: any[] = [];

    if (tenantId) {
      query += ' WHERE tenant_id = ?';
      params.push(tenantId);
    }

    query += ' ORDER BY count DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => {
      const avgSimilarity = row.count > 0 ? row.total_similarity / row.count : 0;
      const hitRate = row.count > 0 ? (row.total_hits / row.count) * 100 : 0;
      const exampleQueries = JSON.parse(row.example_queries || '[]');

      return {
        pattern: row.pattern,
        count: row.count,
        avgSimilarity: Math.round(avgSimilarity * 100) / 100,
        hitRate: Math.round(hitRate * 100) / 100,
        exampleQueries,
      };
    });
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(tenantId?: string, days: number = 7): PerformanceMetrics {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTimestamp = cutoffDate.getTime();

    let query = `
      SELECT 
        response_time_ms
      FROM query_log
      WHERE timestamp >= ?
    `;

    const params: any[] = [cutoffTimestamp];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    query += ' ORDER BY response_time_ms ASC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    if (rows.length === 0) {
      return {
        avgResponseTime: 0,
        p50ResponseTime: 0,
        p95ResponseTime: 0,
        p99ResponseTime: 0,
        totalRequests: 0,
        errorsCount: 0,
        errorRate: 0,
      };
    }

    const times = rows.map(r => r.response_time_ms);
    const sum = times.reduce((a, b) => a + b, 0);
    const avg = sum / times.length;

    const p50 = times[Math.floor(times.length * 0.50)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const p99 = times[Math.floor(times.length * 0.99)];

    return {
      avgResponseTime: Math.round(avg * 100) / 100,
      p50ResponseTime: p50,
      p95ResponseTime: p95,
      p99ResponseTime: p99,
      totalRequests: times.length,
      errorsCount: 0, // TODO: Track errors
      errorRate: 0,
    };
  }

  /**
   * Export analytics data (CSV format)
   */
  exportCSV(tenantId?: string, days: number = 30): string {
    const timeSeries = this.getTimeSeries(tenantId, days);
    
    let csv = 'Date,Queries,Cache Hits,Cache Misses,Hit Rate %,Cost,Saved Cost\n';
    
    for (const data of timeSeries) {
      const date = new Date(data.timestamp).toISOString().split('T')[0];
      csv += `${date},${data.queries},${data.hits},${data.misses},${data.hitRate},${data.cost},${data.savedCost}\n`;
    }

    return csv;
  }

  /**
   * Export analytics data (JSON format)
   */
  exportJSON(tenantId?: string, days: number = 30): string {
    const costSavings = this.getCostSavings(tenantId, days);
    const timeSeries = this.getTimeSeries(tenantId, days);
    const patterns = this.getTopPatterns(tenantId, 20);
    const performance = this.getPerformanceMetrics(tenantId, days);

    const data = {
      exportDate: new Date().toISOString(),
      tenantId: tenantId || 'all',
      period: { days },
      costSavings,
      timeSeries,
      topPatterns: patterns,
      performance,
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Clear old data (for cleanup)
   */
  clearOldData(daysToKeep: number = 90): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffTimestamp = cutoffDate.getTime();
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

    this.db.transaction(() => {
      this.db.prepare('DELETE FROM query_log WHERE timestamp < ?').run(cutoffTimestamp);
      this.db.prepare('DELETE FROM daily_stats WHERE date < ?').run(cutoffDateStr);
      this.db.prepare('DELETE FROM query_patterns WHERE last_seen < ?').run(cutoffTimestamp);
    })();
  }

  /**
   * Get comprehensive dashboard data
   */
  getDashboard(tenantId?: string, days: number = 30): {
    costSavings: CostSavings;
    timeSeries: TimeSeriesData[];
    topPatterns: QueryPattern[];
    performance: PerformanceMetrics;
  } {
    return {
      costSavings: this.getCostSavings(tenantId, days),
      timeSeries: this.getTimeSeries(tenantId, days),
      topPatterns: this.getTopPatterns(tenantId, 10),
      performance: this.getPerformanceMetrics(tenantId, 7),
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
