/**
 * Optimizations Module
 * 
 * Injectable optimization system for A/B testing cache improvements.
 * Each optimization can be enabled/disabled independently.
 */

// Types
export type {
  CacheOptimization,
  OptimizationContext,
  OptimizationResult,
  OptimizationStats,
  OptimizationConfig,
  ScoredCandidate,
} from './types.js';

export { DEFAULT_OPTIMIZATION_CONFIG } from './types.js';

// Individual Optimizations
export { QueryExpansionOptimization } from './query-expansion.js';
export { NegativeMiningOptimization } from './negative-mining.js';
export { ContextualRerankingOptimization } from './contextual-reranking.js';
export { BloomFilterOptimization } from './bloom-filter.js';

// Pipeline & Testing
export { OptimizationPipeline, ABTestRunner } from './optimization-pipeline.js';
export type { PipelineStats } from './optimization-pipeline.js';
