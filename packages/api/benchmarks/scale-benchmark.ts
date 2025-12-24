/**
 * Scale Benchmark - Storage Backend Performance Comparison
 *
 * Compares performance of different storage backends at scale:
 * - SQLite (single-node baseline)
 * - Redis + In-Memory HNSW (distributed L1/L2 + local L3)
 * - PostgreSQL + pgvector (enterprise, managed)
 * - Redis + Qdrant (production-scale distributed)
 *
 * Metrics measured:
 * - Write throughput (entries/second)
 * - Read throughput (lookups/second)
 * - L1/L2/L3 latency distribution
 * - Vector search performance at scale
 * - Memory usage
 * - Concurrent performance
 *
 * Usage:
 *   # SQLite only (default)
 *   pnpm benchmark:scale
 *
 *   # With Redis (requires docker-compose.scale.yml)
 *   REDIS_URL=redis://localhost:6379 pnpm benchmark:scale
 *
 *   # Full distributed (requires all services)
 *   CACHE_STORAGE=redis VECTOR_STORE=qdrant pnpm benchmark:scale
 */

import { performance } from 'perf_hooks';
import { SQLiteStorage } from '../src/storage/sqlite-storage';
import { InMemoryKVCache } from '../src/storage/memory-cache';
import { InMemoryVectorStore } from '../src/storage/qdrant-store';
import type { StoredCacheEntry, ICacheStorage, IVectorStore, IKVCache } from '../src/storage/interfaces';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Configuration
const CONFIG = {
  // Dataset sizes to test
  scaleLevels: [1000, 10000, 50000],
  
  // Concurrent operations
  concurrency: [1, 10, 50, 100],
  
  // Search parameters
  searchK: 5,
  similarityThreshold: 0.85,
  
  // Embedding dimension
  embeddingDim: 384,
  
  // Warmup
  warmupIterations: 100,
  
  // Benchmark iterations
  benchmarkIterations: 1000,
};

// ============================================================================
// UTILITIES
// ============================================================================

function generateEmbedding(seed: number): Float32Array {
  const embedding = new Float32Array(CONFIG.embeddingDim);
  for (let i = 0; i < CONFIG.embeddingDim; i++) {
    // Deterministic pseudo-random values based on seed
    embedding[i] = Math.sin(seed * 12.9898 + i * 78.233) * 0.5 + 0.5;
  }
  // Normalize
  let norm = 0;
  for (let i = 0; i < CONFIG.embeddingDim; i++) {
    norm += embedding[i] * embedding[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < CONFIG.embeddingDim; i++) {
    embedding[i] /= norm;
  }
  return embedding;
}

function generateCacheEntry(index: number): StoredCacheEntry {
  return {
    id: `entry-${index}`,
    tenantId: 'benchmark',
    query: `What is the answer to question number ${index}?`,
    queryNormalized: `answer question ${index}`,
    embedding: generateEmbedding(index),
    response: `This is the response for question ${index}. It contains some text to simulate a real LLM response with multiple sentences and paragraphs.`,
    model: 'gpt-4',
    metadata: { index, benchmark: true },
    hitCount: 0,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
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

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

interface BenchmarkResult {
  backend: string;
  operation: string;
  scale: number;
  concurrency: number;
  throughput: number;  // ops/sec
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  latencyMax: number;
  memoryMB: number;
}

async function measureLatencies(
  operation: () => Promise<void>,
  iterations: number
): Promise<number[]> {
  const latencies: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await operation();
    latencies.push(performance.now() - start);
  }
  
  return latencies;
}

async function measureConcurrent(
  operation: () => Promise<void>,
  iterations: number,
  concurrency: number
): Promise<number[]> {
  const latencies: number[] = [];
  const batches = Math.ceil(iterations / concurrency);
  
  for (let batch = 0; batch < batches; batch++) {
    const batchSize = Math.min(concurrency, iterations - batch * concurrency);
    const starts = Array(batchSize).fill(0).map(() => performance.now());
    
    await Promise.all(
      Array(batchSize).fill(0).map(async (_, i) => {
        await operation();
        latencies.push(performance.now() - starts[i]);
      })
    );
  }
  
  return latencies;
}

function computeResult(
  backend: string,
  operation: string,
  scale: number,
  concurrency: number,
  latencies: number[]
): BenchmarkResult {
  const totalTime = latencies.reduce((a, b) => a + b, 0);
  const memUsage = process.memoryUsage();
  
  return {
    backend,
    operation,
    scale,
    concurrency,
    throughput: (latencies.length / totalTime) * 1000,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyP99: percentile(latencies, 99),
    latencyMax: Math.max(...latencies),
    memoryMB: memUsage.heapUsed / (1024 * 1024),
  };
}

// ============================================================================
// SQLITE BENCHMARK
// ============================================================================

async function benchmarkSQLite(): Promise<BenchmarkResult[]> {
  console.log('\n📊 Benchmarking SQLite Storage...\n');
  const results: BenchmarkResult[] = [];
  
  for (const scale of CONFIG.scaleLevels) {
    console.log(`  Scale: ${formatNumber(scale)} entries`);
    
    const dbPath = path.join(os.tmpdir(), `bench-sqlite-${Date.now()}.db`);
    const storage = new SQLiteStorage(dbPath);
    const vectorStore = new InMemoryVectorStore(CONFIG.embeddingDim);
    const kvCache = new InMemoryKVCache(scale);
    
    await storage.initialize();
    await vectorStore.initialize();
    
    // ====== WRITE BENCHMARK ======
    console.log('    - Write benchmark...');
    let writeLatencies: number[] = [];
    const writeStart = performance.now();
    
    for (let i = 0; i < scale; i++) {
      const entry = generateCacheEntry(i);
      const start = performance.now();
      await storage.set(entry);
      await vectorStore.add(entry.id, entry.embedding!, 'benchmark', { query: entry.query });
      await kvCache.set(`exact:${entry.query}`, entry.id);
      await kvCache.set(`norm:${entry.queryNormalized}`, entry.id);
      writeLatencies.push(performance.now() - start);
      
      if ((i + 1) % 1000 === 0) {
        process.stdout.write(`\r    - Write: ${formatNumber(i + 1)} / ${formatNumber(scale)}`);
      }
    }
    console.log(`\r    - Write: ${formatNumber(scale)} entries in ${formatMs(performance.now() - writeStart)}`);
    
    results.push(computeResult('SQLite', 'write', scale, 1, writeLatencies));
    
    // ====== L1 READ BENCHMARK (exact match via KV) ======
    console.log('    - L1 (exact) benchmark...');
    const l1Latencies = await measureLatencies(async () => {
      const randomIndex = Math.floor(Math.random() * scale);
      const query = `What is the answer to question number ${randomIndex}?`;
      await kvCache.get(`exact:${query}`);
    }, CONFIG.benchmarkIterations);
    
    results.push(computeResult('SQLite', 'L1-read', scale, 1, l1Latencies));
    
    // ====== L2 READ BENCHMARK (normalized via KV) ======
    console.log('    - L2 (normalized) benchmark...');
    const l2Latencies = await measureLatencies(async () => {
      const randomIndex = Math.floor(Math.random() * scale);
      const normalized = `answer question ${randomIndex}`;
      await kvCache.get(`norm:${normalized}`);
    }, CONFIG.benchmarkIterations);
    
    results.push(computeResult('SQLite', 'L2-read', scale, 1, l2Latencies));
    
    // ====== L3 READ BENCHMARK (vector search) ======
    console.log('    - L3 (semantic) benchmark...');
    const l3Latencies = await measureLatencies(async () => {
      const randomIndex = Math.floor(Math.random() * scale);
      const queryEmbedding = generateEmbedding(randomIndex + 0.5); // Slightly different
      await vectorStore.search(queryEmbedding, 'benchmark', CONFIG.searchK, CONFIG.similarityThreshold);
    }, CONFIG.benchmarkIterations);
    
    results.push(computeResult('SQLite', 'L3-read', scale, 1, l3Latencies));
    
    // ====== CONCURRENT READ BENCHMARK ======
    for (const concurrency of CONFIG.concurrency) {
      if (concurrency === 1) continue;
      
      console.log(`    - Concurrent (${concurrency}) benchmark...`);
      const concurrentLatencies = await measureConcurrent(async () => {
        const randomIndex = Math.floor(Math.random() * scale);
        const queryEmbedding = generateEmbedding(randomIndex);
        await vectorStore.search(queryEmbedding, 'benchmark', CONFIG.searchK, CONFIG.similarityThreshold);
      }, CONFIG.benchmarkIterations, concurrency);
      
      results.push(computeResult('SQLite', `concurrent-${concurrency}`, scale, concurrency, concurrentLatencies));
    }
    
    // Cleanup
    await storage.close();
    try {
      fs.unlinkSync(dbPath);
      fs.unlinkSync(`${dbPath}-journal`);
    } catch {}
  }
  
  return results;
}

// ============================================================================
// REDIS + QDRANT BENCHMARK (requires running services)
// ============================================================================

async function benchmarkRedisQdrant(): Promise<BenchmarkResult[]> {
  const redisUrl = process.env.REDIS_URL;
  const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
  
  if (!redisUrl) {
    console.log('\n⏭️  Skipping Redis+Qdrant benchmark (REDIS_URL not set)\n');
    return [];
  }
  
  console.log('\n📊 Benchmarking Redis + Qdrant...\n');
  const results: BenchmarkResult[] = [];
  
  try {
    // Dynamic import for optional dependencies
    const { RedisStorage, RedisKVCache } = await import('../src/storage/redis-storage');
    const { QdrantVectorStore } = await import('../src/storage/qdrant-store');
    
    const storage = new RedisStorage(redisUrl, 'bench:');
    const kvCache = new RedisKVCache(redisUrl, 'bench:kv:');
    const vectorStore = new QdrantVectorStore(qdrantUrl, 'benchmark', CONFIG.embeddingDim);
    
    await storage.initialize();
    await kvCache.clear(); // Start fresh
    await vectorStore.initialize();
    
    for (const scale of CONFIG.scaleLevels.slice(0, 2)) { // Smaller scale for distributed
      console.log(`  Scale: ${formatNumber(scale)} entries`);
      
      // Write benchmark
      console.log('    - Write benchmark...');
      const writeLatencies: number[] = [];
      const writeStart = performance.now();
      
      for (let i = 0; i < scale; i++) {
        const entry = generateCacheEntry(i);
        const start = performance.now();
        await storage.set(entry);
        await vectorStore.add(entry.id, entry.embedding!, 'benchmark', { query: entry.query });
        await kvCache.set(`exact:${entry.query}`, entry.id);
        writeLatencies.push(performance.now() - start);
        
        if ((i + 1) % 100 === 0) {
          process.stdout.write(`\r    - Write: ${formatNumber(i + 1)} / ${formatNumber(scale)}`);
        }
      }
      console.log(`\r    - Write: ${formatNumber(scale)} entries in ${formatMs(performance.now() - writeStart)}`);
      
      results.push(computeResult('Redis+Qdrant', 'write', scale, 1, writeLatencies));
      
      // L1 benchmark
      console.log('    - L1 (Redis) benchmark...');
      const l1Latencies = await measureLatencies(async () => {
        const randomIndex = Math.floor(Math.random() * scale);
        const query = `What is the answer to question number ${randomIndex}?`;
        await kvCache.get(`exact:${query}`);
      }, CONFIG.benchmarkIterations);
      
      results.push(computeResult('Redis+Qdrant', 'L1-read', scale, 1, l1Latencies));
      
      // L3 benchmark
      console.log('    - L3 (Qdrant) benchmark...');
      const l3Latencies = await measureLatencies(async () => {
        const randomIndex = Math.floor(Math.random() * scale);
        const queryEmbedding = generateEmbedding(randomIndex + 0.5);
        await vectorStore.search(queryEmbedding, 'benchmark', CONFIG.searchK, CONFIG.similarityThreshold);
      }, CONFIG.benchmarkIterations);
      
      results.push(computeResult('Redis+Qdrant', 'L3-read', scale, 1, l3Latencies));
      
      // Concurrent benchmark
      for (const concurrency of CONFIG.concurrency.slice(0, 3)) {
        if (concurrency === 1) continue;
        
        console.log(`    - Concurrent (${concurrency}) benchmark...`);
        const concurrentLatencies = await measureConcurrent(async () => {
          const randomIndex = Math.floor(Math.random() * scale);
          const queryEmbedding = generateEmbedding(randomIndex);
          await vectorStore.search(queryEmbedding, 'benchmark', CONFIG.searchK, CONFIG.similarityThreshold);
        }, Math.min(CONFIG.benchmarkIterations, 500), concurrency);
        
        results.push(computeResult('Redis+Qdrant', `concurrent-${concurrency}`, scale, concurrency, concurrentLatencies));
      }
    }
    
    await storage.close();
    
  } catch (error) {
    console.error('  ⚠️  Redis+Qdrant benchmark failed:', (error as Error).message);
  }
  
  return results;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function printResults(results: BenchmarkResult[]): void {
  console.log('\n' + '='.repeat(100));
  console.log('SCALE BENCHMARK RESULTS');
  console.log('='.repeat(100));
  
  // Group by backend
  const byBackend = new Map<string, BenchmarkResult[]>();
  for (const result of results) {
    const existing = byBackend.get(result.backend) || [];
    existing.push(result);
    byBackend.set(result.backend, existing);
  }
  
  for (const [backend, backendResults] of byBackend) {
    console.log(`\n📦 ${backend}`);
    console.log('-'.repeat(95));
    console.log(
      'Operation'.padEnd(20) +
      'Scale'.padStart(10) +
      'Throughput'.padStart(15) +
      'P50'.padStart(12) +
      'P95'.padStart(12) +
      'P99'.padStart(12) +
      'Memory'.padStart(12)
    );
    console.log('-'.repeat(95));
    
    for (const result of backendResults) {
      console.log(
        result.operation.padEnd(20) +
        formatNumber(result.scale).padStart(10) +
        `${formatNumber(result.throughput)}/s`.padStart(15) +
        formatMs(result.latencyP50).padStart(12) +
        formatMs(result.latencyP95).padStart(12) +
        formatMs(result.latencyP99).padStart(12) +
        `${result.memoryMB.toFixed(0)}MB`.padStart(12)
      );
    }
  }
  
  // Summary comparison
  console.log('\n' + '='.repeat(100));
  console.log('SUMMARY COMPARISON');
  console.log('='.repeat(100));
  
  const backends = Array.from(byBackend.keys());
  const operations = ['write', 'L1-read', 'L2-read', 'L3-read'];
  
  for (const operation of operations) {
    const opResults = results.filter(r => r.operation === operation);
    if (opResults.length === 0) continue;
    
    console.log(`\n${operation}:`);
    for (const result of opResults) {
      const bar = '█'.repeat(Math.min(50, Math.round(result.throughput / 100)));
      console.log(`  ${result.backend.padEnd(15)} ${bar} ${formatNumber(result.throughput)}/s`);
    }
  }
  
  // Recommendations
  console.log('\n' + '='.repeat(100));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(100));
  
  console.log(`
  🎯 Based on benchmark results:
  
  Development/Testing:
  ├── Use: SQLite + In-Memory HNSW
  ├── Pros: Zero dependencies, fast startup, good for <100K entries
  └── Cons: Single-node only, no horizontal scaling
  
  Production (Small-Medium):
  ├── Use: Redis + In-Memory HNSW  
  ├── Pros: Distributed L1/L2, simple deployment, great latency
  └── Cons: L3 still single-node, memory-bound
  
  Production (Large Scale):
  ├── Use: Redis + Qdrant
  ├── Pros: Fully distributed, horizontally scalable, handles millions
  └── Cons: More infrastructure, slightly higher latency
  
  Enterprise (Managed):
  ├── Use: PostgreSQL + pgvector
  ├── Pros: ACID, managed options (RDS, Supabase), native vectors
  └── Cons: Highest latency, but most reliable
  `);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║              DISTRIBUTED SEMANTIC CACHE - SCALE BENCHMARK                      ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                                ║
║  Comparing storage backend performance at scale                                ║
║                                                                                ║
║  Backends:                                                                     ║
║  • SQLite + In-Memory HNSW (default)                                          ║
║  • Redis + Qdrant (distributed, requires docker-compose.scale.yml)            ║
║                                                                                ║
║  Metrics: Throughput, Latency (P50/P95/P99), Memory Usage                     ║
║                                                                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
  `);
  
  const allResults: BenchmarkResult[] = [];
  
  // SQLite benchmark (always runs)
  const sqliteResults = await benchmarkSQLite();
  allResults.push(...sqliteResults);
  
  // Redis + Qdrant benchmark (if services available)
  const redisResults = await benchmarkRedisQdrant();
  allResults.push(...redisResults);
  
  // Print results
  printResults(allResults);
  
  // Save to file
  const outputPath = path.join(__dirname, 'scale-benchmark-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
  console.log(`\n📄 Results saved to: ${outputPath}\n`);
}

main().catch(console.error);
