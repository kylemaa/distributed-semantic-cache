/**
 * OpenAI Embeddings Ablation Study
 * 
 * Uses OpenAI's text-embedding-3-small for publication-quality results.
 * 
 * Cost estimate: ~$0.02-0.05 for 1500 embeddings
 * 
 * Usage:
 *   npx tsx benchmarks/openai-embeddings-ablation.ts
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
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  cacheSize: 500,
  testSize: 1000,
  baseThreshold: 0.85,
  embeddingDim: 1536,  // text-embedding-3-small
  
  exactRepeatRate: 0.40,
  paraphraseRate: 0.30,
  uniqueRate: 0.30,
  
  // OpenAI batch size
  batchSize: 100,
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in environment');
  process.exit(1);
}

// ============================================================================
// OPENAI EMBEDDINGS
// ============================================================================

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: texts,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
  }
  
  const data = await response.json();
  return data.data.map((d: any) => d.embedding);
}

async function getEmbedding(text: string): Promise<number[]> {
  const embeddings = await getEmbeddings([text]);
  return embeddings[0];
}

// ============================================================================
// UTILITIES
// ============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB)) || 0;
}

const PARAPHRASE_PREFIXES = [
  'Can you ', 'Please ', 'I need you to ', 'Help me ', 'I want to know ',
  'Tell me ', 'Explain ', 'What is ', 'How do I ', 'Could you '
];

const PARAPHRASE_SUFFIXES = ['', '?', ' please', ' for me', ' thanks'];

function paraphrase(text: string): string {
  let modified = text
    .replace(/^(can you |please |help me |tell me |explain |what is |how do i )/i, '')
    .replace(/[?.!]+$/, '');
  
  const prefix = PARAPHRASE_PREFIXES[Math.floor(Math.random() * PARAPHRASE_PREFIXES.length)];
  const suffix = PARAPHRASE_SUFFIXES[Math.floor(Math.random() * PARAPHRASE_SUFFIXES.length)];
  
  return prefix + modified.charAt(0).toLowerCase() + modified.slice(1) + suffix;
}

// ============================================================================
// LOAD DATASET
// ============================================================================

function loadDataset(): string[] {
  const datasetPath = path.join(__dirname, 'dataset-alpaca.json');
  
  if (!fs.existsSync(datasetPath)) {
    console.error('❌ Dataset not found! Run: npx tsx benchmarks/download-dataset.ts alpaca');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  return data.queries;
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
  console.log('OPENAI EMBEDDINGS ABLATION STUDY (text-embedding-3-small)');
  console.log('═'.repeat(100) + '\n');
  
  // Load dataset
  const allQueries = loadDataset();
  console.log(`📂 Loaded ${allQueries.length} queries from Alpaca`);
  
  const cacheQueries = allQueries.slice(0, CONFIG.cacheSize);
  const uniqueQueries = allQueries.slice(CONFIG.cacheSize, CONFIG.cacheSize + CONFIG.testSize);
  
  console.log(`\n📊 Configuration:`);
  console.log(`   Cache size: ${CONFIG.cacheSize}`);
  console.log(`   Test queries: ${CONFIG.testSize}`);
  console.log(`   Embedding model: text-embedding-3-small (${CONFIG.embeddingDim}d)`);
  console.log(`   Estimated cost: ~$0.02\n`);
  
  // Generate cache entries with embeddings
  console.log('⚙️  Generating embeddings for cache entries (batched)...');
  
  interface CacheEntry {
    text: string;
    normalized: string;
    embedding: number[];
    response: string;
  }
  
  const cacheEntries: CacheEntry[] = [];
  const startCache = performance.now();
  
  for (let i = 0; i < cacheQueries.length; i += CONFIG.batchSize) {
    const batch = cacheQueries.slice(i, i + CONFIG.batchSize);
    const embeddings = await getEmbeddings(batch);
    
    for (let j = 0; j < batch.length; j++) {
      cacheEntries.push({
        text: batch[j],
        normalized: normalizeQuery(batch[j]),
        embedding: embeddings[j],
        response: `Response ${i + j}`,
      });
    }
    
    console.log(`   ${Math.min(i + CONFIG.batchSize, cacheQueries.length)}/${cacheQueries.length}`);
  }
  console.log(`   ✓ Cache done in ${((performance.now() - startCache) / 1000).toFixed(1)}s\n`);
  
  // Generate test queries
  console.log('⚙️  Generating test queries...');
  
  interface TestQuery {
    text: string;
    normalized: string;
    embedding: number[];
    type: 'exact' | 'paraphrase' | 'unique';
  }
  
  const testQueries: TestQuery[] = [];
  
  // Exact repeats (reuse embeddings)
  const exactCount = Math.floor(CONFIG.testSize * CONFIG.exactRepeatRate);
  console.log(`   Adding ${exactCount} exact repeats...`);
  for (let i = 0; i < exactCount; i++) {
    const idx = Math.floor(Math.pow(Math.random(), 2) * cacheEntries.length);
    const entry = cacheEntries[idx];
    testQueries.push({
      text: entry.text,
      normalized: entry.normalized,
      embedding: entry.embedding,
      type: 'exact',
    });
  }
  
  // Paraphrases (need new embeddings)
  const paraphraseCount = Math.floor(CONFIG.testSize * CONFIG.paraphraseRate);
  console.log(`   Generating ${paraphraseCount} paraphrases...`);
  
  const paraphrasedTexts: string[] = [];
  const paraphraseOriginals: number[] = [];
  for (let i = 0; i < paraphraseCount; i++) {
    const idx = Math.floor(Math.random() * cacheEntries.length);
    paraphrasedTexts.push(paraphrase(cacheEntries[idx].text));
    paraphraseOriginals.push(idx);
  }
  
  // Batch embed paraphrases
  for (let i = 0; i < paraphrasedTexts.length; i += CONFIG.batchSize) {
    const batch = paraphrasedTexts.slice(i, i + CONFIG.batchSize);
    const embeddings = await getEmbeddings(batch);
    
    for (let j = 0; j < batch.length; j++) {
      testQueries.push({
        text: batch[j],
        normalized: normalizeQuery(batch[j]),
        embedding: embeddings[j],
        type: 'paraphrase',
      });
    }
    console.log(`      ${Math.min(i + CONFIG.batchSize, paraphrasedTexts.length)}/${paraphrasedTexts.length}`);
  }
  
  // Unique queries (need new embeddings)
  const uniqueCount = CONFIG.testSize - exactCount - paraphraseCount;
  console.log(`   Generating ${uniqueCount} unique queries...`);
  
  const uniqueTexts = uniqueQueries.slice(0, uniqueCount);
  for (let i = 0; i < uniqueTexts.length; i += CONFIG.batchSize) {
    const batch = uniqueTexts.slice(i, i + CONFIG.batchSize);
    const embeddings = await getEmbeddings(batch);
    
    for (let j = 0; j < batch.length; j++) {
      testQueries.push({
        text: batch[j],
        normalized: normalizeQuery(batch[j]),
        embedding: embeddings[j],
        type: 'unique',
      });
    }
    console.log(`      ${Math.min(i + CONFIG.batchSize, uniqueTexts.length)}/${uniqueTexts.length}`);
  }
  
  // Shuffle
  for (let i = testQueries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [testQueries[i], testQueries[j]] = [testQueries[j], testQueries[i]];
  }
  
  console.log(`   ✓ Test queries ready\n`);
  
  // Run ablation
  console.log('🔬 Running Ablation Study...\n');
  
  interface Result {
    name: string;
    hitRate: number;
    exactHits: number;
    normalizedHits: number;
    semanticHits: number;
    misses: number;
    avgLatency: number;
    byType: { exact: number; paraphrase: number; unique: number };
  }
  
  const results: Result[] = [];
  
  for (const config of CONFIGURATIONS) {
    process.stdout.write(`   ${config.name.padEnd(35)}`);
    
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
    
    let exactHits = 0;
    let normalizedHits = 0;
    let semanticHits = 0;
    let misses = 0;
    const latencies: number[] = [];
    const hitsByType = { exact: 0, paraphrase: 0, unique: 0 };
    
    for (const query of testQueries) {
      const start = performance.now();
      let hit = false;
      
      if (config.useExact && exactCache.get(query.text) !== undefined) {
        exactHits++;
        hit = true;
      }
      
      if (!hit && config.useNormalized && normalizedCache.get(query.normalized) !== undefined) {
        normalizedHits++;
        hit = true;
      }
      
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
    
    const total = testQueries.length;
    
    results.push({
      name: config.name,
      hitRate: (exactHits + normalizedHits + semanticHits) / total,
      exactHits,
      normalizedHits,
      semanticHits,
      misses,
      avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
      byType: hitsByType,
    });
    
    console.log(`${(results[results.length - 1].hitRate * 100).toFixed(1)}% hit rate`);
  }
  
  // Print results
  console.log('\n' + '═'.repeat(100));
  console.log('RESULTS (OpenAI text-embedding-3-small)');
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
  
  // Hit rate by type
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
  console.log('SUMMARY FOR PAPER (Real OpenAI Embeddings)');
  console.log('═'.repeat(100) + '\n');
  
  const baseline = results[0];
  console.log(`  Baseline (Exact Match Only): ${(baseline.hitRate * 100).toFixed(1)}%`);
  console.log(`  + Normalization:             ${(results[1].hitRate * 100).toFixed(1)}% (Δ +${((results[1].hitRate - baseline.hitRate) * 100).toFixed(1)}%)`);
  console.log(`  + Semantic:                  ${(results[2].hitRate * 100).toFixed(1)}% (Δ +${((results[2].hitRate - results[1].hitRate) * 100).toFixed(1)}%)`);
  console.log(`  Full System:                 ${(full.hitRate * 100).toFixed(1)}%`);
  console.log(`\n  📈 Total Improvement: ${((full.hitRate - baseline.hitRate) * 100).toFixed(1)}% absolute`);
  console.log(`  🚀 Improvement Factor: ${(full.hitRate / baseline.hitRate).toFixed(2)}x over baseline\n`);
  
  // Save
  const outputPath = path.join(__dirname, 'openai-embeddings-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({ 
    results, 
    config: CONFIG,
    model: 'text-embedding-3-small',
    embeddingDim: CONFIG.embeddingDim,
  }, null, 2));
  console.log(`📄 Results saved to: ${outputPath}\n`);
}

main().catch(console.error);
