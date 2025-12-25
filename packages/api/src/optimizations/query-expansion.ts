/**
 * Query Expansion Optimization
 * 
 * Expands the query embedding using vector arithmetic to find more matches.
 * Uses pre-computed concept vectors to generate query variants.
 * 
 * Paper basis: "king - man + woman = queen" from Word2Vec (Mikolov et al., 2013)
 */

import type { 
  CacheOptimization, 
  OptimizationContext, 
  OptimizationResult, 
  OptimizationStats 
} from './types.js';

interface ConceptVector {
  name: string;
  vector: number[];
  operation: 'add' | 'subtract';
  weight: number;
}

export class QueryExpansionOptimization implements CacheOptimization {
  readonly name = 'query-expansion';
  readonly priority = 100;  // Run early
  enabled = true;
  
  private conceptVectors: ConceptVector[] = [];
  private stats = {
    invocations: 0,
    improvements: 0,
    totalLatencyMs: 0,
  };

  constructor(private maxExpansions: number = 3) {}

  /**
   * Initialize concept vectors from a set of sample queries
   * Call this after you have some cached embeddings
   */
  initializeConceptVectors(concepts: { name: string; sampleTexts: string[]; embeddings: number[][] }[]) {
    this.conceptVectors = concepts.map(concept => ({
      name: concept.name,
      // Average the embeddings for this concept
      vector: this.averageVectors(concept.embeddings),
      operation: 'add',
      weight: 0.3,  // Don't overpower the original query
    }));
  }

  /**
   * Add a custom concept vector
   */
  addConceptVector(name: string, vector: number[], operation: 'add' | 'subtract' = 'add', weight = 0.3) {
    this.conceptVectors.push({ name, vector, operation, weight });
  }

  async preSearch(context: OptimizationContext): Promise<OptimizationResult> {
    const start = performance.now();
    this.stats.invocations++;

    if (this.conceptVectors.length === 0) {
      return {};  // No concepts initialized yet
    }

    const expandedEmbeddings: number[][] = [context.queryEmbedding];  // Original first

    // Generate variants by applying concept vectors
    for (const concept of this.conceptVectors.slice(0, this.maxExpansions - 1)) {
      const variant = this.applyConceptVector(
        context.queryEmbedding,
        concept.vector,
        concept.operation,
        concept.weight
      );
      expandedEmbeddings.push(variant);
    }

    this.stats.totalLatencyMs += performance.now() - start;

    return { expandedEmbeddings };
  }

  recordFeedback(wasHelpful: boolean): void {
    if (wasHelpful) {
      this.stats.improvements++;
    }
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

  private applyConceptVector(
    query: number[],
    concept: number[],
    operation: 'add' | 'subtract',
    weight: number
  ): number[] {
    const result = new Array(query.length);
    
    for (let i = 0; i < query.length; i++) {
      if (operation === 'add') {
        result[i] = query[i] + concept[i] * weight;
      } else {
        result[i] = query[i] - concept[i] * weight;
      }
    }
    
    // Normalize to unit length
    const magnitude = Math.sqrt(result.reduce((sum, v) => sum + v * v, 0));
    for (let i = 0; i < result.length; i++) {
      result[i] /= magnitude;
    }
    
    return result;
  }
}
