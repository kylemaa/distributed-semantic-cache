/**
 * Predictive Cache Warming - ENTERPRISE FEATURE
 * 
 * Copyright (c) 2025 Distributed Semantic Cache POC
 * This file is subject to Enterprise License terms.
 * Commercial license required for production use.
 * 30-day evaluation period available.
 * 
 * Proactively populates cache based on query pattern analysis,
 * temporal patterns, and predictive algorithms.
 * 
 * Note: Advanced prediction algorithms, temporal pattern detection,
 * and multi-factor scoring are proprietary. This version provides
 * a working implementation for evaluation purposes.
 */

import { QueryClusterer, QueryPattern } from './query-clusterer.js';

export interface WarmingConfig {
  enabled: boolean;
  maxWarmingBatch: number;      // Maximum queries to warm at once
  minPatternFrequency: number;  // Minimum pattern frequency to consider
  warmingInterval: number;      // Interval between warming cycles (ms)
  timeWindow: number;           // Time window for pattern analysis (hours)
  confidenceThreshold: number;  // Minimum confidence to trigger warming
}

export interface WarmingCandidate {
  query: string;
  pattern: string;
  confidence: number;
  predictedDemand: number;
  reason: string;
}

export interface WarmingStats {
  totalWarmed: number;
  successfulWarms: number;
  failedWarms: number;
  lastWarmingTime: number | null;
  avgWarmingLatency: number;
  patternsAnalyzed: number;
}

export interface TemporalPattern {
  hour: number;
  dayOfWeek: number;
  frequency: number;
  avgQueries: number;
}

const DEFAULT_CONFIG: WarmingConfig = {
  enabled: true,
  maxWarmingBatch: 20,
  minPatternFrequency: 5,
  warmingInterval: 300000, // 5 minutes
  timeWindow: 24,
  confidenceThreshold: 0.7,
};

/**
 * Predictive Cache Warmer
 * 
 * Analyzes query patterns and proactively warms cache
 * to improve hit rates during expected demand spikes.
 */
export class PredictiveCacheWarmer {
  private config: WarmingConfig;
  private clusterer: QueryClusterer;
  private queryHistory: QueryHistoryEntry[];
  private temporalPatterns: Map<string, TemporalPattern>;
  private stats: WarmingStats;
  private warmingCallback: ((queries: string[]) => Promise<void>) | null;
  private warmingInterval: NodeJS.Timeout | null;

  constructor(
    clusterer: QueryClusterer,
    config?: Partial<WarmingConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.clusterer = clusterer;
    this.queryHistory = [];
    this.temporalPatterns = new Map();
    this.warmingInterval = null;
    this.warmingCallback = null;
    this.stats = {
      totalWarmed: 0,
      successfulWarms: 0,
      failedWarms: 0,
      lastWarmingTime: null,
      avgWarmingLatency: 0,
      patternsAnalyzed: 0,
    };
  }

  /**
   * Record a query for pattern analysis
   */
  recordQuery(query: string, wasHit: boolean): void {
    const now = new Date();
    this.queryHistory.push({
      query,
      timestamp: now.getTime(),
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
      wasHit,
    });

    // Update temporal patterns
    const key = `${now.getHours()}-${now.getDay()}`;
    const existing = this.temporalPatterns.get(key);
    if (existing) {
      existing.frequency++;
      existing.avgQueries = (existing.avgQueries + 1) / 2;
    } else {
      this.temporalPatterns.set(key, {
        hour: now.getHours(),
        dayOfWeek: now.getDay(),
        frequency: 1,
        avgQueries: 1,
      });
    }

    // Prune old history (keep last timeWindow hours)
    const cutoff = Date.now() - (this.config.timeWindow * 60 * 60 * 1000);
    this.queryHistory = this.queryHistory.filter(h => h.timestamp > cutoff);
  }

  /**
   * Get candidates for cache warming
   * 
   * Note: Enterprise version uses advanced multi-factor scoring
   * including user behavior prediction, content similarity analysis,
   * and temporal demand forecasting. This version provides basic
   * pattern-based prediction.
   */
  getWarmingCandidates(): WarmingCandidate[] {
    const candidates: WarmingCandidate[] = [];
    const patterns = this.clusterer.getPopularPatterns(20);
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    for (const pattern of patterns) {
      if (pattern.frequency < this.config.minPatternFrequency) continue;

      // Basic temporal scoring (simplified public version)
      // Enterprise version uses ML-based demand forecasting
      const temporalScore = this.calculateTemporalScore(currentHour, currentDay);
      
      // Pattern frequency score
      const frequencyScore = Math.min(1, pattern.frequency / 50);
      
      // Recency score (when was pattern last seen)
      const recencyScore = this.calculateRecencyScore(pattern.lastSeen);
      
      // Combined confidence (simplified weighted average)
      // Enterprise version uses proprietary multi-factor optimization
      const confidence = (
        temporalScore * 0.3 +
        frequencyScore * 0.4 +
        recencyScore * 0.3
      );

      if (confidence >= this.config.confidenceThreshold) {
        // Generate representative queries from pattern
        const representativeQueries = this.generateRepresentativeQueries(pattern);
        
        for (const query of representativeQueries) {
          candidates.push({
            query,
            pattern: pattern.id,
            confidence,
            predictedDemand: pattern.frequency * temporalScore,
            reason: this.generateReason(temporalScore, frequencyScore, recencyScore),
          });
        }
      }
    }

    // Sort by confidence and limit
    candidates.sort((a, b) => b.confidence - a.confidence);
    this.stats.patternsAnalyzed = patterns.length;

    return candidates.slice(0, this.config.maxWarmingBatch);
  }

  /**
   * Calculate temporal relevance score (simplified public version)
   * 
   * Note: Enterprise version includes day-of-week patterns,
   * holiday awareness, and ML-based time series forecasting.
   */
  private calculateTemporalScore(hour: number, dayOfWeek: number): number {
    const key = `${hour}-${dayOfWeek}`;
    const pattern = this.temporalPatterns.get(key);
    
    if (!pattern) {
      // No data for this time slot, use default
      return 0.5;
    }

    // Simple frequency-based score
    const maxFrequency = Math.max(
      ...Array.from(this.temporalPatterns.values()).map(p => p.frequency)
    );
    
    return pattern.frequency / Math.max(1, maxFrequency);
  }

  /**
   * Calculate recency score
   */
  private calculateRecencyScore(lastSeen: number): number {
    const hoursSinceSeen = (Date.now() - lastSeen) / (1000 * 60 * 60);
    
    if (hoursSinceSeen < 1) return 1.0;
    if (hoursSinceSeen < 6) return 0.8;
    if (hoursSinceSeen < 24) return 0.6;
    if (hoursSinceSeen < 72) return 0.4;
    return 0.2;
  }

  /**
   * Generate representative queries from a pattern (simplified)
   * 
   * Note: Enterprise version uses semantic expansion, synonym
   * generation, and LLM-based query reformulation.
   */
  private generateRepresentativeQueries(pattern: QueryPattern): string[] {
    // Return recent queries from the pattern
    return pattern.queries.slice(-3);
  }

  /**
   * Generate human-readable reason for warming decision
   */
  private generateReason(
    temporal: number,
    frequency: number,
    recency: number
  ): string {
    const factors: string[] = [];
    
    if (temporal > 0.7) factors.push('high demand expected at this time');
    if (frequency > 0.7) factors.push('frequently requested pattern');
    if (recency > 0.7) factors.push('recently active pattern');
    
    if (factors.length === 0) {
      return 'moderate predicted demand';
    }
    
    return factors.join(', ');
  }

  /**
   * Set callback for warming execution
   */
  setWarmingCallback(callback: (queries: string[]) => Promise<void>): void {
    this.warmingCallback = callback;
  }

  /**
   * Execute cache warming cycle
   */
  async executeWarming(): Promise<WarmingResult> {
    if (!this.warmingCallback) {
      return {
        success: false,
        queriesWarmed: 0,
        error: 'No warming callback configured',
      };
    }

    const startTime = Date.now();
    const candidates = this.getWarmingCandidates();

    if (candidates.length === 0) {
      return {
        success: true,
        queriesWarmed: 0,
        message: 'No candidates met warming threshold',
      };
    }

    const queries = candidates.map(c => c.query);

    try {
      await this.warmingCallback(queries);
      
      const latency = Date.now() - startTime;
      this.stats.totalWarmed += queries.length;
      this.stats.successfulWarms++;
      this.stats.lastWarmingTime = Date.now();
      this.stats.avgWarmingLatency = 
        (this.stats.avgWarmingLatency * (this.stats.successfulWarms - 1) + latency) /
        this.stats.successfulWarms;

      return {
        success: true,
        queriesWarmed: queries.length,
        candidates,
        latencyMs: latency,
      };
    } catch (error) {
      this.stats.failedWarms++;
      return {
        success: false,
        queriesWarmed: 0,
        error: String(error),
      };
    }
  }

  /**
   * Start automatic warming cycles
   */
  startAutoWarming(): void {
    if (!this.config.enabled) return;
    if (this.warmingInterval) return;

    this.warmingInterval = setInterval(
      () => this.executeWarming(),
      this.config.warmingInterval
    );

    console.log(`[CacheWarmer] Auto-warming started (interval: ${this.config.warmingInterval}ms)`);
  }

  /**
   * Stop automatic warming cycles
   */
  stopAutoWarming(): void {
    if (this.warmingInterval) {
      clearInterval(this.warmingInterval);
      this.warmingInterval = null;
      console.log('[CacheWarmer] Auto-warming stopped');
    }
  }

  /**
   * Get warming statistics
   */
  getStats(): WarmingStats {
    return { ...this.stats };
  }

  /**
   * Get temporal pattern summary
   */
  getTemporalPatterns(): TemporalPattern[] {
    return Array.from(this.temporalPatterns.values())
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Predict demand for a specific time
   */
  predictDemand(hour: number, dayOfWeek: number): DemandPrediction {
    const key = `${hour}-${dayOfWeek}`;
    const pattern = this.temporalPatterns.get(key);
    
    if (!pattern) {
      return {
        hour,
        dayOfWeek,
        expectedQueries: 0,
        confidence: 0,
        recommendation: 'insufficient_data',
      };
    }

    const maxFrequency = Math.max(
      ...Array.from(this.temporalPatterns.values()).map(p => p.frequency)
    );

    const relativeLevel = pattern.frequency / maxFrequency;
    
    return {
      hour,
      dayOfWeek,
      expectedQueries: pattern.avgQueries,
      confidence: Math.min(1, pattern.frequency / 10),
      recommendation: relativeLevel > 0.7 ? 'warm_cache' : 
                     relativeLevel > 0.3 ? 'monitor' : 'normal',
    };
  }

  /**
   * Reset all data
   */
  reset(): void {
    this.queryHistory = [];
    this.temporalPatterns.clear();
    this.stats = {
      totalWarmed: 0,
      successfulWarms: 0,
      failedWarms: 0,
      lastWarmingTime: null,
      avgWarmingLatency: 0,
      patternsAnalyzed: 0,
    };
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.stopAutoWarming();
    this.reset();
  }
}

interface QueryHistoryEntry {
  query: string;
  timestamp: number;
  hour: number;
  dayOfWeek: number;
  wasHit: boolean;
}

export interface WarmingResult {
  success: boolean;
  queriesWarmed: number;
  candidates?: WarmingCandidate[];
  latencyMs?: number;
  message?: string;
  error?: string;
}

export interface DemandPrediction {
  hour: number;
  dayOfWeek: number;
  expectedQueries: number;
  confidence: number;
  recommendation: 'warm_cache' | 'monitor' | 'normal' | 'insufficient_data';
}

/**
 * Create predictive cache warmer instance
 */
export function createPredictiveCacheWarmer(
  clusterer: QueryClusterer,
  config?: Partial<WarmingConfig>
): PredictiveCacheWarmer {
  return new PredictiveCacheWarmer(clusterer, config);
}
