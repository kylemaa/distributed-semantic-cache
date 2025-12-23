/**
 * Comprehensive Semantic Cache Benchmark Suite
 *
 * Benchmarks:
 * 1. Layer Performance (L1, L2, L3)
 * 2. Scaling Tests (10, 100, 1K, 10K entries)
 * 3. Memory Usage
 * 4. Latency Percentiles (P50, P95, P99)
 * 5. Hit Rate Analysis
 * 6. Throughput (queries per second)
 *
 * Usage:
 *   cd packages/api
 *   tsx benchmarks/comprehensive-benchmark.ts
 */

import { performance } from 'perf_hooks';

// ============================================================================
// BENCHMARK CONFIGURATION
// ============================================================================

const CONFIG = {
  warmupQueries: 50,
  benchmarkQueries: 500,
  scalingSteps: [10, 100, 1000, 5000],
  percentiles: [50, 75, 90, 95, 99],
  repetitionCount: 3, // Run each benchmark multiple times
};

// Sample queries for testing
const SAMPLE_QUERIES = [
  // Technology
  'What is machine learning?',
  'How do neural networks work?',
  'Explain artificial intelligence',
  'What is deep learning?',
  'How to train an AI model?',
  
  // Programming
  'How to learn JavaScript?',
  'Best Python tutorials',
  'What is TypeScript?',
  'Explain React hooks',
  'How to use async await?',
  
  // General
  'What is the capital of France?',
  'How does the weather work?',
  'Why is the sky blue?',
  'How to cook pasta?',
  'Best travel destinations',
  
  // Variations (for hit rate testing)
  'What is ML?',
  'Explain neural nets',
  'AI explanation',
  'Learn JS',
  'Python learning resources',
];

// Query variations for hit rate testing
const QUERY_VARIATIONS: Record<string, string[]> = {
  'What is machine learning?': [
    'What is ML?',
    'Explain machine learning',
    'Machine learning definition',
    'what is machine learning',
    'WHAT IS MACHINE LEARNING?',
  ],
  'How to learn JavaScript?': [
    'Learn JavaScript',
    'JavaScript tutorial',
    'How can I learn JS?',
    'JavaScript learning resources',
    'Best way to learn JavaScript',
  ],
  'What is the capital of France?': [
    'France capital',
    'Capital of France',
    'What is Frances capital?',
    'Paris is capital of which country?',
    'French capital city',
  ],
};

// ============================================================================
// UTILITIES
// ============================================================================

interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  stdDev: number;
}

function calculateStats(latencies: number[]): LatencyStats {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = latencies.reduce((a, b) => a + b, 0);
  const avg = sum / latencies.length;
  const variance = latencies.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / latencies.length;
  
  const percentile = (p: number) => sorted[Math.floor(sorted.length * (p / 100))];
  
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(avg * 100) / 100,
    p50: percentile(50),
    p75: percentile(75),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99),
    stdDev: Math.round(Math.sqrt(variance) * 100) / 100,
  };
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function generateRandomQuery(): string {
  const idx = Math.floor(Math.random() * SAMPLE_QUERIES.length);
  return SAMPLE_QUERIES[idx];
}

function generateQueryWithVariation(): { original: string; variation: string } {
  const keys = Object.keys(QUERY_VARIATIONS);
  const original = keys[Math.floor(Math.random() * keys.length)];
  const variations = QUERY_VARIATIONS[original];
  const variation = variations[Math.floor(Math.random() * variations.length)];
  return { original, variation };
}

// ============================================================================
// MOCK CACHE SIMULATION
// (Replace with actual cache service integration for real benchmarks)
// ============================================================================

interface MockCacheResult {
  hit: boolean;
  layer: 'L1' | 'L2' | 'L3' | 'miss';
  latencyMs: number;
  similarity?: number;
}

// Simulated cache behavior
class MockSemanticCache {
  private exactCache = new Map<string, string>();
  private normalizedCache = new Map<string, string>();
  private semanticIndex: Array<{ query: string; response: string }> = [];
  
  // Latency simulation (based on typical real-world performance)
  private readonly L1_LATENCY = { min: 0.05, max: 0.2 };
  private readonly L2_LATENCY = { min: 0.1, max: 0.5 };
  private readonly L3_LATENCY = { min: 5, max: 50 };
  private readonly MISS_LATENCY = { min: 100, max: 300 };

  private randomLatency(range: { min: number; max: number }): number {
    return range.min + Math.random() * (range.max - range.min);
  }

  private normalize(query: string): string {
    return query.toLowerCase().replace(/[^\w\s]/g, '').trim();
  }

  private semanticMatch(query: string): { match: boolean; similarity: number } {
    // Simulate semantic matching
    const normalized = this.normalize(query);
    
    for (const entry of this.semanticIndex) {
      const entryNorm = this.normalize(entry.query);
      
      // Simple word overlap as proxy for semantic similarity
      const words1 = new Set(normalized.split(/\s+/));
      const words2 = new Set(entryNorm.split(/\s+/));
      const intersection = [...words1].filter(w => words2.has(w)).length;
      const union = new Set([...words1, ...words2]).size;
      const similarity = intersection / union;
      
      if (similarity > 0.4) {
        return { match: true, similarity: 0.7 + similarity * 0.3 };
      }
    }
    
    return { match: false, similarity: 0 };
  }

  store(query: string, response: string): void {
    this.exactCache.set(query, response);
    this.normalizedCache.set(this.normalize(query), response);
    this.semanticIndex.push({ query, response });
  }

  query(q: string): MockCacheResult {
    const start = performance.now();
    
    // L1: Exact match
    if (this.exactCache.has(q)) {
      return {
        hit: true,
        layer: 'L1',
        latencyMs: this.randomLatency(this.L1_LATENCY),
        similarity: 1.0,
      };
    }
    
    // L2: Normalized match
    const normalized = this.normalize(q);
    if (this.normalizedCache.has(normalized)) {
      return {
        hit: true,
        layer: 'L2',
        latencyMs: this.randomLatency(this.L2_LATENCY),
        similarity: 0.98,
      };
    }
    
    // L3: Semantic match
    const semantic = this.semanticMatch(q);
    if (semantic.match) {
      return {
        hit: true,
        layer: 'L3',
        latencyMs: this.randomLatency(this.L3_LATENCY),
        similarity: semantic.similarity,
      };
    }
    
    // Miss
    return {
      hit: false,
      layer: 'miss',
      latencyMs: this.randomLatency(this.MISS_LATENCY),
    };
  }

  clear(): void {
    this.exactCache.clear();
    this.normalizedCache.clear();
    this.semanticIndex = [];
  }

  get size(): number {
    return this.exactCache.size;
  }
}

// ============================================================================
// BENCHMARK FUNCTIONS
// ============================================================================

interface BenchmarkResults {
  name: string;
  description: string;
  results: Record<string, any>;
}

async function benchmarkLayerPerformance(): Promise<BenchmarkResults> {
  console.log('\n📊 Benchmark 1: Layer Performance');
  console.log('─'.repeat(50));
  
  const cache = new MockSemanticCache();
  const results: Record<string, { latencies: number[]; stats: LatencyStats }> = {
    L1: { latencies: [], stats: {} as LatencyStats },
    L2: { latencies: [], stats: {} as LatencyStats },
    L3: { latencies: [], stats: {} as LatencyStats },
    miss: { latencies: [], stats: {} as LatencyStats },
  };
  
  // Populate cache
  for (const query of SAMPLE_QUERIES.slice(0, 10)) {
    cache.store(query, `Response for: ${query}`);
  }
  
  // Test L1: exact matches
  console.log('  Testing L1 (exact match)...');
  for (let i = 0; i < CONFIG.benchmarkQueries; i++) {
    const query = SAMPLE_QUERIES[i % 10];
    const result = cache.query(query);
    if (result.layer === 'L1') results.L1.latencies.push(result.latencyMs);
  }
  
  // Test L2: normalized matches
  console.log('  Testing L2 (normalized match)...');
  for (let i = 0; i < CONFIG.benchmarkQueries; i++) {
    const query = SAMPLE_QUERIES[i % 10].toLowerCase();
    const result = cache.query(query);
    if (result.layer === 'L2') results.L2.latencies.push(result.latencyMs);
  }
  
  // Test L3: semantic matches
  console.log('  Testing L3 (semantic match)...');
  const { original, variation } = generateQueryWithVariation();
  cache.store(original, `Response for: ${original}`);
  for (let i = 0; i < CONFIG.benchmarkQueries; i++) {
    const result = cache.query(variation);
    if (result.layer === 'L3') results.L3.latencies.push(result.latencyMs);
  }
  
  // Test misses
  console.log('  Testing cache misses...');
  for (let i = 0; i < 100; i++) {
    const result = cache.query(`Random unique query ${i} ${Date.now()}`);
    if (result.layer === 'miss') results.miss.latencies.push(result.latencyMs);
  }
  
  // Calculate stats
  for (const layer of Object.keys(results)) {
    if (results[layer].latencies.length > 0) {
      results[layer].stats = calculateStats(results[layer].latencies);
    }
  }
  
  // Print results
  console.log('\n  Layer Performance Results:');
  console.log('  ┌─────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('  │ Layer   │ Avg      │ P50      │ P95      │ P99      │');
  console.log('  ├─────────┼──────────┼──────────┼──────────┼──────────┤');
  for (const [layer, data] of Object.entries(results)) {
    if (data.latencies.length > 0) {
      console.log(`  │ ${layer.padEnd(7)} │ ${formatMs(data.stats.avg).padEnd(8)} │ ${formatMs(data.stats.p50).padEnd(8)} │ ${formatMs(data.stats.p95).padEnd(8)} │ ${formatMs(data.stats.p99).padEnd(8)} │`);
    }
  }
  console.log('  └─────────┴──────────┴──────────┴──────────┴──────────┘');
  
  return {
    name: 'Layer Performance',
    description: 'Latency comparison across cache layers',
    results: Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, v.stats])
    ),
  };
}

async function benchmarkScaling(): Promise<BenchmarkResults> {
  console.log('\n📊 Benchmark 2: Scaling Test');
  console.log('─'.repeat(50));
  
  const results: Record<number, { insertTime: number; queryTime: number; memoryMB: number }> = {};
  
  for (const size of CONFIG.scalingSteps) {
    console.log(`  Testing with ${size} entries...`);
    
    const cache = new MockSemanticCache();
    
    // Measure insertion time
    const insertStart = performance.now();
    for (let i = 0; i < size; i++) {
      cache.store(`Query ${i}: ${generateRandomQuery()}`, `Response ${i}`);
    }
    const insertTime = performance.now() - insertStart;
    
    // Measure query time (average over multiple queries)
    const queryLatencies: number[] = [];
    for (let i = 0; i < 100; i++) {
      const queryStart = performance.now();
      cache.query(generateRandomQuery());
      queryLatencies.push(performance.now() - queryStart);
    }
    const avgQueryTime = queryLatencies.reduce((a, b) => a + b, 0) / queryLatencies.length;
    
    // Estimate memory (rough)
    const memoryMB = (size * 500) / (1024 * 1024); // ~500 bytes per entry estimate
    
    results[size] = {
      insertTime: Math.round(insertTime * 100) / 100,
      queryTime: Math.round(avgQueryTime * 100) / 100,
      memoryMB: Math.round(memoryMB * 100) / 100,
    };
    
    cache.clear();
  }
  
  // Print results
  console.log('\n  Scaling Results:');
  console.log('  ┌───────────┬─────────────┬─────────────┬─────────────┐');
  console.log('  │ Entries   │ Insert Time │ Query Time  │ Memory (MB) │');
  console.log('  ├───────────┼─────────────┼─────────────┼─────────────┤');
  for (const [size, data] of Object.entries(results)) {
    console.log(`  │ ${String(size).padEnd(9)} │ ${formatMs(data.insertTime).padEnd(11)} │ ${formatMs(data.queryTime).padEnd(11)} │ ${String(data.memoryMB).padEnd(11)} │`);
  }
  console.log('  └───────────┴─────────────┴─────────────┴─────────────┘');
  
  return {
    name: 'Scaling Test',
    description: 'Performance at different cache sizes',
    results,
  };
}

async function benchmarkHitRate(): Promise<BenchmarkResults> {
  console.log('\n📊 Benchmark 3: Hit Rate Analysis');
  console.log('─'.repeat(50));
  
  const cache = new MockSemanticCache();
  const layerHits: Record<string, number> = { L1: 0, L2: 0, L3: 0, miss: 0 };
  let totalQueries = 0;
  
  // Populate cache with base queries
  for (const query of Object.keys(QUERY_VARIATIONS)) {
    cache.store(query, `Response for: ${query}`);
  }
  
  // Query with variations
  console.log('  Running hit rate test...');
  
  for (let round = 0; round < 3; round++) {
    // Exact matches
    for (const query of Object.keys(QUERY_VARIATIONS)) {
      const result = cache.query(query);
      layerHits[result.layer]++;
      totalQueries++;
    }
    
    // Variations
    for (const [original, variations] of Object.entries(QUERY_VARIATIONS)) {
      for (const variation of variations) {
        const result = cache.query(variation);
        layerHits[result.layer]++;
        totalQueries++;
      }
    }
    
    // Random misses
    for (let i = 0; i < 10; i++) {
      const result = cache.query(`Completely unrelated query ${i} ${Date.now()}`);
      layerHits[result.layer]++;
      totalQueries++;
    }
  }
  
  // Calculate rates
  const rates: Record<string, number> = {};
  for (const [layer, count] of Object.entries(layerHits)) {
    rates[layer] = Math.round((count / totalQueries) * 10000) / 100;
  }
  
  const totalHitRate = 100 - rates.miss;
  
  // Print results
  console.log('\n  Hit Rate Results:');
  console.log('  ┌─────────────────┬───────────┬────────────┐');
  console.log('  │ Layer           │ Hits      │ Rate       │');
  console.log('  ├─────────────────┼───────────┼────────────┤');
  console.log(`  │ L1 (Exact)      │ ${String(layerHits.L1).padEnd(9)} │ ${String(rates.L1 + '%').padEnd(10)} │`);
  console.log(`  │ L2 (Normalized) │ ${String(layerHits.L2).padEnd(9)} │ ${String(rates.L2 + '%').padEnd(10)} │`);
  console.log(`  │ L3 (Semantic)   │ ${String(layerHits.L3).padEnd(9)} │ ${String(rates.L3 + '%').padEnd(10)} │`);
  console.log(`  │ Miss            │ ${String(layerHits.miss).padEnd(9)} │ ${String(rates.miss + '%').padEnd(10)} │`);
  console.log('  ├─────────────────┼───────────┼────────────┤');
  console.log(`  │ TOTAL HIT RATE  │           │ ${String(totalHitRate.toFixed(1) + '%').padEnd(10)} │`);
  console.log('  └─────────────────┴───────────┴────────────┘');
  
  return {
    name: 'Hit Rate Analysis',
    description: 'Cache hit rates by layer',
    results: {
      layerHits,
      rates,
      totalHitRate,
      totalQueries,
    },
  };
}

async function benchmarkThroughput(): Promise<BenchmarkResults> {
  console.log('\n📊 Benchmark 4: Throughput Test');
  console.log('─'.repeat(50));
  
  const cache = new MockSemanticCache();
  
  // Populate cache
  for (let i = 0; i < 1000; i++) {
    cache.store(`Query ${i}`, `Response ${i}`);
  }
  
  // Warmup
  console.log('  Warming up...');
  for (let i = 0; i < CONFIG.warmupQueries; i++) {
    cache.query(`Query ${i % 1000}`);
  }
  
  // Measure throughput
  console.log('  Measuring throughput...');
  const durations: number[] = [];
  
  for (let run = 0; run < CONFIG.repetitionCount; run++) {
    const start = performance.now();
    for (let i = 0; i < CONFIG.benchmarkQueries; i++) {
      cache.query(`Query ${i % 1000}`);
    }
    const duration = performance.now() - start;
    durations.push(duration);
  }
  
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
  const queriesPerSecond = (CONFIG.benchmarkQueries / avgDuration) * 1000;
  const avgLatency = avgDuration / CONFIG.benchmarkQueries;
  
  // Print results
  console.log('\n  Throughput Results:');
  console.log('  ┌────────────────────┬─────────────────┐');
  console.log('  │ Metric             │ Value           │');
  console.log('  ├────────────────────┼─────────────────┤');
  console.log(`  │ Queries/second     │ ${String(Math.round(queriesPerSecond)).padEnd(15)} │`);
  console.log(`  │ Avg latency        │ ${formatMs(avgLatency).padEnd(15)} │`);
  console.log(`  │ Total queries      │ ${String(CONFIG.benchmarkQueries * CONFIG.repetitionCount).padEnd(15)} │`);
  console.log(`  │ Total time         │ ${formatMs(durations.reduce((a,b) => a+b, 0)).padEnd(15)} │`);
  console.log('  └────────────────────┴─────────────────┘');
  
  return {
    name: 'Throughput Test',
    description: 'Queries per second measurement',
    results: {
      queriesPerSecond: Math.round(queriesPerSecond),
      avgLatencyMs: Math.round(avgLatency * 1000) / 1000,
      totalQueries: CONFIG.benchmarkQueries * CONFIG.repetitionCount,
    },
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function runAllBenchmarks() {
  console.log('═'.repeat(60));
  console.log('  DISTRIBUTED SEMANTIC CACHE - COMPREHENSIVE BENCHMARK');
  console.log('═'.repeat(60));
  console.log(`\nConfiguration:`);
  console.log(`  - Warmup queries: ${CONFIG.warmupQueries}`);
  console.log(`  - Benchmark queries: ${CONFIG.benchmarkQueries}`);
  console.log(`  - Scaling steps: ${CONFIG.scalingSteps.join(', ')}`);
  console.log(`  - Repetitions: ${CONFIG.repetitionCount}`);
  
  const allResults: BenchmarkResults[] = [];
  
  try {
    allResults.push(await benchmarkLayerPerformance());
    allResults.push(await benchmarkScaling());
    allResults.push(await benchmarkHitRate());
    allResults.push(await benchmarkThroughput());
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
  }
  
  // Summary
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('  BENCHMARK SUMMARY');
  console.log('═'.repeat(60));
  
  for (const result of allResults) {
    console.log(`\n📊 ${result.name}`);
    console.log(`   ${result.description}`);
  }
  
  console.log('\n✅ All benchmarks completed!\n');
  console.log('For real-world results, replace MockSemanticCache with actual SemanticCacheService.');
  
  return allResults;
}

// Run benchmarks
runAllBenchmarks().catch(console.error);
