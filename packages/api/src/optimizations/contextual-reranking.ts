/**
 * Contextual Reranking Optimization
 * 
 * Uses the user's recent query history to rerank candidates,
 * preferring results that fit the conversation context.
 * 
 * Paper basis: Contextualized query embeddings, session-aware retrieval
 */

import type {
  CacheOptimization,
  OptimizationContext,
  OptimizationResult,
  OptimizationStats,
  ScoredCandidate,
} from './types.js';

export class ContextualRerankingOptimization implements CacheOptimization {
  readonly name = 'contextual-reranking';
  readonly priority = 30;  // Run late, after filtering
  enabled = true;

  private contextWeight = 0.3;  // How much context affects ranking (0-1)
  private minCandidates = 3;    // Only rerank if we have at least this many

  private stats = {
    invocations: 0,
    improvements: 0,  // Times reranking changed the top result
    totalLatencyMs: 0,
  };

  constructor(options?: { contextWeight?: number; minCandidates?: number }) {
    if (options?.contextWeight !== undefined) this.contextWeight = options.contextWeight;
    if (options?.minCandidates !== undefined) this.minCandidates = options.minCandidates;
  }

  async postSearch(
    context: OptimizationContext,
    candidates: ScoredCandidate[]
  ): Promise<ScoredCandidate[]> {
    const start = performance.now();
    this.stats.invocations++;

    // Need context and enough candidates to rerank
    if (!context.recentEmbeddings || context.recentEmbeddings.length === 0) {
      return candidates;
    }

    if (candidates.length < this.minCandidates) {
      return candidates;
    }

    // Compute context embedding (average of recent queries)
    const contextEmbedding = this.averageVectors(context.recentEmbeddings);

    // Store original top result
    const originalTopId = candidates[0]?.id;

    // Compute combined scores
    const scoredCandidates = candidates.map(candidate => {
      const contextFit = this.cosineSimilarity(candidate.embedding, contextEmbedding);
      const combinedScore = 
        candidate.similarity * (1 - this.contextWeight) +
        contextFit * this.contextWeight;
      
      return {
        ...candidate,
        originalSimilarity: candidate.similarity,
        contextFit,
        similarity: combinedScore,  // Replace with combined score
      };
    });

    // Sort by combined score
    scoredCandidates.sort((a, b) => b.similarity - a.similarity);

    // Check if reranking changed the top result
    if (scoredCandidates[0]?.id !== originalTopId) {
      this.stats.improvements++;
    }

    this.stats.totalLatencyMs += performance.now() - start;

    return scoredCandidates;
  }

  recordFeedback(wasHelpful: boolean): void {
    // Could adjust contextWeight based on feedback
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

  reset(): void {
    this.stats = { invocations: 0, improvements: 0, totalLatencyMs: 0 };
  }

  // --- Private helpers ---

  private averageVectors(vectors: number[][]): number[] {
    if (vectors.length === 0) return [];
    const dim = vectors[0].length;
    const result = new Array(dim).fill(0);

    for (const vec of vectors) {
      for (let i = 0; i < dim; i++) {
        result[i] += vec[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      result[i] /= vectors.length;
    }

    return result;
  }

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
