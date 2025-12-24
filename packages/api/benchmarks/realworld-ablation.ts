/**
 * Real-World Dataset Ablation Study
 * 
 * Uses actual query datasets (Alpaca, ShareGPT, etc.) to validate
 * the semantic cache with realistic query patterns.
 * 
 * Prerequisites:
 *   npx tsx benchmarks/download-dataset.ts alpaca
 * 
 * Usage:
 *   npx tsx benchmarks/realworld-ablation.ts
 */

import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LRUCache } from '../src/lru-cache';
import { normalizeQuery } from '../src/normalize';
import { HNSWIndex } from '../src/hnsw-index';
import { ThresholdLearner } from '../src/threshold-learner';
import { calculateConfidence, CacheLayer } from '../src/confidence';
import { QueryType } from '../src/normalize';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Use first N queries to populate cache
  cacheSize: 2000,
  // Use remaining queries for testing
  testSize: 5000,
  // Similarity threshold
  baseThreshold: 0.85,
  // Embedding dimension (simulated)
  embeddingDim: 384,
  // For real embeddings, set to true and provide API key
  useRealEmbeddings: false,
};

// ============================================================================
// EMBEDDING SIMULATION
// ============================================================================

// Simple hash-based pseudo-embedding for testing
// In production, use real embeddings from OpenAI or local model
function simpleEmbedding(text: string, dim: number): number[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  
  // Create embedding based on character n-grams
  const vec = new Array(dim).fill(0);
  
  for (const word of words) {
    for (let i = 0; i < word.length - 1; i++) {
      const bigram = word.substring(i, i + 2);
      const hash = (bigram.charCodeAt(0) * 31 + bigram.charCodeAt(1)) % dim;
      vec[hash] += 1;
    }
  }
  
  // Normalize
  const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
  return vec.map(v => v / norm);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB)) || 0;
}

// ============================================================================
// LOAD DATASET
// ============================================================================

interface Dataset {
  source: string;
  description: string;
  count: number;
  queries: string[];
}

function loadDataset(): string[] {
  const datasetPath = path.join(__dirname, 'dataset-alpaca.json');
  
  if (!fs.existsSync(datasetPath)) {
    console.error('❌ Dataset not found!');
    console.log('\nRun this first:');
    console.log('  npx tsx benchmarks/download-dataset.ts alpaca\n');
    process.exit(1);
  }
  
  const data: Dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  console.log(`📂 Loaded ${data.count} queries from ${data.source}`);
  return data.queries;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

interface AblationConfig {
  name: string;
  useExact: boolean;
  useNormalized: boolean;
  useSemantic: boolean;
  useHNSW: boolean;
  useAdaptive: boolean;
  useConfidence: boolean;
}

const CONFIGURATIONS: AblationConfig[] = [
  { name: '1. Exact Only (Baseline)', useExact: true, useNormalized: false, useSemantic: false, useHNSW: false, useAdaptive: false, useConfidence: false },
  { name: '2. + Normalization', useExact: true, useNormalized: true, useSemantic: false, useHNSW: false, useAdaptive: false, useConfidence: false },
  { name: '3. + Semantic', useExact: true, useNormalized: true, useSemantic: true, useHNSW: false, useAdaptive: false, useConfidence: false },
  { name: '4. + HNSW', useExact: true, useNormalized: true, useSemantic: true, useHNSW: true, useAdaptive: false, useConfidence: false },
  { name: '5. + Adaptive', useExact: true, useNormalized: true, useSemantic: true, useHNSW: true, useAdaptive: true, useConfidence: false },
  { name: '6. Full System', useExact: true, useNormalized: true, useSemantic: true, useHNSW: true, useAdaptive: true, useConfidence: true },
];

// ============================================================================
// RUN ABLATION
// ============================================================================

interface CacheEntry {
  text: string;
  normalized: string;
  embedding: number[];
  response: string;
}

interface AblationResult {
  name: string;
  hitRate: number;
  exactHits: number;
  normalizedHits: number;
  semanticHits: number;
  misses: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
}

function runAblation(
  config: AblationConfig,
  cacheEntries: CacheEntry[],
  testQueries: { text: string; normalized: string; embedding: number[] }[]
): AblationResult {
  // Build caches
  const exactCache = new LRUCache<string, string>(CONFIG.cacheSize);
  const normalizedCache = new LRUCache<string, string>(CONFIG.cacheSize);
  let hnswIndex: HNSWIndex | null = null;
  const thresholdLearner = new ThresholdLearner();
  
  for (const entry of cacheEntries) {
    if (config.useExact) exactCache.set(entry.text, entry.response);
    if (config.useNormalized) normalizedCache.set(entry.normalized, entry.response);
  }
  
  if (config.useHNSW) {
    hnswIndex = new HNSWIndex();
    for (let i = 0; i < cacheEntries.length; i++) {
      hnswIndex.insert(String(i), cacheEntries[i].embedding);
    }
  }
  
  // Run queries
  let exactHits = 0;
  let normalizedHits = 0;
  let semanticHits = 0;
  let misses = 0;
  const latencies: number[] = [];
  
  for (const query of testQueries) {
    const start = performance.now();
    let hit = false;
    
    // Layer 1: Exact
    if (config.useExact && exactCache.get(query.text) !== undefined) {
      exactHits++;
      hit = true;
    }
    
    // Layer 2: Normalized
    if (!hit && config.useNormalized && normalizedCache.get(query.normalized) !== undefined) {
      normalizedHits++;
      hit = true;
    }
    
    // Layer 3: Semantic
    if (!hit && config.useSemantic) {
      let threshold = CONFIG.baseThreshold;
      if (config.useAdaptive) {
        threshold = thresholdLearner.getThreshold(QueryType.QUESTION, query.text.length);
      }
      
      let bestSimilarity = 0;
      let bestIdx = -1;
      
      if (config.useHNSW && hnswIndex) {
        const results = hnswIndex.search(query.embedding, 10);
        for (const result of results) {
          if (result.similarity > bestSimilarity) {
            bestSimilarity = result.similarity;
            bestIdx = parseInt(result.id);
          }
        }
      } else {
        for (let i = 0; i < cacheEntries.length; i++) {
          const sim = cosineSimilarity(query.embedding, cacheEntries[i].embedding);
          if (sim > bestSimilarity) {
            bestSimilarity = sim;
            bestIdx = i;
          }
        }
      }
      
      if (bestSimilarity >= threshold) {
        if (config.useConfidence) {
          const confidence = calculateConfidence(bestSimilarity, CacheLayer.SEMANTIC_MATCH, query.text.length);
          if (confidence.score >= 0.7) {
            semanticHits++;
            hit = true;
            if (config.useAdaptive) {
              thresholdLearner.recordSuccess(QueryType.QUESTION, bestSimilarity);
            }
          }
        } else {
          semanticHits++;
          hit = true;
        }
      }
    }
    
    if (!hit) misses++;
    latencies.push(performance.now() - start);
  }
  
  latencies.sort((a, b) => a - b);
  const total = testQueries.length;
  
  return {
    name: config.name,
    hitRate: (exactHits + normalizedHits + semanticHits) / total,
    exactHits,
    normalizedHits,
    semanticHits,
    misses,
    avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    p50Latency: latencies[Math.floor(latencies.length * 0.5)],
    p95Latency: latencies[Math.floor(latencies.length * 0.95)],
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '═'.repeat(100));
  console.log('REAL-WORLD DATASET ABLATION STUDY');
  console.log('═'.repeat(100) + '\n');
  
  // Load dataset
  const allQueries = loadDataset();
  
  // Split into cache and test sets
  const cacheQueries = allQueries.slice(0, CONFIG.cacheSize);
  const testQueries = allQueries.slice(CONFIG.cacheSize, CONFIG.cacheSize + CONFIG.testSize);
  
  console.log(`\n📊 Dataset Split:`);
  console.log(`   Cache entries: ${cacheQueries.length}`);
  console.log(`   Test queries: ${testQueries.length}`);
  
  // Prepare cache entries
  console.log('\n⚙️  Generating embeddings for cache...');
  const cacheEntries: CacheEntry[] = cacheQueries.map((text, i) => ({
    text,
    normalized: normalizeQuery(text),
    embedding: simpleEmbedding(text, CONFIG.embeddingDim),
    response: `Response ${i}`,
  }));
  
  // Prepare test queries
  console.log('⚙️  Generating embeddings for test queries...');
  const testData = testQueries.map(text => ({
    text,
    normalized: normalizeQuery(text),
    embedding: simpleEmbedding(text, CONFIG.embeddingDim),
  }));
  
  // Run ablation
  console.log('\n🔬 Running Ablation Study...\n');
  const results: AblationResult[] = [];
  
  for (const config of CONFIGURATIONS) {
    process.stdout.write(`   ${config.name.padEnd(35)}`);
    const result = runAblation(config, cacheEntries, testData);
    results.push(result);
    console.log(`${(result.hitRate * 100).toFixed(1)}% hit rate`);
  }
  
  // Print results
  console.log('\n' + '═'.repeat(100));
  console.log('RESULTS');
  console.log('═'.repeat(100) + '\n');
  
  console.log('┌' + '─'.repeat(40) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(12) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(12) + '┬' + '─'.repeat(10) + '┐');
  console.log('│' + ' Configuration'.padEnd(40) + '│' + ' Hit Rate'.padEnd(10) + '│' + ' Δ Hit Rate'.padEnd(12) + '│' + ' Exact'.padEnd(10) + '│' + ' Normalized'.padEnd(12) + '│' + ' Semantic'.padEnd(10) + '│');
  console.log('├' + '─'.repeat(40) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(12) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(12) + '┼' + '─'.repeat(10) + '┤');
  
  let prevHitRate = 0;
  for (const r of results) {
    const delta = r.hitRate - prevHitRate;
    const deltaStr = prevHitRate === 0 ? '--' : (delta >= 0 ? '+' : '') + (delta * 100).toFixed(1) + '%';
    console.log(
      '│' + ` ${r.name}`.padEnd(40) +
      '│' + ` ${(r.hitRate * 100).toFixed(1)}%`.padEnd(10) +
      '│' + ` ${deltaStr}`.padEnd(12) +
      '│' + ` ${r.exactHits}`.padEnd(10) +
      '│' + ` ${r.normalizedHits}`.padEnd(12) +
      '│' + ` ${r.semanticHits}`.padEnd(10) + '│'
    );
    prevHitRate = r.hitRate;
  }
  console.log('└' + '─'.repeat(40) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(10) + '┘');
  
  // Latency table
  console.log('\n┌' + '─'.repeat(40) + '┬' + '─'.repeat(12) + '┬' + '─'.repeat(12) + '┬' + '─'.repeat(12) + '┐');
  console.log('│' + ' Configuration'.padEnd(40) + '│' + ' Avg (ms)'.padEnd(12) + '│' + ' P50 (ms)'.padEnd(12) + '│' + ' P95 (ms)'.padEnd(12) + '│');
  console.log('├' + '─'.repeat(40) + '┼' + '─'.repeat(12) + '┼' + '─'.repeat(12) + '┼' + '─'.repeat(12) + '┤');
  for (const r of results) {
    console.log(
      '│' + ` ${r.name}`.padEnd(40) +
      '│' + ` ${r.avgLatency.toFixed(3)}`.padEnd(12) +
      '│' + ` ${r.p50Latency.toFixed(3)}`.padEnd(12) +
      '│' + ` ${r.p95Latency.toFixed(3)}`.padEnd(12) + '│'
    );
  }
  console.log('└' + '─'.repeat(40) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(12) + '┘');
  
  // Key findings
  console.log('\n' + '═'.repeat(100));
  console.log('KEY FINDINGS (Real-World Data)');
  console.log('═'.repeat(100) + '\n');
  
  const baseline = results[0];
  const full = results[results.length - 1];
  
  console.log(`  📊 Baseline (Exact Match): ${(baseline.hitRate * 100).toFixed(1)}% hit rate`);
  console.log(`  📊 Full System: ${(full.hitRate * 100).toFixed(1)}% hit rate`);
  console.log(`  📈 Total Improvement: ${((full.hitRate - baseline.hitRate) * 100).toFixed(1)}%`);
  console.log(`  🚀 Improvement Factor: ${(full.hitRate / baseline.hitRate).toFixed(2)}x`);
  
  console.log('\n  ⚠️  Note: These results use simulated embeddings.');
  console.log('      For production accuracy, use real embeddings from OpenAI or local models.\n');
  
  // Save results
  const outputPath = path.join(__dirname, 'realworld-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({ results, config: CONFIG }, null, 2));
  console.log(`📄 Results saved to: ${outputPath}\n`);
}

main().catch(console.error);
