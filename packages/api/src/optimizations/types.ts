/**
 * Optimization System Types
 * 
 * Injectable optimizations for A/B testing and performance comparison.
 * Each optimization can be enabled/disabled independently.
 */

export interface OptimizationContext {
  query: string;
  normalizedQuery?: string;
  queryEmbedding: number[];
  threshold: number;
  recentQueries?: string[];
  recentEmbeddings?: number[][];
  responseId?: string;
}

export interface OptimizationResult {
  /** Modified embeddings to search with (for query expansion) */
  expandedEmbeddings?: number[][];
  /** Should we skip this candidate? (for negative mining) */
  shouldReject?: (candidate: ScoredCandidate) => boolean;
  /** Rerank candidates (for contextual reranking) */
  rerank?: (candidates: ScoredCandidate[]) => ScoredCandidate[];
  /** Skip full search? (for bloom filter) */
  definitelyNotInCache?: boolean;
  /** Adjusted threshold */
  adjustedThreshold?: number;
}

export interface ScoredCandidate {
  id: string;
  query: string;
  embedding: number[];
  similarity: number;
  response: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface OptimizationStats {
  name: string;
  enabled: boolean;
  invocations: number;
  improvements: number;  // Times this optimization helped
  avgLatencyMs: number;
  lastUsed?: number;
  extra?: Record<string, unknown>;
}

/**
 * Base interface for all optimizations
 */
export interface CacheOptimization {
  /** Unique name for this optimization */
  readonly name: string;
  
  /** Whether this optimization is currently enabled */
  enabled: boolean;
  
  /** Priority (higher = runs first) */
  readonly priority: number;
  
  /** Called before search to modify query/embeddings */
  preSearch?(context: OptimizationContext): Promise<OptimizationResult>;
  
  /** Called after candidates are found to filter/rerank */
  postSearch?(
    context: OptimizationContext,
    candidates: ScoredCandidate[]
  ): Promise<ScoredCandidate[]>;
  
  /** Record feedback for learning */
  recordFeedback?(wasHelpful: boolean, context: OptimizationContext): void;
  
  /** Get stats for this optimization */
  getStats(): OptimizationStats;
  
  /** Reset internal state */
  reset(): void;
}

/**
 * Configuration for the optimization pipeline
 */
export interface OptimizationConfig {
  /** Master switch - disable all optimizations */
  enabled: boolean;
  
  /** Individual optimization toggles */
  queryExpansion: boolean;
  negativeMining: boolean;
  contextualReranking: boolean;
  bloomFilter: boolean;
  embeddingQuantization: boolean;
  learnedSimilarity: boolean;
  
  /** Logging/metrics */
  trackMetrics: boolean;
  logDecisions: boolean;
}

export const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  enabled: true,
  queryExpansion: false,
  negativeMining: false,
  contextualReranking: false,
  bloomFilter: false,
  embeddingQuantization: false,  // Already implemented in main system
  learnedSimilarity: false,
  trackMetrics: true,
  logDecisions: false,
};
