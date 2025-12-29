/**
 * In-Memory Vector Store
 * 
 * Simple vector store implementation using a Map.
 * Uses brute-force search - suitable for small to medium datasets.
 */

import type {
  IVectorStore,
  VectorSearchResult,
} from './interfaces.js';

/**
 * In-Memory Vector Store Wrapper
 * 
 * For use when no external vector database is available.
 * Uses cosine similarity for vector matching.
 */
export class InMemoryVectorStore implements IVectorStore {
  private vectors: Map<string, { vector: number[]; metadata?: Record<string, any> }>;
  private dimension: number;

  constructor(dimension: number = 384) {
    this.dimension = dimension;
    this.vectors = new Map();
  }

  async initialize(): Promise<void> {
    // Nothing to initialize for in-memory store
  }

  async addVector(id: string, vector: number[], metadata?: Record<string, any>): Promise<void> {
    this.vectors.set(id, { vector, metadata });
  }

  async search(query: number[], k: number, threshold?: number): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];
    const minSimilarity = threshold || 0.7;

    // Brute-force search (for small datasets)
    for (const [id, { vector }] of this.vectors) {
      const similarity = this.cosineSimilarity(query, vector);
      if (similarity >= minSimilarity) {
        results.push({ id, similarity });
      }
    }

    // Sort by similarity descending and take top k
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, k);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
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

  async deleteVector(id: string): Promise<void> {
    this.vectors.delete(id);
  }

  async clear(): Promise<void> {
    this.vectors.clear();
  }

  async size(): Promise<number> {
    return this.vectors.size;
  }

  async close(): Promise<void> {
    // Nothing to close for in-memory store
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
