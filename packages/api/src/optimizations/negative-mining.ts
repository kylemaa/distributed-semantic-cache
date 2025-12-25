/**
 * Negative Example Mining Optimization
 * 
 * Learns from implicit negative feedback (user rephrases after cache hit)
 * to avoid returning the same "bad" answers for similar queries.
 * 
 * Paper basis: Hard negative mining in metric learning
 */

import type {
  CacheOptimization,
  OptimizationContext,
  OptimizationResult,
  OptimizationStats,
  ScoredCandidate,
} from './types.js';

interface NegativeExample {
  queryEmbedding: number[];
  rejectedAnswerId: string;
  rejectedAnswerEmbedding: number[];
  timestamp: number;
  count: number;  // How many times this was rejected
}

export class NegativeMiningOptimization implements CacheOptimization {
  readonly name = 'negative-mining';
  readonly priority = 50;  // Run after expansion, before reranking
  enabled = true;

  private negativeExamples: NegativeExample[] = [];
  private maxExamples = 1000;
  private similarityThreshold = 0.85;  // Query similarity to trigger rejection check
  private rejectionThreshold = 0.90;   // Answer similarity to trigger rejection

  private stats = {
    invocations: 0,
    improvements: 0,  // Times we rejected a bad candidate
    totalLatencyMs: 0,
  };

  constructor(options?: { maxExamples?: number; similarityThreshold?: number; rejectionThreshold?: number }) {
    if (options?.maxExamples) this.maxExamples = options.maxExamples;
    if (options?.similarityThreshold) this.similarityThreshold = options.similarityThreshold;
    if (options?.rejectionThreshold) this.rejectionThreshold = options.rejectionThreshold;
  }

  /**
   * Record a negative example (user rephrased after getting a cached response)
   */
  recordNegative(
    originalQueryEmbedding: number[],
    rejectedAnswerId: string,
    rejectedAnswerEmbedding: number[]
  ): void {
    // Check if we already have this pair
    const existing = this.negativeExamples.find(
      ex => ex.rejectedAnswerId === rejectedAnswerId &&
            this.cosineSimilarity(ex.queryEmbedding, originalQueryEmbedding) > 0.95
    );

    if (existing) {
      existing.count++;
      existing.timestamp = Date.now();
    } else {
      this.negativeExamples.push({
        queryEmbedding: originalQueryEmbedding,
        rejectedAnswerId,
        rejectedAnswerEmbedding,
        timestamp: Date.now(),
        count: 1,
      });

      // Prune old examples if needed
      if (this.negativeExamples.length > this.maxExamples) {
        // Remove oldest, least-used examples
        this.negativeExamples.sort((a, b) => b.count - a.count || b.timestamp - a.timestamp);
        this.negativeExamples = this.negativeExamples.slice(0, this.maxExamples);
      }
    }
  }

  async preSearch(context: OptimizationContext): Promise<OptimizationResult> {
    const start = performance.now();
    this.stats.invocations++;

    // Build rejection function based on negative examples
    const shouldReject = (candidate: ScoredCandidate): boolean => {
      for (const neg of this.negativeExamples) {
        // Is this query similar to a query that had a rejected answer?
        const querySimilarity = this.cosineSimilarity(context.queryEmbedding, neg.queryEmbedding);
        
        if (querySimilarity > this.similarityThreshold) {
          // Is this candidate similar to the rejected answer?
          const answerSimilarity = this.cosineSimilarity(candidate.embedding, neg.rejectedAnswerEmbedding);
          
          if (answerSimilarity > this.rejectionThreshold || candidate.id === neg.rejectedAnswerId) {
            this.stats.improvements++;
            return true;  // Reject this candidate
          }
        }
      }
      return false;
    };

    this.stats.totalLatencyMs += performance.now() - start;

    return { shouldReject };
  }

  async postSearch(
    context: OptimizationContext,
    candidates: ScoredCandidate[]
  ): Promise<ScoredCandidate[]> {
    // Filter out rejected candidates
    const result = await this.preSearch(context);
    if (!result.shouldReject) return candidates;

    return candidates.filter(c => !result.shouldReject!(c));
  }

  recordFeedback(wasHelpful: boolean): void {
    // Feedback is recorded via recordNegative() method
  }

  getStats(): OptimizationStats {
    return {
      name: this.name,
      enabled: this.enabled,
      invocations: this.stats.invocations,
      improvements: this.stats.improvements,
      avgLatencyMs: this.stats.invocations > 0
        ? this.stats.totalLatencyMs / this.stats.invocations
        : 0,
    };
  }

  /**
   * Get all negative examples (for debugging/analysis)
   */
  getNegativeExamples(): { count: number; examples: NegativeExample[] } {
    return {
      count: this.negativeExamples.length,
      examples: this.negativeExamples.slice(0, 100),  // Limit for API response
    };
  }

  reset(): void {
    this.negativeExamples = [];
    this.stats = { invocations: 0, improvements: 0, totalLatencyMs: 0 };
  }

  // --- Private helpers ---

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}
