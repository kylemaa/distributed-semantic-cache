/**
 * Query pattern clustering and analysis - Public Version
 * 
 * This is a simplified version for the open source edition.
 * Provides basic query pattern detection using Jaccard similarity.
 * 
 * Note: Advanced clustering algorithms with predictive cache warming,
 * real-time pattern detection, and proprietary optimization techniques
 * are available in the enterprise version.
 */

import { extractKeyTerms } from './normalize.js';

export interface QueryPattern {
  id: string;
  centroid: string[];      // Key terms representing the pattern
  queries: string[];       // Queries in this cluster
  frequency: number;       // How many times queries in this pattern were seen
  avgSimilarity: number;   // Average similarity within cluster
  lastSeen: number;        // Timestamp
}

export interface ClusteringConfig {
  enabled: boolean;
  minClusterSize: number;   // Minimum queries to form a cluster
  maxClusters: number;      // Maximum number of clusters to track
  similarityThreshold: number; // Minimum similarity to join cluster
}

const DEFAULT_CLUSTERING_CONFIG: ClusteringConfig = {
  enabled: true,
  minClusterSize: 3,
  maxClusters: 50,
  similarityThreshold: 0.7,
};

/**
 * Query pattern analyzer
 */
export class QueryClusterer {
  private patterns: Map<string, QueryPattern>;
  private config: ClusteringConfig;

  constructor(config?: Partial<ClusteringConfig>) {
    this.config = { ...DEFAULT_CLUSTERING_CONFIG, ...config };
    this.patterns = new Map();
  }

  /**
   * Add a query to the clustering system
   */
  addQuery(query: string): string | null {
    if (!this.config.enabled) return null;

    const terms = extractKeyTerms(query);
    if (terms.length === 0) return null;

    // Find best matching pattern
    let bestMatch: { id: string; similarity: number } | null = null;
    
    for (const [id, pattern] of this.patterns.entries()) {
      const similarity = this.calculateTermSimilarity(terms, pattern.centroid);
      if (similarity >= this.config.similarityThreshold) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { id, similarity };
        }
      }
    }

    if (bestMatch) {
      // Add to existing pattern
      const pattern = this.patterns.get(bestMatch.id)!;
      pattern.queries.push(query);
      pattern.frequency++;
      pattern.lastSeen = Date.now();
      
      // Update centroid (add new terms)
      pattern.centroid = this.updateCentroid(pattern.centroid, terms);
      
      // Update average similarity
      pattern.avgSimilarity = 
        (pattern.avgSimilarity * (pattern.queries.length - 1) + bestMatch.similarity) / 
        pattern.queries.length;
      
      return bestMatch.id;
    } else {
      // Create new pattern
      const id = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const pattern: QueryPattern = {
        id,
        centroid: terms,
        queries: [query],
        frequency: 1,
        avgSimilarity: 1.0,
        lastSeen: Date.now(),
      };
      
      this.patterns.set(id, pattern);
      
      // Prune old patterns if we exceed max clusters
      if (this.patterns.size > this.config.maxClusters) {
        this.prunePatterns();
      }
      
      return id;
    }
  }

  /**
   * Calculate similarity between two term sets (simplified Jaccard similarity)
   * 
   * Note: Enterprise version uses advanced semantic similarity measures
   * with weighted terms and contextual understanding.
   */
  private calculateTermSimilarity(terms1: string[], terms2: string[]): number {
    if (terms1.length === 0 || terms2.length === 0) return 0;
    
    // Simple Jaccard similarity (public version)
    // Enterprise version includes term weighting and semantic expansion
    const set1 = new Set(terms1);
    const set2 = new Set(terms2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  /**
   * Update centroid with new terms
   */
  private updateCentroid(centroid: string[], newTerms: string[]): string[] {
    const combined = [...centroid, ...newTerms];
    const termCounts = new Map<string, number>();
    
    for (const term of combined) {
      termCounts.set(term, (termCounts.get(term) || 0) + 1);
    }
    
    // Keep terms that appear most frequently
    const sorted = Array.from(termCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10) // Keep top 10 terms
      .map(([term]) => term);
    
    return sorted;
  }

  /**
   * Prune least recently used patterns
   */
  private prunePatterns(): void {
    const sorted = Array.from(this.patterns.values())
      .sort((a, b) => {
        // Sort by frequency * recency
        const scoreA = a.frequency * (1 / (Date.now() - a.lastSeen));
        const scoreB = b.frequency * (1 / (Date.now() - b.lastSeen));
        return scoreB - scoreA;
      });
    
    // Keep top patterns
    const toKeep = sorted.slice(0, this.config.maxClusters - 10);
    const newPatterns = new Map<string, QueryPattern>();
    
    for (const pattern of toKeep) {
      newPatterns.set(pattern.id, pattern);
    }
    
    this.patterns = newPatterns;
  }

  /**
   * Get pattern for a query
   */
  getPattern(query: string): QueryPattern | null {
    if (!this.config.enabled) return null;

    const terms = extractKeyTerms(query);
    if (terms.length === 0) return null;

    let bestMatch: { pattern: QueryPattern; similarity: number } | null = null;
    
    for (const pattern of this.patterns.values()) {
      const similarity = this.calculateTermSimilarity(terms, pattern.centroid);
      if (similarity >= this.config.similarityThreshold) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { pattern, similarity };
        }
      }
    }

    return bestMatch?.pattern || null;
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): QueryPattern[] {
    return Array.from(this.patterns.values())
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Get popular patterns (most frequently seen)
   */
  getPopularPatterns(limit: number = 10): QueryPattern[] {
    return this.getAllPatterns().slice(0, limit);
  }

  /**
   * Get statistics
   */
  getStats() {
    const patterns = Array.from(this.patterns.values());
    return {
      totalPatterns: patterns.length,
      totalQueries: patterns.reduce((sum, p) => sum + p.queries.length, 0),
      avgQueriesPerPattern: patterns.length > 0 
        ? patterns.reduce((sum, p) => sum + p.queries.length, 0) / patterns.length 
        : 0,
      avgSimilarity: patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.avgSimilarity, 0) / patterns.length
        : 0,
    };
  }

  /**
   * Reset all patterns
   */
  reset(): void {
    this.patterns.clear();
  }

  /**
   * Export patterns (for persistence)
   */
  export(): QueryPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Import patterns (from persistence)
   */
  import(patterns: QueryPattern[]): void {
    this.patterns.clear();
    for (const pattern of patterns) {
      this.patterns.set(pattern.id, pattern);
    }
  }
}
