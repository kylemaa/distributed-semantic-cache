/**
 * Optimization Pipeline
 * 
 * Orchestrates all injectable optimizations in order of priority.
 * Allows A/B testing by enabling/disabling individual optimizations.
 */

import type {
  CacheOptimization,
  OptimizationContext,
  OptimizationResult,
  OptimizationConfig,
  OptimizationStats,
  ScoredCandidate,
  DEFAULT_OPTIMIZATION_CONFIG,
} from './types.js';
import { QueryExpansionOptimization } from './query-expansion.js';
import { NegativeMiningOptimization } from './negative-mining.js';
import { ContextualRerankingOptimization } from './contextual-reranking.js';
import { BloomFilterOptimization } from './bloom-filter.js';

export interface PipelineStats {
  optimizations: OptimizationStats[];
  totalPreSearchLatencyMs: number;
  totalPostSearchLatencyMs: number;
  totalInvocations: number;
}

export class OptimizationPipeline {
  private optimizations: CacheOptimization[] = [];
  private preSearchLatencyMs = 0;
  private postSearchLatencyMs = 0;
  private invocations = 0;

  /**
   * Create pipeline with default optimizations based on config
   */
  static createDefault(config?: Partial<OptimizationConfig>): OptimizationPipeline {
    const pipeline = new OptimizationPipeline();
    
    // Register all optimizations, respecting config
    const bloomFilter = new BloomFilterOptimization();
    bloomFilter.enabled = config?.bloomFilter ?? true;
    pipeline.register(bloomFilter);

    const queryExpansion = new QueryExpansionOptimization();
    queryExpansion.enabled = config?.queryExpansion ?? true;
    pipeline.register(queryExpansion);

    const negativeMining = new NegativeMiningOptimization();
    negativeMining.enabled = config?.negativeMining ?? true;
    pipeline.register(negativeMining);

    const contextualReranking = new ContextualRerankingOptimization();
    contextualReranking.enabled = config?.contextualReranking ?? true;
    pipeline.register(contextualReranking);

    return pipeline;
  }

  /**
   * Create an empty pipeline (no optimizations)
   */
  static createEmpty(): OptimizationPipeline {
    return new OptimizationPipeline();
  }

  /**
   * Register an optimization
   */
  register(optimization: CacheOptimization): void {
    this.optimizations.push(optimization);
    // Sort by priority (lower = runs first)
    this.optimizations.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get an optimization by name
   */
  get<T extends CacheOptimization>(name: string): T | undefined {
    return this.optimizations.find(o => o.name === name) as T | undefined;
  }

  /**
   * Enable/disable an optimization by name
   */
  setEnabled(name: string, enabled: boolean): boolean {
    const opt = this.optimizations.find(o => o.name === name);
    if (opt) {
      opt.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Enable/disable all optimizations
   */
  setAllEnabled(enabled: boolean): void {
    for (const opt of this.optimizations) {
      opt.enabled = enabled;
    }
  }

  /**
   * Run all pre-search optimizations
   * Returns combined result that may include:
   * - Expanded embeddings to search with
   * - Whether to skip search entirely
   * - Filter functions for candidates
   */
  async runPreSearch(context: OptimizationContext): Promise<OptimizationResult> {
    const start = performance.now();
    this.invocations++;

    const combinedResult: OptimizationResult = {};

    for (const opt of this.optimizations) {
      if (!opt.enabled || !opt.preSearch) continue;

      try {
        const result = await opt.preSearch(context);

        // Combine results
        if (result.expandedEmbeddings) {
          combinedResult.expandedEmbeddings = [
            ...(combinedResult.expandedEmbeddings || []),
            ...result.expandedEmbeddings,
          ];
        }

        if (result.definitelyNotInCache) {
          // Short-circuit: skip vector search entirely
          combinedResult.definitelyNotInCache = true;
          break;
        }

        if (result.shouldReject) {
          // Combine rejection functions
          const existingReject = combinedResult.shouldReject;
          combinedResult.shouldReject = existingReject
            ? (candidate: ScoredCandidate) => 
                existingReject(candidate) || result.shouldReject!(candidate)
            : result.shouldReject;
        }

        if (result.rerank) {
          // Chain reranking functions
          const existingRerank = combinedResult.rerank;
          combinedResult.rerank = existingRerank
            ? (candidates: ScoredCandidate[]) => 
                result.rerank!(existingRerank(candidates))
            : result.rerank;
        }
      } catch (error) {
        console.warn(`Optimization ${opt.name} pre-search failed:`, error);
        // Continue with other optimizations
      }
    }

    this.preSearchLatencyMs += performance.now() - start;
    return combinedResult;
  }

  /**
   * Run all post-search optimizations (filtering and reranking)
   */
  async runPostSearch(
    context: OptimizationContext,
    candidates: ScoredCandidate[]
  ): Promise<ScoredCandidate[]> {
    const start = performance.now();
    let result = candidates;

    for (const opt of this.optimizations) {
      if (!opt.enabled || !opt.postSearch) continue;

      try {
        result = await opt.postSearch(context, result);
      } catch (error) {
        console.warn(`Optimization ${opt.name} post-search failed:`, error);
        // Continue with other optimizations
      }
    }

    this.postSearchLatencyMs += performance.now() - start;
    return result;
  }

  /**
   * Record feedback for learning optimizations
   */
  recordFeedback(wasHelpful: boolean, context: OptimizationContext): void {
    for (const opt of this.optimizations) {
      if (opt.enabled && opt.recordFeedback) {
        try {
          opt.recordFeedback(wasHelpful, context);
        } catch (error) {
          console.warn(`Optimization ${opt.name} feedback recording failed:`, error);
        }
      }
    }
  }

  /**
   * Get stats for all optimizations
   */
  getStats(): PipelineStats {
    return {
      optimizations: this.optimizations.map(o => o.getStats()),
      totalPreSearchLatencyMs: this.preSearchLatencyMs,
      totalPostSearchLatencyMs: this.postSearchLatencyMs,
      totalInvocations: this.invocations,
    };
  }

  /**
   * Get a summary string for logging/debugging
   */
  getSummary(): string {
    const stats = this.getStats();
    const lines = [
      `Optimization Pipeline (${this.invocations} invocations)`,
      `  Total latency: ${(this.preSearchLatencyMs + this.postSearchLatencyMs).toFixed(2)}ms`,
      `  Optimizations:`,
    ];

    for (const opt of stats.optimizations) {
      const status = opt.enabled ? '✓' : '✗';
      lines.push(
        `    ${status} ${opt.name}: ${opt.invocations} invocations, ` +
        `${opt.improvements} improvements, ${opt.avgLatencyMs.toFixed(2)}ms avg`
      );
    }

    return lines.join('\n');
  }

  /**
   * Reset all optimization statistics
   */
  reset(): void {
    this.preSearchLatencyMs = 0;
    this.postSearchLatencyMs = 0;
    this.invocations = 0;
    for (const opt of this.optimizations) {
      opt.reset();
    }
  }
}

/**
 * A/B Testing Helper
 * 
 * Creates two pipelines for comparison testing
 */
export class ABTestRunner {
  private pipelineA: OptimizationPipeline;
  private pipelineB: OptimizationPipeline;
  private useA = true;  // Current active pipeline

  constructor(
    pipelineA: OptimizationPipeline,
    pipelineB: OptimizationPipeline
  ) {
    this.pipelineA = pipelineA;
    this.pipelineB = pipelineB;
  }

  /**
   * Create A/B test with specific optimization enabled/disabled
   */
  static forOptimization(
    optimizationName: string,
    baseConfig?: Partial<OptimizationConfig>
  ): ABTestRunner {
    // Pipeline A: optimization enabled
    const pipelineA = OptimizationPipeline.createDefault({
      ...baseConfig,
      [optimizationName]: true,
    });

    // Pipeline B: optimization disabled
    const pipelineB = OptimizationPipeline.createDefault({
      ...baseConfig,
      [optimizationName]: false,
    });

    return new ABTestRunner(pipelineA, pipelineB);
  }

  /**
   * Get current active pipeline
   */
  get current(): OptimizationPipeline {
    return this.useA ? this.pipelineA : this.pipelineB;
  }

  /**
   * Alternate between pipelines (call per request)
   */
  alternate(): OptimizationPipeline {
    this.useA = !this.useA;
    return this.current;
  }

  /**
   * Get comparison stats
   */
  getComparison(): {
    pipelineA: PipelineStats;
    pipelineB: PipelineStats;
    summary: string;
  } {
    const statsA = this.pipelineA.getStats();
    const statsB = this.pipelineB.getStats();

    const summary = this.generateComparisonSummary(statsA, statsB);

    return { pipelineA: statsA, pipelineB: statsB, summary };
  }

  private generateComparisonSummary(a: PipelineStats, b: PipelineStats): string {
    const lines = ['A/B Test Results:'];
    
    // Compare latencies
    const latencyA = a.totalPreSearchLatencyMs + a.totalPostSearchLatencyMs;
    const latencyB = b.totalPreSearchLatencyMs + b.totalPostSearchLatencyMs;
    const latencyDiff = ((latencyA - latencyB) / latencyB * 100).toFixed(1);
    lines.push(`Latency: A=${latencyA.toFixed(2)}ms, B=${latencyB.toFixed(2)}ms (${latencyDiff}%)`);

    // Compare improvements per optimization
    for (const optA of a.optimizations) {
      const optB = b.optimizations.find(o => o.name === optA.name);
      if (optB && optA.enabled !== optB.enabled) {
        lines.push(`${optA.name}: A=${optA.enabled ? 'ON' : 'OFF'}, B=${optB.enabled ? 'ON' : 'OFF'}`);
        lines.push(`  Improvements: A=${optA.improvements}, B=${optB.improvements}`);
      }
    }

    return lines.join('\n');
  }
}
