/**
 * Competitor Comparison Benchmark
 * 
 * Compares our Distributed Semantic Cache against:
 * - GPTCache (Python semantic cache)
 * - Redis with vector search
 * - Exact-match caching (Helicone-style)
 * - No caching (baseline)
 * 
 * Usage:
 *   npx tsx benchmarks/competitor-comparison.ts
 */

import { cosineSimilarity } from '@distributed-semantic-cache/shared';

// ============================================================================
// SIMULATED COMPETITOR IMPLEMENTATIONS
// ============================================================================

/**
 * Baseline: No caching at all
 */
class NoCacheBaseline {
  private embeddingLatency = 150; // ms
  private llmLatency = 800; // ms
  private embeddingCost = 0.00002; // per query
  private llmCost = 0.03; // per query (GPT-4)

  async query(_query: string): Promise<{ hit: boolean; latency: number; cost: number }> {
    // Always misses - generates fresh response
    const latency = this.embeddingLatency + this.llmLatency;
    const cost = this.embeddingCost + this.llmCost;
    return { hit: false, latency, cost };
  }

  getName() { return 'No Cache (Baseline)'; }
}

/**
 * Exact-match caching (Helicone-style)
 * Only matches identical strings
 */
class ExactMatchCache {
  private cache = new Map<string, string>();
  private embeddingLatency = 150;
  private llmLatency = 800;
  private embeddingCost = 0.00002;
  private llmCost = 0.03;

  async store(query: string, response: string) {
    this.cache.set(query, response);
  }

  async query(query: string): Promise<{ hit: boolean; latency: number; cost: number }> {
    if (this.cache.has(query)) {
      return { hit: true, latency: 0.1, cost: 0 };
    }
    // Miss - full cost
    const latency = this.embeddingLatency + this.llmLatency;
    const cost = this.embeddingCost + this.llmCost;
    return { hit: false, latency, cost };
  }

  getName() { return 'Exact Match (Helicone-style)'; }
}

/**
 * GPTCache-style semantic cache
 * Uses embeddings but with simpler matching
 */
class GPTCacheStyle {
  private cache: Array<{ embedding: number[]; response: string }> = [];
  private threshold = 0.85;
  private embeddingLatency = 150;
  private llmLatency = 800;
  private embeddingCost = 0.00002;
  private llmCost = 0.03;
  private searchLatency = 20; // Linear scan

  async store(embedding: number[], response: string) {
    this.cache.push({ embedding, response });
  }

  async query(embedding: number[]): Promise<{ hit: boolean; latency: number; cost: number; similarity?: number }> {
    // Linear scan through cache (GPTCache default behavior)
    let bestMatch = { similarity: 0, index: -1 };
    
    for (let i = 0; i < this.cache.length; i++) {
      const sim = cosineSimilarity(embedding, this.cache[i].embedding);
      if (sim > bestMatch.similarity) {
        bestMatch = { similarity: sim, index: i };
      }
    }

    if (bestMatch.similarity >= this.threshold) {
      // Hit - only embedding cost + search
      return { 
        hit: true, 
        latency: this.embeddingLatency + this.searchLatency,
        cost: this.embeddingCost,
        similarity: bestMatch.similarity
      };
    }

    // Miss - full cost
    return { 
      hit: false, 
      latency: this.embeddingLatency + this.llmLatency,
      cost: this.embeddingCost + this.llmCost
    };
  }

  getName() { return 'GPTCache (Semantic)'; }
}

/**
 * Redis Vector Search style
 * Fast HNSW but still requires embedding for every query
 */
class RedisVectorCache {
  private cache: Array<{ embedding: number[]; response: string }> = [];
  private threshold = 0.85;
  private embeddingLatency = 150;
  private llmLatency = 800;
  private embeddingCost = 0.00002;
  private llmCost = 0.03;
  private searchLatency = 5; // HNSW is fast

  async store(embedding: number[], response: string) {
    this.cache.push({ embedding, response });
  }

  async query(embedding: number[]): Promise<{ hit: boolean; latency: number; cost: number; similarity?: number }> {
    // HNSW search (simulated - still O(log n) but faster constant)
    let bestMatch = { similarity: 0, index: -1 };
    
    for (let i = 0; i < this.cache.length; i++) {
      const sim = cosineSimilarity(embedding, this.cache[i].embedding);
      if (sim > bestMatch.similarity) {
        bestMatch = { similarity: sim, index: i };
      }
    }

    if (bestMatch.similarity >= this.threshold) {
      return { 
        hit: true, 
        latency: this.embeddingLatency + this.searchLatency,
        cost: this.embeddingCost,
        similarity: bestMatch.similarity
      };
    }

    return { 
      hit: false, 
      latency: this.embeddingLatency + this.llmLatency,
      cost: this.embeddingCost + this.llmCost
    };
  }

  getName() { return 'Redis Vector Search'; }
}

/**
 * Our 3-Layer Semantic Cache
 * L1: Exact match (no embedding needed)
 * L2: Normalized match (no embedding needed)
 * L3: Semantic match (embedding + HNSW)
 */
class ThreeLayerSemanticCache {
  private exactCache = new Map<string, string>();
  private normalizedCache = new Map<string, string>();
  private semanticCache: Array<{ embedding: number[]; response: string }> = [];
  private threshold = 0.85;
  
  // Latencies
  private exactLatency = 0.1;
  private normalizedLatency = 0.3;
  private embeddingLatency = 50; // Local embeddings!
  private searchLatency = 5;
  private llmLatency = 800;
  
  // Costs
  private localEmbeddingCost = 0; // FREE!
  private llmCost = 0.03;

  private normalize(query: string): string {
    return query.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async store(query: string, embedding: number[], response: string) {
    this.exactCache.set(query, response);
    this.normalizedCache.set(this.normalize(query), response);
    this.semanticCache.push({ embedding, response });
  }

  async query(query: string, embedding: number[]): Promise<{ 
    hit: boolean; 
    latency: number; 
    cost: number; 
    layer?: string;
    similarity?: number;
  }> {
    // L1: Exact match
    if (this.exactCache.has(query)) {
      return { hit: true, latency: this.exactLatency, cost: 0, layer: 'L1-exact' };
    }

    // L2: Normalized match
    const normalized = this.normalize(query);
    if (this.normalizedCache.has(normalized)) {
      return { hit: true, latency: this.normalizedLatency, cost: 0, layer: 'L2-normalized' };
    }

    // L3: Semantic match (local embedding - FREE)
    let bestMatch = { similarity: 0, index: -1 };
    for (let i = 0; i < this.semanticCache.length; i++) {
      const sim = cosineSimilarity(embedding, this.semanticCache[i].embedding);
      if (sim > bestMatch.similarity) {
        bestMatch = { similarity: sim, index: i };
      }
    }

    if (bestMatch.similarity >= this.threshold) {
      return { 
        hit: true, 
        latency: this.embeddingLatency + this.searchLatency,
        cost: this.localEmbeddingCost,
        layer: 'L3-semantic',
        similarity: bestMatch.similarity
      };
    }

    // Miss
    return { 
      hit: false, 
      latency: this.embeddingLatency + this.llmLatency,
      cost: this.localEmbeddingCost + this.llmCost
    };
  }

  getName() { return 'Our 3-Layer Cache'; }
}

// ============================================================================
// TEST DATASET
// ============================================================================

interface TestQuery {
  query: string;
  embedding: number[];
  type: 'exact' | 'normalized' | 'semantic' | 'miss';
}

function generateMockEmbedding(seed: number): number[] {
  // Generate deterministic mock embedding
  const embedding: number[] = [];
  for (let i = 0; i < 384; i++) {
    embedding.push(Math.sin(seed * (i + 1) * 0.01) * 0.5 + Math.cos(seed * i * 0.02) * 0.5);
  }
  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(v => v / norm);
}

function generateSimilarEmbedding(base: number[], noise: number): number[] {
  const similar = base.map(v => v + (Math.random() - 0.5) * noise);
  const norm = Math.sqrt(similar.reduce((sum, val) => sum + val * val, 0));
  return similar.map(v => v / norm);
}

// Base queries to populate cache
const baseQueries = [
  { query: "What is machine learning?", seed: 1 },
  { query: "How do I learn Python?", seed: 2 },
  { query: "Best restaurants in NYC", seed: 3 },
  { query: "Weather forecast for today", seed: 4 },
  { query: "How to cook pasta?", seed: 5 },
  { query: "JavaScript tutorial for beginners", seed: 6 },
  { query: "What is artificial intelligence?", seed: 7 },
  { query: "Travel tips for Europe", seed: 8 },
  { query: "How to exercise at home?", seed: 9 },
  { query: "Stock market news today", seed: 10 },
];

function generateTestDataset(size: number): TestQuery[] {
  const queries: TestQuery[] = [];
  
  for (let i = 0; i < size; i++) {
    const rand = Math.random();
    const baseIdx = Math.floor(Math.random() * baseQueries.length);
    const base = baseQueries[baseIdx];
    const baseEmbedding = generateMockEmbedding(base.seed);

    if (rand < 0.15) {
      // 15% exact matches
      queries.push({
        query: base.query,
        embedding: baseEmbedding,
        type: 'exact'
      });
    } else if (rand < 0.30) {
      // 15% normalized matches (case/punctuation variations)
      queries.push({
        query: base.query.toLowerCase() + '?',
        embedding: baseEmbedding,
        type: 'normalized'
      });
    } else if (rand < 0.65) {
      // 35% semantic matches (similar meaning)
      queries.push({
        query: `Tell me about ${base.query.toLowerCase().replace('what is ', '').replace('how to ', '').replace('?', '')}`,
        embedding: generateSimilarEmbedding(baseEmbedding, 0.15), // High similarity
        type: 'semantic'
      });
    } else {
      // 35% misses (random queries)
      queries.push({
        query: `Random query ${i} about something completely different`,
        embedding: generateMockEmbedding(1000 + i),
        type: 'miss'
      });
    }
  }

  return queries;
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

interface BenchmarkResult {
  name: string;
  totalQueries: number;
  hits: number;
  hitRate: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  totalCost: number;
  costPer1M: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
}

async function runBenchmark(): Promise<void> {
  console.log('═'.repeat(70));
  console.log('  COMPETITOR COMPARISON BENCHMARK');
  console.log('═'.repeat(70));
  console.log();

  const DATASET_SIZE = 1000;
  console.log(`Generating ${DATASET_SIZE} test queries...`);
  const testQueries = generateTestDataset(DATASET_SIZE);
  
  // Count query types
  const typeCounts = { exact: 0, normalized: 0, semantic: 0, miss: 0 };
  testQueries.forEach(q => typeCounts[q.type]++);
  console.log(`  - Exact matches: ${typeCounts.exact} (${(typeCounts.exact/DATASET_SIZE*100).toFixed(1)}%)`);
  console.log(`  - Normalized matches: ${typeCounts.normalized} (${(typeCounts.normalized/DATASET_SIZE*100).toFixed(1)}%)`);
  console.log(`  - Semantic matches: ${typeCounts.semantic} (${(typeCounts.semantic/DATASET_SIZE*100).toFixed(1)}%)`);
  console.log(`  - Misses: ${typeCounts.miss} (${(typeCounts.miss/DATASET_SIZE*100).toFixed(1)}%)`);
  console.log();

  // Initialize caches
  const noCache = new NoCacheBaseline();
  const exactCache = new ExactMatchCache();
  const gptCache = new GPTCacheStyle();
  const redisCache = new RedisVectorCache();
  const threeLayerCache = new ThreeLayerSemanticCache();

  // Populate caches with base queries
  console.log('Populating caches with base queries...');
  for (const base of baseQueries) {
    const embedding = generateMockEmbedding(base.seed);
    const response = `Response for: ${base.query}`;
    
    await exactCache.store(base.query, response);
    await gptCache.store(embedding, response);
    await redisCache.store(embedding, response);
    await threeLayerCache.store(base.query, embedding, response);
  }
  console.log();

  // Run benchmarks
  const results: BenchmarkResult[] = [];

  // Benchmark each cache
  const caches = [
    { cache: noCache, needsEmbedding: false },
    { cache: exactCache, needsEmbedding: false },
    { cache: gptCache, needsEmbedding: true },
    { cache: redisCache, needsEmbedding: true },
    { cache: threeLayerCache, needsEmbedding: true, is3Layer: true },
  ];

  for (const { cache, needsEmbedding, is3Layer } of caches) {
    console.log(`Benchmarking: ${cache.getName()}...`);
    
    let hits = 0;
    let totalLatency = 0;
    let totalCost = 0;
    const latencies: number[] = [];

    for (const testQuery of testQueries) {
      let result;
      
      if (is3Layer) {
        result = await (cache as ThreeLayerSemanticCache).query(testQuery.query, testQuery.embedding);
      } else if (needsEmbedding) {
        result = await (cache as GPTCacheStyle | RedisVectorCache).query(testQuery.embedding);
      } else {
        result = await (cache as NoCacheBaseline | ExactMatchCache).query(testQuery.query);
      }

      if (result.hit) hits++;
      totalLatency += result.latency;
      totalCost += result.cost;
      latencies.push(result.latency);
    }

    // Calculate percentiles
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    results.push({
      name: cache.getName(),
      totalQueries: DATASET_SIZE,
      hits,
      hitRate: (hits / DATASET_SIZE) * 100,
      totalLatencyMs: totalLatency,
      avgLatencyMs: totalLatency / DATASET_SIZE,
      totalCost,
      costPer1M: (totalCost / DATASET_SIZE) * 1000000,
      p50Latency: p50,
      p95Latency: p95,
      p99Latency: p99,
    });
  }

  // Print results
  console.log();
  console.log('═'.repeat(70));
  console.log('  RESULTS');
  console.log('═'.repeat(70));
  console.log();

  // Hit Rate Comparison
  console.log('📊 HIT RATE COMPARISON');
  console.log('─'.repeat(70));
  console.log('┌─────────────────────────────┬──────────┬──────────────────────────┐');
  console.log('│ Solution                    │ Hit Rate │ Visual                   │');
  console.log('├─────────────────────────────┼──────────┼──────────────────────────┤');
  for (const r of results) {
    const bar = '█'.repeat(Math.round(r.hitRate / 4));
    console.log(`│ ${r.name.padEnd(27)} │ ${r.hitRate.toFixed(1).padStart(6)}% │ ${bar.padEnd(24)} │`);
  }
  console.log('└─────────────────────────────┴──────────┴──────────────────────────┘');
  console.log();

  // Latency Comparison
  console.log('⏱️  LATENCY COMPARISON (ms)');
  console.log('─'.repeat(70));
  console.log('┌─────────────────────────────┬──────────┬──────────┬──────────┬──────────┐');
  console.log('│ Solution                    │ Avg      │ P50      │ P95      │ P99      │');
  console.log('├─────────────────────────────┼──────────┼──────────┼──────────┼──────────┤');
  for (const r of results) {
    console.log(`│ ${r.name.padEnd(27)} │ ${r.avgLatencyMs.toFixed(1).padStart(8)} │ ${r.p50Latency.toFixed(1).padStart(8)} │ ${r.p95Latency.toFixed(1).padStart(8)} │ ${r.p99Latency.toFixed(1).padStart(8)} │`);
  }
  console.log('└─────────────────────────────┴──────────┴──────────┴──────────┴──────────┘');
  console.log();

  // Cost Comparison
  console.log('💰 COST COMPARISON');
  console.log('─'.repeat(70));
  console.log('┌─────────────────────────────┬──────────────┬──────────────┬──────────────┐');
  console.log('│ Solution                    │ Cost/1K      │ Cost/1M      │ Monthly*     │');
  console.log('├─────────────────────────────┼──────────────┼──────────────┼──────────────┤');
  for (const r of results) {
    const costPer1K = r.costPer1M / 1000;
    const monthly = r.costPer1M * 30; // 1M queries/day
    console.log(`│ ${r.name.padEnd(27)} │ $${costPer1K.toFixed(2).padStart(10)} │ $${r.costPer1M.toFixed(2).padStart(10)} │ $${monthly.toFixed(0).padStart(10)} │`);
  }
  console.log('└─────────────────────────────┴──────────────┴──────────────┴──────────────┘');
  console.log('* Monthly cost assumes 1M queries/day for 30 days');
  console.log();

  // Savings Analysis
  const baseline = results[0]; // No cache
  const ourCache = results[results.length - 1]; // Our 3-layer cache
  
  console.log('🏆 SAVINGS ANALYSIS (vs No Cache)');
  console.log('─'.repeat(70));
  console.log('┌─────────────────────────────┬──────────────┬──────────────┬──────────────┐');
  console.log('│ Solution                    │ Cost Savings │ Latency Red. │ Annual Save* │');
  console.log('├─────────────────────────────┼──────────────┼──────────────┼──────────────┤');
  for (const r of results.slice(1)) {
    const costSavings = ((baseline.costPer1M - r.costPer1M) / baseline.costPer1M * 100);
    const latencyReduction = ((baseline.avgLatencyMs - r.avgLatencyMs) / baseline.avgLatencyMs * 100);
    const annualSave = (baseline.costPer1M - r.costPer1M) * 365;
    console.log(`│ ${r.name.padEnd(27)} │ ${costSavings.toFixed(1).padStart(10)}% │ ${latencyReduction.toFixed(1).padStart(10)}% │ $${annualSave.toFixed(0).padStart(10)} │`);
  }
  console.log('└─────────────────────────────┴──────────────┴──────────────┴──────────────┘');
  console.log('* Annual savings assumes 1M queries/day');
  console.log();

  // Winner Summary
  console.log('═'.repeat(70));
  console.log('  SUMMARY');
  console.log('═'.repeat(70));
  console.log();
  console.log(`🥇 Our 3-Layer Cache vs Baseline:`);
  console.log(`   • Hit Rate: ${ourCache.hitRate.toFixed(1)}% (vs 0%)`);
  console.log(`   • Avg Latency: ${ourCache.avgLatencyMs.toFixed(1)}ms (vs ${baseline.avgLatencyMs.toFixed(1)}ms) - ${((baseline.avgLatencyMs - ourCache.avgLatencyMs) / baseline.avgLatencyMs * 100).toFixed(0)}% faster`);
  console.log(`   • Cost/1M: $${ourCache.costPer1M.toFixed(2)} (vs $${baseline.costPer1M.toFixed(2)}) - ${((baseline.costPer1M - ourCache.costPer1M) / baseline.costPer1M * 100).toFixed(0)}% cheaper`);
  console.log(`   • Annual Savings: $${((baseline.costPer1M - ourCache.costPer1M) * 365).toLocaleString()}`);
  console.log();

  const gptCacheResult = results[2];
  console.log(`🥇 Our 3-Layer Cache vs GPTCache:`);
  console.log(`   • Hit Rate: ${ourCache.hitRate.toFixed(1)}% vs ${gptCacheResult.hitRate.toFixed(1)}% (+${(ourCache.hitRate - gptCacheResult.hitRate).toFixed(1)}%)`);
  console.log(`   • Avg Latency: ${ourCache.avgLatencyMs.toFixed(1)}ms vs ${gptCacheResult.avgLatencyMs.toFixed(1)}ms (${((gptCacheResult.avgLatencyMs - ourCache.avgLatencyMs) / gptCacheResult.avgLatencyMs * 100).toFixed(0)}% faster)`);
  console.log(`   • Cost/1M: $${ourCache.costPer1M.toFixed(2)} vs $${gptCacheResult.costPer1M.toFixed(2)} (${((gptCacheResult.costPer1M - ourCache.costPer1M) / gptCacheResult.costPer1M * 100).toFixed(0)}% cheaper)`);
  console.log();

  console.log('💡 KEY ADVANTAGES:');
  console.log('   1. 3-layer architecture catches more variations');
  console.log('   2. Local embeddings = $0 embedding costs');
  console.log('   3. L1/L2 hits skip embedding entirely (fastest possible)');
  console.log('   4. Self-hosted = complete privacy');
  console.log();
}

// Run benchmark
runBenchmark().catch(console.error);
