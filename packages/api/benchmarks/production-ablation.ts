/**
 * Production-Realistic Ablation Study
 * 
 * Simulates realistic production traffic patterns:
 * - 40% repeated queries (power law - some queries very popular)
 * - 30% paraphrased queries (same intent, different wording)
 * - 30% unique queries (never seen before)
 * 
 * This matches real-world LLM API traffic patterns.
 * 
 * Usage:
 *   npx tsx benchmarks/production-ablation.ts
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
  cacheSize: 1000,
  testSize: 5000,
  baseThreshold: 0.85,
  embeddingDim: 384,
  
  // Traffic patterns (should sum to 1.0)
  exactRepeatRate: 0.40,    // Exact same query repeated
  paraphraseRate: 0.30,     // Same intent, different words
  uniqueRate: 0.30,         // Never seen before
};

// ============================================================================
// EMBEDDING & SIMILARITY
// ============================================================================

function simpleEmbedding(text: string, dim: number): number[] {
  const normalized = text.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  const vec = new Array(dim).fill(0);
  
  for (const word of words) {
    for (let i = 0; i < word.length - 1; i++) {
      const bigram = word.substring(i, i + 2);
      const hash = (bigram.charCodeAt(0) * 31 + bigram.charCodeAt(1)) % dim;
      vec[hash] += 1;
    }
  }
  
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
// LOAD & PREPARE DATA
// ============================================================================

interface Dataset {
  queries: string[];
}

function loadDataset(): string[] {
  const datasetPath = path.join(__dirname, 'dataset-alpaca.json');
  
  if (!fs.existsSync(datasetPath)) {
    console.error('❌ Dataset not found! Run: npx tsx benchmarks/download-dataset.ts alpaca');
    process.exit(1);
  }
  
  const data: Dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  return data.queries;
}

// Paraphrase templates to create realistic variations
const PARAPHRASE_PREFIXES = [
  'Can you ', 'Please ', 'I need you to ', 'Help me ', 'I want to know ',
  'Tell me ', 'Explain ', 'What is ', 'How do I ', 'Could you '
];

const PARAPHRASE_SUFFIXES = [
  '', '?', ' please', ' for me', ' thanks', ' now', ' quickly'
];

function paraphrase(text: string): string {
  // Remove common prefixes
  let modified = text
    .replace(/^(can you |please |help me |tell me |explain |what is |how do i )/i, '')
    .replace(/[?.!]+$/, '');
  
  // Add new prefix/suffix
  const prefix = PARAPHRASE_PREFIXES[Math.floor(Math.random() * PARAPHRASE_PREFIXES.length)];
  const suffix = PARAPHRASE_SUFFIXES[Math.floor(Math.random() * PARAPHRASE_SUFFIXES.length)];
  
  return prefix + modified.charAt(0).toLowerCase() + modified.slice(1) + suffix;
}

// ============================================================================
// ABLATION CONFIGS
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
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '═'.repeat(100));
  console.log('PRODUCTION-REALISTIC ABLATION STUDY');
  console.log('═'.repeat(100) + '\n');
  
  // Load base dataset
  const allQueries = loadDataset();
  console.log(`📂 Loaded ${allQueries.length} base queries`);
  
  // Build cache from first N queries
  const cacheQueries = allQueries.slice(0, CONFIG.cacheSize);
  
  console.log('\n📊 Traffic Pattern Simulation:');
  console.log(`   ${(CONFIG.exactRepeatRate * 100).toFixed(0)}% exact repeats (popular queries)`);
  console.log(`   ${(CONFIG.paraphraseRate * 100).toFixed(0)}% paraphrases (same intent, different words)`);
  console.log(`   ${(CONFIG.uniqueRate * 100).toFixed(0)}% unique queries (never seen)\n`);
  
  // Prepare cache entries
  console.log('⚙️  Building cache...');
  interface CacheEntry {
    text: string;
    normalized: string;
    embedding: number[];
    response: string;
  }
  
  const cacheEntries: CacheEntry[] = cacheQueries.map((text, i) => ({
    text,
    normalized: normalizeQuery(text),
    embedding: simpleEmbedding(text, CONFIG.embeddingDim),
    response: `Response ${i}`,
  }));
  
  // Generate test queries following power-law distribution for repeats
  console.log('⚙️  Generating test traffic...');
  
  interface TestQuery {
    text: string;
    normalized: string;
    embedding: number[];
    type: 'exact' | 'paraphrase' | 'unique';
  }
  
  const testQueries: TestQuery[] = [];
  
  // Exact repeats (power-law: some queries much more popular)
  const exactCount = Math.floor(CONFIG.testSize * CONFIG.exactRepeatRate);
  for (let i = 0; i < exactCount; i++) {
    // Power-law: index = floor(random^2 * cacheSize) favors lower indices
    const idx = Math.floor(Math.pow(Math.random(), 2) * cacheEntries.length);
    const entry = cacheEntries[idx];
    testQueries.push({
      text: entry.text,
      normalized: entry.normalized,
      embedding: entry.embedding,
      type: 'exact',
    });
  }
  
  // Paraphrases
  const paraphraseCount = Math.floor(CONFIG.testSize * CONFIG.paraphraseRate);
  for (let i = 0; i < paraphraseCount; i++) {
    const idx = Math.floor(Math.random() * cacheEntries.length);
    const entry = cacheEntries[idx];
    const paraphrasedText = paraphrase(entry.text);
    testQueries.push({
      text: paraphrasedText,
      normalized: normalizeQuery(paraphrasedText),
      embedding: simpleEmbedding(paraphrasedText, CONFIG.embeddingDim),
      type: 'paraphrase',
    });
  }
  
  // Unique queries
  const uniqueQueries = allQueries.slice(CONFIG.cacheSize);
  const uniqueCount = CONFIG.testSize - exactCount - paraphraseCount;
  for (let i = 0; i < uniqueCount; i++) {
    const text = uniqueQueries[i % uniqueQueries.length];
    testQueries.push({
      text,
      normalized: normalizeQuery(text),
      embedding: simpleEmbedding(text, CONFIG.embeddingDim),
      type: 'unique',
    });
  }
  
  // Shuffle
  for (let i = testQueries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [testQueries[i], testQueries[j]] = [testQueries[j], testQueries[i]];
  }
  
  console.log(`   Generated ${testQueries.length} test queries\n`);
  
  // Run ablation for each configuration
  console.log('🔬 Running Ablation Study...\n');
  
  interface Result {
    name: string;
    hitRate: number;
    exactHits: number;
    normalizedHits: number;
    semanticHits: number;
    misses: number;
    avgLatency: number;
    p50Latency: number;
    p95Latency: number;
    byType: { exact: number; paraphrase: number; unique: number };
  }
  
  const results: Result[] = [];
  
  for (const config of CONFIGURATIONS) {
    process.stdout.write(`   ${config.name.padEnd(35)}`);
    
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
    const hitsByType = { exact: 0, paraphrase: 0, unique: 0 };
    
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
        
        if (config.useHNSW && hnswIndex) {
          const results = hnswIndex.search(query.embedding, 10);
          for (const result of results) {
            if (result.similarity > bestSimilarity) {
              bestSimilarity = result.similarity;
            }
          }
        } else {
          for (const entry of cacheEntries) {
            const sim = cosineSimilarity(query.embedding, entry.embedding);
            if (sim > bestSimilarity) {
              bestSimilarity = sim;
            }
          }
        }
        
        if (bestSimilarity >= threshold) {
          if (config.useConfidence) {
            const confidence = calculateConfidence(bestSimilarity, CacheLayer.SEMANTIC_MATCH, query.text.length);
            if (confidence.score >= 0.7) {
              semanticHits++;
              hit = true;
            }
          } else {
            semanticHits++;
            hit = true;
          }
        }
      }
      
      if (hit) {
        hitsByType[query.type]++;
      } else {
        misses++;
      }
      
      latencies.push(performance.now() - start);
    }
    
    latencies.sort((a, b) => a - b);
    const total = testQueries.length;
    
    results.push({
      name: config.name,
      hitRate: (exactHits + normalizedHits + semanticHits) / total,
      exactHits,
      normalizedHits,
      semanticHits,
      misses,
      avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      p50Latency: latencies[Math.floor(latencies.length * 0.5)],
      p95Latency: latencies[Math.floor(latencies.length * 0.95)],
      byType: hitsByType,
    });
    
    console.log(`${(results[results.length - 1].hitRate * 100).toFixed(1)}% hit rate`);
  }
  
  // Print results
  console.log('\n' + '═'.repeat(100));
  console.log('RESULTS');
  console.log('═'.repeat(100) + '\n');
  
  console.log('┌' + '─'.repeat(36) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(12) + '┬' + '─'.repeat(10) + '┐');
  console.log('│' + ' Configuration'.padEnd(36) + '│' + ' Hit Rate'.padEnd(10) + '│' + ' Exact'.padEnd(10) + '│' + ' Norm'.padEnd(10) + '│' + ' Semantic'.padEnd(12) + '│' + ' Miss'.padEnd(10) + '│');
  console.log('├' + '─'.repeat(36) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(12) + '┼' + '─'.repeat(10) + '┤');
  
  for (const r of results) {
    console.log(
      '│' + ` ${r.name}`.padEnd(36) +
      '│' + ` ${(r.hitRate * 100).toFixed(1)}%`.padEnd(10) +
      '│' + ` ${r.exactHits}`.padEnd(10) +
      '│' + ` ${r.normalizedHits}`.padEnd(10) +
      '│' + ` ${r.semanticHits}`.padEnd(12) +
      '│' + ` ${r.misses}`.padEnd(10) + '│'
    );
  }
  console.log('└' + '─'.repeat(36) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(10) + '┘');
  
  // Hit rate by query type
  console.log('\n📊 Hit Rate by Query Type (Full System):');
  const full = results[results.length - 1];
  const exactTypeCount = testQueries.filter(q => q.type === 'exact').length;
  const paraphraseTypeCount = testQueries.filter(q => q.type === 'paraphrase').length;
  const uniqueTypeCount = testQueries.filter(q => q.type === 'unique').length;
  
  console.log(`   Exact repeats:   ${full.byType.exact}/${exactTypeCount} = ${(full.byType.exact / exactTypeCount * 100).toFixed(1)}%`);
  console.log(`   Paraphrases:     ${full.byType.paraphrase}/${paraphraseTypeCount} = ${(full.byType.paraphrase / paraphraseTypeCount * 100).toFixed(1)}%`);
  console.log(`   Unique queries:  ${full.byType.unique}/${uniqueTypeCount} = ${(full.byType.unique / uniqueTypeCount * 100).toFixed(1)}%`);
  
  // Summary
  console.log('\n' + '═'.repeat(100));
  console.log('SUMMARY FOR PAPER');
  console.log('═'.repeat(100) + '\n');
  
  const baseline = results[0];
  console.log(`  Baseline (Exact Match Only): ${(baseline.hitRate * 100).toFixed(1)}%`);
  console.log(`  + Normalization:             ${(results[1].hitRate * 100).toFixed(1)}% (Δ +${((results[1].hitRate - baseline.hitRate) * 100).toFixed(1)}%)`);
  console.log(`  + Semantic:                  ${(results[2].hitRate * 100).toFixed(1)}% (Δ +${((results[2].hitRate - results[1].hitRate) * 100).toFixed(1)}%)`);
  console.log(`  Full System:                 ${(full.hitRate * 100).toFixed(1)}%`);
  console.log(`\n  📈 Total Improvement: ${((full.hitRate - baseline.hitRate) * 100).toFixed(1)}% absolute`);
  console.log(`  🚀 Improvement Factor: ${(full.hitRate / baseline.hitRate).toFixed(2)}x over baseline\n`);
  
  // Save
  const outputPath = path.join(__dirname, 'production-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({ results, config: CONFIG }, null, 2));
  console.log(`📄 Results saved to: ${outputPath}\n`);
}

main().catch(console.error);
