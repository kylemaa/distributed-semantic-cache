/**
 * Bloom Filter Optimization
 * 
 * Probabilistic data structure for fast "definitely not in cache" checks.
 * Avoids expensive vector search for queries that have never been seen.
 * 
 * Trade-off: 1% false positive rate, ~100KB for 100K entries
 * 
 * Paper basis: Space-efficient probabilistic data structures (Bloom 1970)
 */

import type {
  CacheOptimization,
  OptimizationContext,
  OptimizationResult,
  OptimizationStats,
} from './types.js';

export class BloomFilterOptimization implements CacheOptimization {
  readonly name = 'bloom-filter';
  readonly priority = 5;  // Run first, before everything
  enabled = true;

  // Bloom filter parameters
  private readonly size: number;        // Bit array size
  private readonly hashCount: number;   // Number of hash functions
  private readonly bits: Uint8Array;
  private entryCount = 0;

  // Configurable: use normalized queries or exact queries
  private useNormalized = true;

  private stats = {
    invocations: 0,
    improvements: 0,  // Times we correctly skipped vector search
    totalLatencyMs: 0,
  };

  constructor(options?: {
    expectedEntries?: number;
    falsePositiveRate?: number;
    useNormalized?: boolean;
  }) {
    const expectedEntries = options?.expectedEntries ?? 100000;
    const falsePositiveRate = options?.falsePositiveRate ?? 0.01;

    // Calculate optimal size and hash count
    // m = -n * ln(p) / (ln(2)^2)
    // k = (m/n) * ln(2)
    this.size = Math.ceil(
      -expectedEntries * Math.log(falsePositiveRate) / Math.pow(Math.log(2), 2)
    );
    this.hashCount = Math.ceil((this.size / expectedEntries) * Math.log(2));
    
    this.bits = new Uint8Array(Math.ceil(this.size / 8));
    
    if (options?.useNormalized !== undefined) {
      this.useNormalized = options.useNormalized;
    }
  }

  async preSearch(context: OptimizationContext): Promise<OptimizationResult> {
    const start = performance.now();
    this.stats.invocations++;

    const key = this.useNormalized && context.normalizedQuery
      ? context.normalizedQuery
      : context.query;

    const definitelyNotInCache = !this.mightContain(key);

    if (definitelyNotInCache) {
      this.stats.improvements++;  // Saved a vector search!
    }

    this.stats.totalLatencyMs += performance.now() - start;

    return { definitelyNotInCache };
  }

  /**
   * Add a query to the bloom filter (call when storing in cache)
   */
  add(query: string): void {
    const hashes = this.getHashes(query);
    for (const hash of hashes) {
      const byteIndex = Math.floor(hash / 8);
      const bitIndex = hash % 8;
      this.bits[byteIndex] |= (1 << bitIndex);
    }
    this.entryCount++;
  }

  /**
   * Check if a query might be in the cache
   */
  mightContain(query: string): boolean {
    const hashes = this.getHashes(query);
    for (const hash of hashes) {
      const byteIndex = Math.floor(hash / 8);
      const bitIndex = hash % 8;
      if ((this.bits[byteIndex] & (1 << bitIndex)) === 0) {
        return false;  // Definitely not in cache
      }
    }
    return true;  // Might be in cache (could be false positive)
  }

  recordFeedback(): void {
    // Bloom filters don't learn from feedback
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
      extra: {
        size: this.size,
        hashCount: this.hashCount,
        entryCount: this.entryCount,
        fillRatio: this.calculateFillRatio(),
        estimatedFalsePositiveRate: this.estimateFalsePositiveRate(),
      },
    };
  }

  reset(): void {
    this.bits.fill(0);
    this.entryCount = 0;
    this.stats = { invocations: 0, improvements: 0, totalLatencyMs: 0 };
  }

  // --- Private helpers ---

  private getHashes(value: string): number[] {
    // Use double hashing to generate k hash functions
    // h(i) = h1 + i * h2
    const h1 = this.hash1(value);
    const h2 = this.hash2(value);
    
    const hashes: number[] = [];
    for (let i = 0; i < this.hashCount; i++) {
      hashes.push(Math.abs((h1 + i * h2) % this.size));
    }
    return hashes;
  }

  // FNV-1a hash
  private hash1(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = (hash * 16777619) >>> 0;
    }
    return hash;
  }

  // DJB2 hash
  private hash2(value: string): number {
    let hash = 5381;
    for (let i = 0; i < value.length; i++) {
      hash = ((hash << 5) + hash) + value.charCodeAt(i);
      hash = hash >>> 0;
    }
    return hash;
  }

  private calculateFillRatio(): number {
    let setBits = 0;
    for (let i = 0; i < this.bits.length; i++) {
      let byte = this.bits[i];
      while (byte) {
        setBits += byte & 1;
        byte >>= 1;
      }
    }
    return setBits / this.size;
  }

  private estimateFalsePositiveRate(): number {
    // (1 - e^(-kn/m))^k
    const fillRatio = 1 - Math.exp(-this.hashCount * this.entryCount / this.size);
    return Math.pow(fillRatio, this.hashCount);
  }
}
