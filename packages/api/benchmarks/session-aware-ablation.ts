/**
 * Session-Aware Ablation Study
 * 
 * Evaluates semantic caching with conversation context.
 * Key insight: Many queries depend on previous turns ("What else?", "Tell me more")
 * 
 * Approaches tested:
 * 1. Stateless: Each query independent (current approach)
 * 2. Context-1: Include previous turn
 * 3. Context-3: Include last 3 turns (sliding window)
 * 4. Full-context: Include entire conversation
 * 
 * Usage:
 *   npx tsx benchmarks/session-aware-ablation.ts
 */

import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { LRUCache } from '../src/lru-cache';
import { normalizeQuery } from '../src/normalize';
import { HNSWIndex } from '../src/hnsw-index';
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
  testSessions: 200,      // Number of conversation sessions
  turnsPerSession: 5,     // Turns per session
  baseThreshold: 0.85,
  embeddingDim: 1536,
  batchSize: 100,
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not found in environment');
  process.exit(1);
}

// ============================================================================
// TYPES
// ============================================================================

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface Session {
  id: string;
  turns: ConversationTurn[];
}

interface CacheEntry {
  key: string;           // The cache key (varies by context strategy)
  query: string;         // Original query
  context: string[];     // Previous turns used for context
  embedding: number[];
  response: string;
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

async function batchGetEmbeddings(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += CONFIG.batchSize) {
    const batch = texts.slice(i, i + CONFIG.batchSize);
    const embeddings = await getEmbeddings(batch);
    results.push(...embeddings);
    if (i > 0 && i % 500 === 0) {
      console.log(`   ${i}/${texts.length} embeddings...`);
    }
  }
  return results;
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

// ============================================================================
// LOAD CONVERSATIONAL DATA
// ============================================================================

function loadConversations(): Session[] {
  // Try to load HH-RLHF which has real conversations
  const datasetPath = path.join(__dirname, 'dataset-hhrlhf.json');
  
  if (!fs.existsSync(datasetPath)) {
    console.error('❌ HH-RLHF dataset not found! Run: npx tsx benchmarks/download-dataset.ts hhrlhf');
    process.exit(1);
  }
  
  // Parse conversations from HH-RLHF format
  const rawPath = path.join(__dirname, 'conversations-hhrlhf.json');
  
  // Check if we already extracted conversations
  if (fs.existsSync(rawPath)) {
    return JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
  }
  
  // Generate conversations from the queries (simulating multi-turn sessions)
  console.log('   Building conversation sessions from queries...');
  
  // Load the queries
  const data = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  const queries = data.queries as string[];
  
  const sessions: Session[] = [];
  let queryIndex = 0;
  
  for (let i = 0; i < 500 && queryIndex < queries.length - 10; i++) {
    const turns: ConversationTurn[] = [];
    const numTurns = 3 + Math.floor(Math.random() * 5); // 3-7 turns
    
    for (let t = 0; t < numTurns && queryIndex < queries.length; t++) {
      turns.push({ role: 'user', content: queries[queryIndex++] });
      turns.push({ role: 'assistant', content: `Response to: ${turns[turns.length - 1].content.slice(0, 50)}...` });
    }
    
    sessions.push({ id: `session-${i}`, turns });
  }
  
  // Save for reuse
  fs.writeFileSync(rawPath, JSON.stringify(sessions, null, 2));
  
  return sessions;
}

// ============================================================================
// CONTEXT STRATEGIES
// ============================================================================

type ContextStrategy = 'stateless' | 'context-1' | 'context-3' | 'full-context';

function buildCacheKey(
  query: string, 
  previousTurns: ConversationTurn[], 
  strategy: ContextStrategy
): string {
  switch (strategy) {
    case 'stateless':
      return query;
      
    case 'context-1':
      // Include only the previous user turn
      const prev1 = previousTurns.filter(t => t.role === 'user').slice(-1);
      return prev1.length > 0 
        ? `${prev1[0].content} | ${query}`
        : query;
      
    case 'context-3':
      // Include last 3 user turns
      const prev3 = previousTurns.filter(t => t.role === 'user').slice(-3);
      return prev3.length > 0
        ? [...prev3.map(t => t.content), query].join(' | ')
        : query;
      
    case 'full-context':
      // Include all previous user turns
      const allPrev = previousTurns.filter(t => t.role === 'user');
      return allPrev.length > 0
        ? [...allPrev.map(t => t.content), query].join(' | ')
        : query;
      
    default:
      return query;
  }
}

// ============================================================================
// ABLATION STUDY
// ============================================================================

interface StrategyResult {
  strategy: ContextStrategy;
  hitRate: number;
  hits: number;
  misses: number;
  avgKeyLength: number;
  embeddingCost: number;  // Relative to stateless
}

async function runStrategyAblation(
  sessions: Session[],
  strategy: ContextStrategy
): Promise<StrategyResult> {
  console.log(`\n   Running ${strategy}...`);
  
  // Build cache from first half of sessions
  const cacheSessions = sessions.slice(0, sessions.length / 2);
  const testSessions = sessions.slice(sessions.length / 2);
  
  // Collect cache entries
  const cacheTexts: string[] = [];
  const cacheQueries: Array<{ query: string; context: string[] }> = [];
  
  for (const session of cacheSessions) {
    const userTurns = session.turns.filter(t => t.role === 'user');
    for (let i = 0; i < userTurns.length; i++) {
      const previousTurns = session.turns.slice(0, session.turns.indexOf(userTurns[i]));
      const key = buildCacheKey(userTurns[i].content, previousTurns, strategy);
      cacheTexts.push(key);
      cacheQueries.push({
        query: userTurns[i].content,
        context: previousTurns.filter(t => t.role === 'user').map(t => t.content)
      });
    }
  }
  
  // Limit cache size
  const limitedTexts = cacheTexts.slice(0, CONFIG.cacheSize);
  const limitedQueries = cacheQueries.slice(0, CONFIG.cacheSize);
  
  // Get embeddings
  console.log(`      Embedding ${limitedTexts.length} cache entries...`);
  const cacheEmbeddings = await batchGetEmbeddings(limitedTexts);
  
  // Build HNSW index
  const index = new HNSWIndex();
  for (let i = 0; i < cacheEmbeddings.length; i++) {
    index.insert(String(i), cacheEmbeddings[i]);
  }
  
  // Test on second half
  let hits = 0;
  let misses = 0;
  const testTexts: string[] = [];
  
  for (const session of testSessions.slice(0, CONFIG.testSessions)) {
    const userTurns = session.turns.filter(t => t.role === 'user');
    for (let i = 0; i < userTurns.length; i++) {
      const previousTurns = session.turns.slice(0, session.turns.indexOf(userTurns[i]));
      const key = buildCacheKey(userTurns[i].content, previousTurns, strategy);
      testTexts.push(key);
    }
  }
  
  console.log(`      Embedding ${testTexts.length} test queries...`);
  const testEmbeddings = await batchGetEmbeddings(testTexts);
  
  for (const embedding of testEmbeddings) {
    const results = index.search(embedding, 1);
    if (results.length > 0 && results[0].similarity >= CONFIG.baseThreshold) {
      hits++;
    } else {
      misses++;
    }
  }
  
  const avgKeyLength = testTexts.reduce((sum, t) => sum + t.length, 0) / testTexts.length;
  const statelessAvgLength = strategy === 'stateless' ? avgKeyLength : 0;
  
  return {
    strategy,
    hitRate: hits / (hits + misses),
    hits,
    misses,
    avgKeyLength,
    embeddingCost: avgKeyLength / 100, // Rough token estimate
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '═'.repeat(100));
  console.log('SESSION-AWARE SEMANTIC CACHING ABLATION STUDY');
  console.log('═'.repeat(100) + '\n');
  
  console.log('📊 Configuration:');
  console.log(`   Cache size: ${CONFIG.cacheSize}`);
  console.log(`   Test sessions: ${CONFIG.testSessions}`);
  console.log(`   Embedding model: text-embedding-3-small`);
  
  // Load conversations
  console.log('\n📂 Loading conversational data...');
  const sessions = loadConversations();
  console.log(`   Loaded ${sessions.length} sessions`);
  
  const totalTurns = sessions.reduce((sum, s) => sum + s.turns.filter(t => t.role === 'user').length, 0);
  console.log(`   Total user turns: ${totalTurns}`);
  
  // Run each strategy
  const strategies: ContextStrategy[] = ['stateless', 'context-1', 'context-3', 'full-context'];
  const results: StrategyResult[] = [];
  
  console.log('\n🔬 Running Context Strategy Ablation...');
  
  for (const strategy of strategies) {
    const result = await runStrategyAblation(sessions, strategy);
    results.push(result);
    console.log(`      ${strategy}: ${(result.hitRate * 100).toFixed(1)}% hit rate`);
  }
  
  // Print results
  console.log('\n' + '═'.repeat(100));
  console.log('RESULTS: Context Strategy Comparison');
  console.log('═'.repeat(100) + '\n');
  
  console.log('┌' + '─'.repeat(20) + '┬' + '─'.repeat(12) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(15) + '┬' + '─'.repeat(15) + '┐');
  console.log('│' + ' Strategy'.padEnd(20) + '│' + ' Hit Rate'.padEnd(12) + '│' + ' Hits'.padEnd(10) + '│' + ' Misses'.padEnd(10) + '│' + ' Avg Key Len'.padEnd(15) + '│' + ' Token Cost'.padEnd(15) + '│');
  console.log('├' + '─'.repeat(20) + '┼' + '─'.repeat(12) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(15) + '┼' + '─'.repeat(15) + '┤');
  
  const statelessCost = results[0].avgKeyLength;
  
  for (const r of results) {
    const costMultiple = (r.avgKeyLength / statelessCost).toFixed(2) + 'x';
    console.log(
      '│' + ` ${r.strategy}`.padEnd(20) +
      '│' + ` ${(r.hitRate * 100).toFixed(1)}%`.padEnd(12) +
      '│' + ` ${r.hits}`.padEnd(10) +
      '│' + ` ${r.misses}`.padEnd(10) +
      '│' + ` ${r.avgKeyLength.toFixed(0)} chars`.padEnd(15) +
      '│' + ` ${costMultiple}`.padEnd(15) + '│'
    );
  }
  console.log('└' + '─'.repeat(20) + '┴' + '─'.repeat(12) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(15) + '┴' + '─'.repeat(15) + '┘');
  
  // Summary
  console.log('\n' + '═'.repeat(100));
  console.log('KEY FINDINGS');
  console.log('═'.repeat(100) + '\n');
  
  const stateless = results[0];
  const best = results.reduce((a, b) => a.hitRate > b.hitRate ? a : b);
  const improvement = ((best.hitRate - stateless.hitRate) / stateless.hitRate * 100).toFixed(1);
  
  console.log(`  📊 Stateless baseline: ${(stateless.hitRate * 100).toFixed(1)}% hit rate`);
  console.log(`  🏆 Best strategy: ${best.strategy} with ${(best.hitRate * 100).toFixed(1)}% hit rate`);
  console.log(`  📈 Improvement: +${improvement}% over stateless`);
  console.log(`  💰 Cost tradeoff: ${(best.avgKeyLength / stateless.avgKeyLength).toFixed(2)}x more tokens\n`);
  
  // Recommendation
  console.log('  💡 Recommendation for paper:');
  if (best.strategy !== 'stateless') {
    console.log(`     "${best.strategy}" provides the best balance of hit rate and cost.`);
    console.log('     Context-aware caching is essential for conversational AI applications.\n');
  } else {
    console.log('     Stateless caching is sufficient for this dataset.');
    console.log('     Context may not be necessary for standalone queries.\n');
  }
  
  // Save results
  const outputPath = path.join(__dirname, 'session-aware-results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    results,
    config: CONFIG,
    sessions: sessions.length,
    totalTurns,
  }, null, 2));
  console.log(`📄 Results saved to: ${outputPath}\n`);
}

main().catch(console.error);
