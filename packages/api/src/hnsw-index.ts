/**
 * HNSW (Hierarchical Navigable Small World) Index - Open Source
 * 
 * Provides O(log n) approximate nearest neighbor search for semantic embeddings.
 * This is a pure TypeScript implementation suitable for moderate scale (up to 100K vectors).
 * 
 * For production deployments with millions of vectors, consider:
 * - hnswlib-node (C++ bindings)
 * - usearch (single-file, highly optimized)
 * - Pinecone/Weaviate (managed vector databases)
 * 
 * Algorithm: https://arxiv.org/abs/1603.09320
 */

import { cosineSimilarity } from '@distributed-semantic-cache/shared';

export interface HNSWConfig {
  M: number;              // Max connections per node (default: 16)
  efConstruction: number; // Size of dynamic candidate list during construction (default: 200)
  efSearch: number;       // Size of dynamic candidate list during search (default: 50)
  maxLevel: number;       // Maximum layer (calculated from size)
}

interface HNSWNode {
  id: string;
  vector: number[];
  connections: Map<number, Set<string>>; // level -> connected node IDs
  level: number;
}

interface SearchCandidate {
  id: string;
  distance: number;
}

const DEFAULT_CONFIG: HNSWConfig = {
  M: 16,
  efConstruction: 200,
  efSearch: 50,
  maxLevel: 16,
};

/**
 * HNSW Index for fast approximate nearest neighbor search
 * 
 * Time complexity:
 * - Insert: O(log n)
 * - Search: O(log n)
 * 
 * Space complexity: O(n * M * maxLevel)
 */
export class HNSWIndex {
  private nodes: Map<string, HNSWNode>;
  private entryPoint: string | null;
  private maxLevel: number;
  private config: HNSWConfig;
  private levelMultiplier: number;

  constructor(config?: Partial<HNSWConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.nodes = new Map();
    this.entryPoint = null;
    this.maxLevel = 0;
    this.levelMultiplier = 1 / Math.log(this.config.M);
  }

  /**
   * Calculate random level for new node (exponential distribution)
   */
  private getRandomLevel(): number {
    let level = 0;
    while (Math.random() < 0.5 && level < this.config.maxLevel) {
      level++;
    }
    return level;
  }

  /**
   * Convert cosine similarity to distance (for min-heap operations)
   */
  private similarityToDistance(similarity: number): number {
    return 1 - similarity;
  }

  /**
   * Calculate distance between two vectors
   */
  private getDistance(vecA: number[], vecB: number[]): number {
    return this.similarityToDistance(cosineSimilarity(vecA, vecB));
  }

  /**
   * Search layer for nearest neighbors
   */
  private searchLayer(
    query: number[],
    entryPoints: string[],
    ef: number,
    level: number
  ): SearchCandidate[] {
    const visited = new Set<string>(entryPoints);
    const candidates: SearchCandidate[] = [];
    const results: SearchCandidate[] = [];

    // Initialize with entry points
    for (const ep of entryPoints) {
      const node = this.nodes.get(ep);
      if (node) {
        const distance = this.getDistance(query, node.vector);
        candidates.push({ id: ep, distance });
        results.push({ id: ep, distance });
      }
    }

    // Sort candidates by distance (ascending)
    candidates.sort((a, b) => a.distance - b.distance);
    results.sort((a, b) => a.distance - b.distance);

    while (candidates.length > 0) {
      // Get closest candidate
      const current = candidates.shift()!;

      // If closest candidate is farther than the farthest result, stop
      if (results.length >= ef && current.distance > results[results.length - 1].distance) {
        break;
      }

      // Explore neighbors at this level
      const currentNode = this.nodes.get(current.id);
      if (!currentNode) continue;

      const neighbors = currentNode.connections.get(level) || new Set();
      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighbor = this.nodes.get(neighborId);
        if (!neighbor) continue;

        const distance = this.getDistance(query, neighbor.vector);

        // Add to results if within ef best or better than worst
        if (results.length < ef || distance < results[results.length - 1].distance) {
          candidates.push({ id: neighborId, distance });
          results.push({ id: neighborId, distance });

          // Keep sorted and trim to ef
          results.sort((a, b) => a.distance - b.distance);
          if (results.length > ef) {
            results.pop();
          }

          // Re-sort candidates
          candidates.sort((a, b) => a.distance - b.distance);
        }
      }
    }

    return results;
  }

  /**
   * Select neighbors for a node (simple selection - keep closest)
   */
  private selectNeighbors(
    candidates: SearchCandidate[],
    M: number
  ): string[] {
    // Sort by distance and take M closest
    return candidates
      .sort((a, b) => a.distance - b.distance)
      .slice(0, M)
      .map(c => c.id);
  }

  /**
   * Insert a vector into the index
   */
  insert(id: string, vector: number[]): void {
    // Check if already exists
    if (this.nodes.has(id)) {
      // Update existing node
      const existing = this.nodes.get(id)!;
      existing.vector = vector;
      return;
    }

    const level = this.getRandomLevel();
    const newNode: HNSWNode = {
      id,
      vector,
      connections: new Map(),
      level,
    };

    // Initialize connection sets for each level
    for (let l = 0; l <= level; l++) {
      newNode.connections.set(l, new Set());
    }

    this.nodes.set(id, newNode);

    // First node becomes entry point
    if (this.entryPoint === null) {
      this.entryPoint = id;
      this.maxLevel = level;
      return;
    }

    let currentEntryPoint = [this.entryPoint];

    // Traverse from top to node's level, finding closest at each layer
    for (let l = this.maxLevel; l > level; l--) {
      const nearest = this.searchLayer(vector, currentEntryPoint, 1, l);
      if (nearest.length > 0) {
        currentEntryPoint = [nearest[0].id];
      }
    }

    // Insert at each level from node's level down to 0
    for (let l = Math.min(level, this.maxLevel); l >= 0; l--) {
      const candidates = this.searchLayer(
        vector,
        currentEntryPoint,
        this.config.efConstruction,
        l
      );

      // Select M neighbors
      const M = l === 0 ? this.config.M * 2 : this.config.M;
      const neighbors = this.selectNeighbors(candidates, M);

      // Connect new node to neighbors
      for (const neighborId of neighbors) {
        newNode.connections.get(l)!.add(neighborId);

        // Add reverse connection
        const neighbor = this.nodes.get(neighborId);
        if (neighbor) {
          if (!neighbor.connections.has(l)) {
            neighbor.connections.set(l, new Set());
          }
          neighbor.connections.get(l)!.add(id);

          // Prune if too many connections
          if (neighbor.connections.get(l)!.size > M) {
            // Keep only M closest
            const neighborCandidates: SearchCandidate[] = [];
            for (const connId of neighbor.connections.get(l)!) {
              const connNode = this.nodes.get(connId);
              if (connNode) {
                neighborCandidates.push({
                  id: connId,
                  distance: this.getDistance(neighbor.vector, connNode.vector),
                });
              }
            }
            const kept = this.selectNeighbors(neighborCandidates, M);
            neighbor.connections.set(l, new Set(kept));
          }
        }
      }

      // Update entry points for next level
      if (candidates.length > 0) {
        currentEntryPoint = candidates.slice(0, this.config.efConstruction).map(c => c.id);
      }
    }

    // Update entry point if new node has higher level
    if (level > this.maxLevel) {
      this.entryPoint = id;
      this.maxLevel = level;
    }
  }

  /**
   * Search for k nearest neighbors
   */
  search(query: number[], k: number = 10, threshold: number = 0): SearchResult[] {
    if (this.entryPoint === null || this.nodes.size === 0) {
      return [];
    }

    let currentEntryPoint = [this.entryPoint];

    // Traverse from top level to level 1
    for (let l = this.maxLevel; l > 0; l--) {
      const nearest = this.searchLayer(query, currentEntryPoint, 1, l);
      if (nearest.length > 0) {
        currentEntryPoint = [nearest[0].id];
      }
    }

    // Search at level 0 with higher ef
    const candidates = this.searchLayer(
      query,
      currentEntryPoint,
      Math.max(this.config.efSearch, k),
      0
    );

    // Convert to results with similarity scores
    const results: SearchResult[] = [];
    for (const candidate of candidates.slice(0, k)) {
      const similarity = 1 - candidate.distance;
      if (similarity >= threshold) {
        results.push({
          id: candidate.id,
          similarity,
          vector: this.nodes.get(candidate.id)?.vector,
        });
      }
    }

    return results;
  }

  /**
   * Remove a vector from the index
   */
  remove(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;

    // Remove connections to this node from all neighbors
    for (const [level, connections] of node.connections) {
      for (const neighborId of connections) {
        const neighbor = this.nodes.get(neighborId);
        if (neighbor) {
          neighbor.connections.get(level)?.delete(id);
        }
      }
    }

    this.nodes.delete(id);

    // Update entry point if needed
    if (this.entryPoint === id) {
      if (this.nodes.size === 0) {
        this.entryPoint = null;
        this.maxLevel = 0;
      } else {
        // Find new entry point with highest level
        let maxLevel = 0;
        let newEntry: string | null = null;
        for (const [nodeId, nodeData] of this.nodes) {
          if (nodeData.level > maxLevel) {
            maxLevel = nodeData.level;
            newEntry = nodeId;
          }
        }
        this.entryPoint = newEntry;
        this.maxLevel = maxLevel;
      }
    }

    return true;
  }

  /**
   * Get index statistics
   */
  getStats(): HNSWStats {
    let totalConnections = 0;
    const levelDistribution: Record<number, number> = {};

    for (const node of this.nodes.values()) {
      levelDistribution[node.level] = (levelDistribution[node.level] || 0) + 1;
      for (const connections of node.connections.values()) {
        totalConnections += connections.size;
      }
    }

    return {
      size: this.nodes.size,
      maxLevel: this.maxLevel,
      avgConnections: this.nodes.size > 0 ? totalConnections / this.nodes.size : 0,
      levelDistribution,
      config: this.config,
    };
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    this.nodes.clear();
    this.entryPoint = null;
    this.maxLevel = 0;
  }

  /**
   * Check if index contains a vector
   */
  has(id: string): boolean {
    return this.nodes.has(id);
  }

  /**
   * Get size of index
   */
  size(): number {
    return this.nodes.size;
  }

  /**
   * Serialize index to JSON (for persistence)
   */
  serialize(): string {
    const data = {
      config: this.config,
      entryPoint: this.entryPoint,
      maxLevel: this.maxLevel,
      nodes: Array.from(this.nodes.entries()).map(([id, node]) => ({
        id,
        vector: node.vector,
        level: node.level,
        connections: Array.from(node.connections.entries()).map(([level, conns]) => ({
          level,
          connections: Array.from(conns),
        })),
      })),
    };
    return JSON.stringify(data);
  }

  /**
   * Deserialize index from JSON
   */
  static deserialize(json: string): HNSWIndex {
    const data = JSON.parse(json);
    const index = new HNSWIndex(data.config);
    index.entryPoint = data.entryPoint;
    index.maxLevel = data.maxLevel;

    for (const nodeData of data.nodes) {
      const connections = new Map<number, Set<string>>();
      for (const conn of nodeData.connections) {
        connections.set(conn.level, new Set(conn.connections));
      }
      index.nodes.set(nodeData.id, {
        id: nodeData.id,
        vector: nodeData.vector,
        level: nodeData.level,
        connections,
      });
    }

    return index;
  }
}

export interface SearchResult {
  id: string;
  similarity: number;
  vector?: number[];
}

export interface HNSWStats {
  size: number;
  maxLevel: number;
  avgConnections: number;
  levelDistribution: Record<number, number>;
  config: HNSWConfig;
}
