/**
 * Matryoshka Embeddings - Open Source
 * 
 * Adaptive dimension cascade search using truncated embeddings.
 * Matryoshka embeddings have the property that the first N dimensions
 * form a valid embedding at lower precision.
 * 
 * This enables multi-stage search:
 * 1. Fast initial filter using 64-256 dimensions
 * 2. Re-rank using full dimensions (768-1536)
 * 
 * Supported by OpenAI text-embedding-3-* models:
 * - text-embedding-3-small: up to 1536 dimensions
 * - text-embedding-3-large: up to 3072 dimensions
 * 
 * Research: https://arxiv.org/abs/2205.13147
 */

import { cosineSimilarity } from '@distributed-semantic-cache/shared';

export interface MatryoshkaConfig {
  /** Dimensions for first-pass filtering (fast) */
  filterDimensions: number;
  /** Dimensions for final ranking (accurate) */
  fullDimensions: number;
  /** Number of candidates to keep after first pass */
  filterTopK: number;
  /** Whether to normalize truncated vectors */
  normalizeAfterTruncation: boolean;
}

export interface CascadeSearchResult {
  id: string;
  similarity: number;
  filterSimilarity: number;  // Similarity from first pass
  reranked: boolean;         // Whether this was reranked
}

export interface CascadeStats {
  totalCandidates: number;
  filteredCandidates: number;
  filterTimeMs: number;
  rerankTimeMs: number;
  dimensionReduction: number; // Percentage reduction
}

const DEFAULT_CONFIG: MatryoshkaConfig = {
  filterDimensions: 256,
  fullDimensions: 1536,
  filterTopK: 100,
  normalizeAfterTruncation: true,
};

/**
 * Matryoshka Cascade Search
 * 
 * Enables fast approximate search using truncated embeddings,
 * followed by precise reranking using full dimensions.
 */
export class MatryoshkaCascade {
  private config: MatryoshkaConfig;

  constructor(config?: Partial<MatryoshkaConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Truncate embedding to specified dimensions
   */
  truncate(embedding: number[], dimensions: number): number[] {
    if (embedding.length <= dimensions) {
      return embedding;
    }

    const truncated = embedding.slice(0, dimensions);

    if (this.config.normalizeAfterTruncation) {
      return this.normalize(truncated);
    }

    return truncated;
  }

  /**
   * L2 normalize a vector
   */
  private normalize(vector: number[]): number[] {
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm === 0) return vector;

    return vector.map(v => v / norm);
  }

  /**
   * Perform cascade search: fast filter + precise rerank
   */
  search<T extends { id: string; embedding: number[] }>(
    query: number[],
    candidates: T[],
    topK: number = 10,
    threshold: number = 0.8
  ): { results: CascadeSearchResult[]; stats: CascadeStats } {
    const filterStartTime = Date.now();

    // Truncate query for first pass
    const queryTruncated = this.truncate(query, this.config.filterDimensions);

    // First pass: fast filter using truncated embeddings
    const filterResults: { item: T; similarity: number }[] = [];
    
    for (const candidate of candidates) {
      const candidateTruncated = this.truncate(
        candidate.embedding,
        this.config.filterDimensions
      );
      const similarity = cosineSimilarity(queryTruncated, candidateTruncated);
      
      // Use lower threshold for filter pass (catch more candidates)
      const filterThreshold = Math.max(0.5, threshold - 0.2);
      if (similarity >= filterThreshold) {
        filterResults.push({ item: candidate, similarity });
      }
    }

    // Sort by similarity and keep top K
    filterResults.sort((a, b) => b.similarity - a.similarity);
    const topCandidates = filterResults.slice(0, this.config.filterTopK);

    const filterTimeMs = Date.now() - filterStartTime;
    const rerankStartTime = Date.now();

    // Second pass: precise rerank using full embeddings
    const results: CascadeSearchResult[] = [];

    for (const { item, similarity: filterSimilarity } of topCandidates) {
      // Use full dimensions for accurate similarity
      const fullSimilarity = cosineSimilarity(query, item.embedding);
      
      if (fullSimilarity >= threshold) {
        results.push({
          id: item.id,
          similarity: fullSimilarity,
          filterSimilarity,
          reranked: true,
        });
      }
    }

    // Sort by full similarity
    results.sort((a, b) => b.similarity - a.similarity);

    const rerankTimeMs = Date.now() - rerankStartTime;

    return {
      results: results.slice(0, topK),
      stats: {
        totalCandidates: candidates.length,
        filteredCandidates: topCandidates.length,
        filterTimeMs,
        rerankTimeMs,
        dimensionReduction: 
          (1 - this.config.filterDimensions / this.config.fullDimensions) * 100,
      },
    };
  }

  /**
   * Batch truncate embeddings for storage optimization
   * Store both truncated and full versions
   */
  prepareBatchEmbeddings(embeddings: number[][]): {
    truncated: number[][];
    full: number[][];
  } {
    return {
      truncated: embeddings.map(e => this.truncate(e, this.config.filterDimensions)),
      full: embeddings,
    };
  }

  /**
   * Calculate storage savings from truncation
   */
  calculateStorageSavings(embeddingCount: number): {
    fullSizeBytes: number;
    truncatedSizeBytes: number;
    savingsPercent: number;
    savingsBytes: number;
  } {
    const bytesPerFloat = 4; // float32
    const fullSizeBytes = embeddingCount * this.config.fullDimensions * bytesPerFloat;
    const truncatedSizeBytes = embeddingCount * this.config.filterDimensions * bytesPerFloat;
    const savingsBytes = fullSizeBytes - truncatedSizeBytes;

    return {
      fullSizeBytes,
      truncatedSizeBytes,
      savingsPercent: (savingsBytes / fullSizeBytes) * 100,
      savingsBytes,
    };
  }

  /**
   * Get optimal filter dimensions based on quality requirements
   */
  static getRecommendedDimensions(
    originalDimensions: number,
    qualityLevel: 'fast' | 'balanced' | 'accurate'
  ): number {
    const ratios = {
      fast: 0.1,      // 10% of dimensions
      balanced: 0.25, // 25% of dimensions
      accurate: 0.5,  // 50% of dimensions
    };

    const dims = Math.floor(originalDimensions * ratios[qualityLevel]);
    // Round to nearest power of 2 for potential SIMD optimization
    return Math.pow(2, Math.round(Math.log2(dims)));
  }

  /**
   * Analyze embedding quality at different truncation levels
   */
  analyzeQualityDegradation(
    query: number[],
    candidates: { id: string; embedding: number[] }[],
    dimensionLevels: number[] = [64, 128, 256, 512]
  ): QualityAnalysis[] {
    // Get ground truth with full dimensions
    const groundTruth = candidates
      .map(c => ({
        id: c.id,
        similarity: cosineSimilarity(query, c.embedding),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 10);

    const analyses: QualityAnalysis[] = [];

    for (const dims of dimensionLevels) {
      if (dims > query.length) continue;

      const queryTruncated = this.truncate(query, dims);
      
      const truncatedResults = candidates
        .map(c => ({
          id: c.id,
          similarity: cosineSimilarity(
            queryTruncated,
            this.truncate(c.embedding, dims)
          ),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 10);

      // Calculate recall@10
      const groundTruthIds = new Set(groundTruth.map(r => r.id));
      const recall = truncatedResults.filter(r => groundTruthIds.has(r.id)).length / 10;

      // Calculate average similarity preservation
      const avgSimilarityDiff = groundTruth.reduce((sum, gt) => {
        const truncatedMatch = truncatedResults.find(tr => tr.id === gt.id);
        return sum + (truncatedMatch ? Math.abs(gt.similarity - truncatedMatch.similarity) : 1);
      }, 0) / groundTruth.length;

      analyses.push({
        dimensions: dims,
        recall10: recall,
        avgSimilarityDrift: avgSimilarityDiff,
        speedupFactor: query.length / dims,
        storageReduction: (1 - dims / query.length) * 100,
      });
    }

    return analyses;
  }

  /**
   * Get configuration
   */
  getConfig(): MatryoshkaConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<MatryoshkaConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export interface QualityAnalysis {
  dimensions: number;
  recall10: number;        // Recall@10 compared to full dimensions
  avgSimilarityDrift: number; // Average difference in similarity scores
  speedupFactor: number;   // How much faster (dimensions ratio)
  storageReduction: number; // Percentage storage savings
}

/**
 * Create Matryoshka cascade instance with auto-detected dimensions
 */
export function createMatryoshkaCascade(
  fullDimensions: number,
  quality: 'fast' | 'balanced' | 'accurate' = 'balanced'
): MatryoshkaCascade {
  const filterDimensions = MatryoshkaCascade.getRecommendedDimensions(
    fullDimensions,
    quality
  );

  return new MatryoshkaCascade({
    filterDimensions,
    fullDimensions,
    filterTopK: quality === 'fast' ? 50 : quality === 'balanced' ? 100 : 200,
  });
}
