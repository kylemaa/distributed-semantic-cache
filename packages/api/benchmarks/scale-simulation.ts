/**
 * Scale Simulation Benchmark
 * 
 * Simulates horizontal scaling scenarios to validate the storage abstraction layer.
 * Tests performance characteristics at different scales without requiring
 * actual distributed infrastructure.
 * 
 * Usage:
 *   npx tsx benchmarks/scale-simulation.ts
 */

import { performance } from 'perf_hooks';
import { SQLiteStorage } from '../src/storage/sqlite-storage';
import { InMemoryKVCache } from '../src/storage/memory-cache';
import { InMemoryVectorStore } from '../src/storage/qdrant-store';
import type { CacheEntry } from '@distributed-semantic-cache/shared';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configuration
const SCALES = [100, 1000, 5000, 10000];
const EMBEDDING_DIM = 384;
const SEARCH_K = 5;
const SIMILARITY_THRESHOLD = 0.75;
const BENCHMARK_ITERATIONS = 500;

// ============================================================================
// UTILITIES
// ============================================================================

function generateEmbedding(seed: number): number[] {
  const embedding: number[] = new Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    embedding[i] = Math.sin(seed * 12.9898 + i * 78.233) * 0.5 + 0.5;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    norm += embedding[i] * embedding[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    embedding[i] /= norm;
  }
  return embedding;
}

function generateCacheEntry(index: number): CacheEntry {
  return {
    id: `entry-${index}`,
    query: `What is the answer to question number ${index}? This is a typical user query.`,
    embedding: generateEmbedding(index),
    response: `This is the response for question ${index}. It contains multiple sentences to simulate a real LLM response with paragraphs and detailed explanations about the topic at hand.`,
    timestamp: Date.now() + index,
    metadata: { index, benchmark: true },
  };
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

interface BenchmarkResult {
  scale: number;
  operation: string;
  throughput: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  memoryMB: number;
}

// ============================================================================
// BENCHMARK FUNCTIONS
// ============================================================================

async function benchmarkWrites(
  storage: SQLiteStorage,
  kvCache: InMemoryKVCache,
  vectorStore: InMemoryVectorStore,
  scale: number
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  
  for (let i = 0; i < scale; i++) {
    const entry = generateCacheEntry(i);
    const start = performance.now();
    
    // Simulate 3-layer write
    await storage.insertEntry(entry);
    await kvCache.set(`exact:${entry.query}`, entry.response);
    await kvCache.set(`norm:${entry.query.toLowerCase()}`, entry.response);
    await vectorStore.addVector(entry.id, entry.embedding, { query: entry.query });
    
    latencies.push(performance.now() - start);
    
    if ((i + 1) % 1000 === 0) {
      process.stdout.write(`\r    Writing: ${formatNumber(i + 1)} / ${formatNumber(scale)}`);
    }
  }
  
  const totalTime = latencies.reduce((a, b) => a + b, 0);
  const memUsage = process.memoryUsage();
  
  return {
    scale,
    operation: 'write',
    throughput: (latencies.length / totalTime) * 1000,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    memoryMB: memUsage.heapUsed / (1024 * 1024),
  };
}

async function benchmarkL1Reads(
  kvCache: InMemoryKVCache,
  scale: number,
  iterations: number
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const randomIndex = Math.floor(Math.random() * scale);
    const query = `What is the answer to question number ${randomIndex}? This is a typical user query.`;
    
    const start = performance.now();
    await kvCache.get(`exact:${query}`);
    latencies.push(performance.now() - start);
  }
  
  const totalTime = latencies.reduce((a, b) => a + b, 0);
  const memUsage = process.memoryUsage();
  
  return {
    scale,
    operation: 'L1-read',
    throughput: (latencies.length / totalTime) * 1000,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    memoryMB: memUsage.heapUsed / (1024 * 1024),
  };
}

async function benchmarkL3Reads(
  vectorStore: InMemoryVectorStore,
  scale: number,
  iterations: number
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const randomIndex = Math.floor(Math.random() * scale);
    // Slightly perturbed embedding to simulate similar but not exact query
    const queryEmbedding = generateEmbedding(randomIndex + 0.1 + Math.random() * 0.5);
    
    const start = performance.now();
    await vectorStore.search(queryEmbedding, SEARCH_K, SIMILARITY_THRESHOLD);
    latencies.push(performance.now() - start);
  }
  
  const totalTime = latencies.reduce((a, b) => a + b, 0);
  const memUsage = process.memoryUsage();
  
  return {
    scale,
    operation: 'L3-semantic',
    throughput: (latencies.length / totalTime) * 1000,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    memoryMB: memUsage.heapUsed / (1024 * 1024),
  };
}

async function benchmarkMixedWorkload(
  storage: SQLiteStorage,
  kvCache: InMemoryKVCache,
  vectorStore: InMemoryVectorStore,
  scale: number,
  iterations: number
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  
  // Mixed workload: 60% L1, 25% L3, 15% writes
  for (let i = 0; i < iterations; i++) {
    const randomIndex = Math.floor(Math.random() * scale);
    const roll = Math.random();
    
    const start = performance.now();
    
    if (roll < 0.60) {
      // L1 read
      const query = `What is the answer to question number ${randomIndex}? This is a typical user query.`;
      await kvCache.get(`exact:${query}`);
    } else if (roll < 0.85) {
      // L3 semantic search
      const queryEmbedding = generateEmbedding(randomIndex + Math.random());
      await vectorStore.search(queryEmbedding, SEARCH_K, SIMILARITY_THRESHOLD);
    } else {
      // Write
      const entry = generateCacheEntry(scale + i);
      await storage.insertEntry(entry);
      await kvCache.set(`exact:${entry.query}`, entry.response);
      await vectorStore.addVector(entry.id, entry.embedding, {});
    }
    
    latencies.push(performance.now() - start);
  }
  
  const totalTime = latencies.reduce((a, b) => a + b, 0);
  const memUsage = process.memoryUsage();
  
  return {
    scale,
    operation: 'mixed-workload',
    throughput: (latencies.length / totalTime) * 1000,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    memoryMB: memUsage.heapUsed / (1024 * 1024),
  };
}

async function benchmarkConcurrentReads(
  vectorStore: InMemoryVectorStore,
  scale: number,
  concurrency: number,
  iterations: number
): Promise<BenchmarkResult> {
  const latencies: number[] = [];
  const batches = Math.ceil(iterations / concurrency);
  
  for (let batch = 0; batch < batches; batch++) {
    const batchSize = Math.min(concurrency, iterations - batch * concurrency);
    const starts = Array(batchSize).fill(0).map(() => performance.now());
    
    await Promise.all(
      Array(batchSize).fill(0).map(async (_, i) => {
        const randomIndex = Math.floor(Math.random() * scale);
        const queryEmbedding = generateEmbedding(randomIndex + Math.random());
        await vectorStore.search(queryEmbedding, SEARCH_K, SIMILARITY_THRESHOLD);
        latencies.push(performance.now() - starts[i]);
      })
    );
  }
  
  const totalTime = latencies.reduce((a, b) => a + b, 0);
  const memUsage = process.memoryUsage();
  
  return {
    scale,
    operation: `concurrent-${concurrency}`,
    throughput: (latencies.length / totalTime) * 1000,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    memoryMB: memUsage.heapUsed / (1024 * 1024),
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║              DISTRIBUTED SEMANTIC CACHE - SCALE SIMULATION                     ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║  Testing storage abstraction layer at different scales                         ║
║  Backends: SQLite + In-Memory KV + In-Memory Vector Store                     ║
║                                                                                ║
║  Scales: ${SCALES.map(s => formatNumber(s)).join(', ').padEnd(58)}║
║  Embedding Dimension: ${EMBEDDING_DIM}                                               ║
║  Benchmark Iterations: ${BENCHMARK_ITERATIONS}                                              ║
║                                                                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
  `);
  
  const allResults: BenchmarkResult[] = [];
  
  for (const scale of SCALES) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`SCALE: ${formatNumber(scale)} entries`);
    console.log(`${'='.repeat(80)}`);
    
    // Create fresh storage for each scale
    const dbPath = path.join(os.tmpdir(), `scale-sim-${Date.now()}-${Math.random()}.db`);
    const storage = new SQLiteStorage({ path: dbPath });
    const kvCache = new InMemoryKVCache(scale * 2); // 2x for exact + normalized
    const vectorStore = new InMemoryVectorStore(EMBEDDING_DIM);
    
    await storage.initialize();
    await vectorStore.initialize();
    
    // Write benchmark
    console.log('\n📝 Write Benchmark');
    const writeResult = await benchmarkWrites(storage, kvCache, vectorStore, scale);
    console.log(`\r    Write: ${formatNumber(scale)} entries @ ${formatNumber(writeResult.throughput)}/s`);
    console.log(`    Latency: P50=${formatMs(writeResult.latencyP50)} P95=${formatMs(writeResult.latencyP95)} P99=${formatMs(writeResult.latencyP99)}`);
    allResults.push(writeResult);
    
    // L1 read benchmark
    console.log('\n⚡ L1 (Exact Match) Benchmark');
    const l1Result = await benchmarkL1Reads(kvCache, scale, BENCHMARK_ITERATIONS);
    console.log(`    L1 Read: ${formatNumber(l1Result.throughput)}/s`);
    console.log(`    Latency: P50=${formatMs(l1Result.latencyP50)} P95=${formatMs(l1Result.latencyP95)} P99=${formatMs(l1Result.latencyP99)}`);
    allResults.push(l1Result);
    
    // L3 semantic search benchmark
    console.log('\n🔍 L3 (Semantic Search) Benchmark');
    const l3Result = await benchmarkL3Reads(vectorStore, scale, BENCHMARK_ITERATIONS);
    console.log(`    L3 Search: ${formatNumber(l3Result.throughput)}/s`);
    console.log(`    Latency: P50=${formatMs(l3Result.latencyP50)} P95=${formatMs(l3Result.latencyP95)} P99=${formatMs(l3Result.latencyP99)}`);
    allResults.push(l3Result);
    
    // Mixed workload benchmark
    console.log('\n🔀 Mixed Workload (60% L1, 25% L3, 15% Write)');
    const mixedResult = await benchmarkMixedWorkload(storage, kvCache, vectorStore, scale, BENCHMARK_ITERATIONS);
    console.log(`    Mixed: ${formatNumber(mixedResult.throughput)}/s`);
    console.log(`    Latency: P50=${formatMs(mixedResult.latencyP50)} P95=${formatMs(mixedResult.latencyP95)} P99=${formatMs(mixedResult.latencyP99)}`);
    allResults.push(mixedResult);
    
    // Concurrent benchmark
    for (const concurrency of [10, 50]) {
      console.log(`\n🔄 Concurrent L3 Search (${concurrency} concurrent)`);
      const concurrentResult = await benchmarkConcurrentReads(vectorStore, scale, concurrency, BENCHMARK_ITERATIONS);
      console.log(`    Concurrent: ${formatNumber(concurrentResult.throughput)}/s`);
      console.log(`    Latency: P50=${formatMs(concurrentResult.latencyP50)} P95=${formatMs(concurrentResult.latencyP95)} P99=${formatMs(concurrentResult.latencyP99)}`);
      allResults.push(concurrentResult);
    }
    
    console.log(`\n    Memory Usage: ${writeResult.memoryMB.toFixed(1)}MB`);
    
    // Cleanup
    await storage.close();
    try {
      fs.unlinkSync(dbPath);
      fs.unlinkSync(`${dbPath}-journal`);
    } catch {}
  }
  
  // Summary
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(80)}\n`);
  
  console.log('Throughput by Scale:');
  console.log('-'.repeat(80));
  console.log(
    'Operation'.padEnd(20) +
    SCALES.map(s => formatNumber(s).padStart(12)).join('')
  );
  console.log('-'.repeat(80));
  
  const operations = ['write', 'L1-read', 'L3-semantic', 'mixed-workload'];
  for (const op of operations) {
    const row = SCALES.map(scale => {
      const result = allResults.find(r => r.scale === scale && r.operation === op);
      return result ? `${formatNumber(result.throughput)}/s` : 'N/A';
    });
    console.log(op.padEnd(20) + row.map(r => r.padStart(12)).join(''));
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log('SCALING ANALYSIS');
  console.log(`${'='.repeat(80)}\n`);
  
  // Analyze L3 scaling
  const l3Results = allResults.filter(r => r.operation === 'L3-semantic');
  const l3SmallScale = l3Results.find(r => r.scale === SCALES[0]);
  const l3LargeScale = l3Results.find(r => r.scale === SCALES[SCALES.length - 1]);
  
  if (l3SmallScale && l3LargeScale) {
    const scaleFactor = SCALES[SCALES.length - 1] / SCALES[0];
    const latencyIncrease = l3LargeScale.latencyP50 / l3SmallScale.latencyP50;
    const throughputDecrease = l3SmallScale.throughput / l3LargeScale.throughput;
    
    console.log(`L3 Semantic Search Scaling (${formatNumber(SCALES[0])} → ${formatNumber(SCALES[SCALES.length - 1])}):`);
    console.log(`  Scale Factor: ${scaleFactor.toFixed(0)}x more entries`);
    console.log(`  Latency Increase: ${latencyIncrease.toFixed(1)}x (${formatMs(l3SmallScale.latencyP50)} → ${formatMs(l3LargeScale.latencyP50)})`);
    console.log(`  Throughput Decrease: ${throughputDecrease.toFixed(1)}x`);
    console.log(`  Scaling Efficiency: ${(scaleFactor / latencyIncrease * 100).toFixed(0)}%`);
    
    if (latencyIncrease < scaleFactor * 0.5) {
      console.log(`  ✅ Sub-linear scaling - good for production!`);
    } else if (latencyIncrease < scaleFactor) {
      console.log(`  ⚠️ Linear scaling - consider Qdrant for larger scale`);
    } else {
      console.log(`  ❌ Super-linear scaling - need distributed vector DB`);
    }
  }
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                            RECOMMENDATIONS                                     ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║  Current Setup (SQLite + In-Memory):                                          ║
║  • Good for: Development, testing, <50K entries                               ║
║  • Limitations: Single-node only, memory-bound                                ║
║                                                                                ║
║  For Production Scale:                                                         ║
║  • Deploy with docker-compose.scale.yml (Redis + Qdrant)                      ║
║  • Redis: Distributed L1/L2 for horizontal scaling                            ║
║  • Qdrant: Production vector search with HNSW indexing                        ║
║                                                                                ║
║  For Enterprise:                                                               ║
║  • Deploy with docker-compose.postgres.yml (PostgreSQL + pgvector)            ║
║  • Managed database options (AWS RDS, Supabase, Neon)                         ║
║  • Full ACID compliance and SQL interface                                     ║
║                                                                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);
}

main().catch(console.error);
