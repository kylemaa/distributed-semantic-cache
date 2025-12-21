/**
 * Adaptive threshold learning system - Public Version
 * 
 * This is a simplified version for the open source edition.
 * Tracks query patterns and provides basic threshold recommendations.
 * 
 * Note: Advanced multi-dimensional optimization algorithms are proprietary.
 * This version provides a solid baseline for most use cases.
 */

import { QueryType } from './normalize.js';

export interface ThresholdStats {
  queryType: QueryType;
  averageSuccessThreshold: number;
  successfulMatches: number;
  failedMatches: number;
  totalQueries: number;
  lastUpdated: number;
}

export interface ThresholdLearningConfig {
  enabled: boolean;
  minSamples: number;        // Minimum samples before adapting
  learningRate: number;      // How quickly to adapt (0-1)
  defaultThreshold: number;  // Fallback threshold
}

const DEFAULT_CONFIG: ThresholdLearningConfig = {
  enabled: true,
  minSamples: 10,
  learningRate: 0.1,
  defaultThreshold: 0.85,
};

/**
 * Adaptive threshold manager
 */
export class ThresholdLearner {
  private stats: Map<QueryType, ThresholdStats>;
  private config: ThresholdLearningConfig;

  constructor(config?: Partial<ThresholdLearningConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = new Map();
    
    // Initialize stats for each query type
    for (const type of Object.values(QueryType)) {
      this.stats.set(type, {
        queryType: type,
        averageSuccessThreshold: this.config.defaultThreshold,
        successfulMatches: 0,
        failedMatches: 0,
        totalQueries: 0,
        lastUpdated: Date.now(),
      });
    }
  }

  /**
   * Get recommended threshold for a query type
   */
  getThreshold(queryType: QueryType, queryLength: number = 20): number {
    if (!this.config.enabled) {
      return this.config.defaultThreshold;
    }

    const stats = this.stats.get(queryType);
    if (!stats || stats.totalQueries < this.config.minSamples) {
      // Not enough data, use default with length adjustment
      return this.adjustForLength(this.config.defaultThreshold, queryLength);
    }

    // Use learned threshold
    return this.adjustForLength(stats.averageSuccessThreshold, queryLength);
  }

  /**
   * Adjust threshold based on query length (simplified public version)
   * 
   * Note: Advanced length-based optimization with multiple factors
   * is available in the enterprise version.
   */
  private adjustForLength(baseThreshold: number, queryLength: number): number {
    // Simplified: Basic length adjustment only
    // Enterprise version includes complexity analysis, term density, etc.
    let threshold = baseThreshold;
    
    if (queryLength < 10) {
      threshold = Math.min(0.95, threshold + 0.05);
    } else if (queryLength > 50) {
      threshold = Math.max(0.75, threshold - 0.05);
    }
    
    return threshold;
  }

  /**
   * Record a successful match (simplified public version)
   * 
   * Note: Enterprise version includes cross-query-type learning,
   * contextual adjustments, and multi-factor optimization.
   */
  recordSuccess(queryType: QueryType, similarityScore: number): void {
    if (!this.config.enabled) return;

    const stats = this.stats.get(queryType);
    if (!stats) return;

    stats.successfulMatches++;
    stats.totalQueries++;
    
    // Simple exponential moving average (public version)
    // Enterprise version uses advanced ML-based optimization
    stats.successfulMatches++;
    stats.totalQueries++;
    
    // Update average threshold using exponential moving average
    const alpha = this.config.learningRate;
    stats.averageSuccessThreshold = 
      alpha * similarityScore + (1 - alpha) * stats.averageSuccessThreshold;
    
    stats.lastUpdated = Date.now();
    this.stats.set(queryType, stats);
  }

  /**
   * Record a failed match (no hit found)
   */
  recordFailure(queryType: QueryType, attemptedThreshold: number): void {
    if (!this.config.enabled) return;

    const stats = this.stats.get(queryType);
    if (!stats) return;

    stats.failedMatches++;
    stats.totalQueries++;
    
    // If too many failures, slightly lower threshold
    const failureRate = stats.failedMatches / stats.totalQueries;
    if (failureRate > 0.5 && stats.totalQueries >= this.config.minSamples) {
      stats.averageSuccessThreshold = Math.max(0.75, stats.averageSuccessThreshold - 0.02);
    }
    
    stats.lastUpdated = Date.now();
    this.stats.set(queryType, stats);
  }

  /**
   * Get statistics for a query type
   */
  getStats(queryType: QueryType): ThresholdStats | undefined {
    return this.stats.get(queryType);
  }

  /**
   * Get all statistics
   */
  getAllStats(): ThresholdStats[] {
    return Array.from(this.stats.values());
  }

  /**
   * Reset statistics
   */
  reset(): void {
    for (const type of Object.values(QueryType)) {
      this.stats.set(type, {
        queryType: type,
        averageSuccessThreshold: this.config.defaultThreshold,
        successfulMatches: 0,
        failedMatches: 0,
        totalQueries: 0,
        lastUpdated: Date.now(),
      });
    }
  }

  /**
   * Export statistics (for persistence)
   */
  export(): Record<string, ThresholdStats> {
    const exported: Record<string, ThresholdStats> = {};
    for (const [type, stats] of this.stats.entries()) {
      exported[type] = { ...stats };
    }
    return exported;
  }

  /**
   * Import statistics (from persistence)
   */
  import(data: Record<string, ThresholdStats>): void {
    for (const [type, stats] of Object.entries(data)) {
      this.stats.set(type as QueryType, stats);
    }
  }

  /**
   * Get success rate for a query type
   */
  getSuccessRate(queryType: QueryType): number {
    const stats = this.stats.get(queryType);
    if (!stats || stats.totalQueries === 0) return 0;
    return stats.successfulMatches / stats.totalQueries;
  }

  /**
   * Get confidence in learned threshold
   */
  getConfidence(queryType: QueryType): number {
    const stats = this.stats.get(queryType);
    if (!stats) return 0;
    
    // Confidence increases with more samples
    const sampleConfidence = Math.min(1, stats.totalQueries / (this.config.minSamples * 5));
    
    // Confidence increases with success rate
    const successConfidence = this.getSuccessRate(queryType);
    
    return (sampleConfidence + successConfidence) / 2;
  }
}
