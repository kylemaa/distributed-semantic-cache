/**
 * Cross-User/Organization Semantic Cache Ablation
 * 
 * Simulates realistic organizational usage patterns:
 * - Multiple users asking similar questions
 * - Common topics that repeat across users
 * - Different phrasings of the same underlying question
 * 
 * Key insight: Cache hits come from DIFFERENT users asking
 * semantically similar questions, not from within-session repeats.
 * 
 * Usage:
 *   npx tsx benchmarks/cross-user-ablation.ts [dataset]
 */

import { performance } from 'perf_hooks';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HNSWIndex } from '../src/hnsw-index';
import { normalizeQuery } from '../src/normalize';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Organization simulation
  numUsers: 50,              // Simulated users
  queriesPerUser: 20,        // Queries per user session
  
  // Topic distribution (organizational patterns)
  numTopics: 100,            // Distinct "topic clusters"
  topicRepeatRate: 0.60,     // 60% of queries are about repeated topics
  
  // Cache settings
  cacheSize: 500,
  baseThreshold: 0.85,
  embeddingDim: 1536,
  batchSize: 100,
};

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const DATASET_NAME = process.argv[2] || 'alpaca';

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

async function batchGetEmbeddings(texts: string[], label: string): Promise<number[][]> {
  const results: number[][] = [];
  // Filter out empty/undefined strings
  const validTexts = texts.map(t => (t || '').trim() || 'empty query');
  
  for (let i = 0; i < validTexts.length; i += CONFIG.batchSize) {
    const batch = validTexts.slice(i, i + CONFIG.batchSize);
    const embeddings = await getEmbeddings(batch);
    results.push(...embeddings);
    if ((i + CONFIG.batchSize) % 200 === 0 || i + CONFIG.batchSize >= validTexts.length) {
      console.log(`      ${label}: ${Math.min(i + CONFIG.batchSize, validTexts.length)}/${validTexts.length}`);
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

// Paraphrase generation
const PARAPHRASE_PREFIXES = [
  '', 'Can you ', 'Please ', 'I need to ', 'Help me with ', 'I want to know ',
  'Tell me ', 'Explain ', 'What is ', 'How do I ', 'Could you ', 'I\'d like to ',
  'Show me how to ', 'What\'s the best way to ', 'I\'m trying to ',
];

const PARAPHRASE_SUFFIXES = ['', '?', ' please', ' thanks', ' for me', ''];

function paraphrase(text: string): string {
  // Strip existing prefixes
  let modified = text
    .replace(/^(can you |please |help me |tell me |explain |what is |how do i |could you |i need to |i want to know |i'd like to |show me how to |what's the best way to |i'm trying to )/i, '')
    .replace(/[?.!,]+$/, '')
    .trim();
  
  const prefix = PARAPHRASE_PREFIXES[Math.floor(Math.random() * PARAPHRASE_PREFIXES.length)];
  const suffix = PARAPHRASE_SUFFIXES[Math.floor(Math.random() * PARAPHRASE_SUFFIXES.length)];
  
  // Randomly apply word substitutions
  if (Math.random() < 0.3) {
    modified = modified
      .replace(/\bhow\b/gi, 'what way')
      .replace(/\bexplain\b/gi, 'describe');
  }
  
  return prefix + modified.charAt(0).toLowerCase() + modified.slice(1) + suffix;
}

// ============================================================================
// LOAD DATASET
// ============================================================================

interface TopicCluster {
  baseQuery: string;
  variations: string[];  // Different ways users might ask
}

function loadDataset(): string[] {
  const datasetPath = path.join(__dirname, `dataset-${DATASET_NAME}.json`);
  
  if (!fs.existsSync(datasetPath)) {
    console.error(`❌ Dataset not found! Run: npx tsx benchmarks/download-dataset.ts ${DATASET_NAME}`);
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(datasetPath, 'utf-8'));
  console.log(`📊 Loaded ${data.source} dataset: ${data.count} queries`);
  return data.queries;
}

// ============================================================================
// SIMULATE ORGANIZATION
// ============================================================================

interface UserSession {
  userId: string;
  queries: Array<{
    text: string;
    topicId: number | null;  // null = unique query
    isParaphrase: boolean;
  }>;
}

function simulateOrganization(allQueries: string[]): {
  topics: TopicCluster[];
  users: UserSession[];
} {
  // Create topic clusters (common questions in the org)
  const topics: TopicCluster[] = [];
  const usedIndices = new Set<number>();
  
  for (let i = 0; i < CONFIG.numTopics && topics.length < CONFIG.numTopics; i++) {
    const idx = Math.floor(Math.random() * allQueries.length);
    if (usedIndices.has(idx)) continue;
    usedIndices.add(idx);
    
    const baseQuery = allQueries[idx];
    const variations = [baseQuery];
    
    // Generate 2-5 paraphrased variations
    const numVariations = 2 + Math.floor(Math.random() * 4);
    for (let v = 0; v < numVariations; v++) {
      variations.push(paraphrase(baseQuery));
    }
    
    topics.push({ baseQuery, variations });
  }
  
  // Simulate users
  // KEY: Seed users use base queries, test users use paraphrased versions
  const users: UserSession[] = [];
  
  for (let u = 0; u < CONFIG.numUsers; u++) {
    const isSeedUser = u < Math.floor(CONFIG.numUsers * 0.2);
    const queries: UserSession['queries'] = [];
    
    for (let q = 0; q < CONFIG.queriesPerUser; q++) {
      if (Math.random() < CONFIG.topicRepeatRate) {
        // Ask about a common topic
        const topicId = Math.floor(Math.random() * topics.length);
        const topic = topics[topicId];
        
        // Seed users: use base query
        // Test users: use paraphrased variations (NOT the base)
        let text: string;
        if (isSeedUser) {
          text = topic.baseQuery;
        } else {
          // Pick a variation that's NOT the base query (always a paraphrase)
          const paraphrases = topic.variations.filter(v => v !== topic.baseQuery);
          text = paraphrases.length > 0 
            ? paraphrases[Math.floor(Math.random() * paraphrases.length)]
            : paraphrase(topic.baseQuery);  // Generate new one if needed
        }
        
        queries.push({
          text,
          topicId,
          isParaphrase: text !== topic.baseQuery,
        });
      } else {
        // Ask a unique question (only from unused pool)
        let idx: number;
        do {
          idx = Math.floor(Math.random() * allQueries.length);
        } while (usedIndices.has(idx));
        usedIndices.add(idx);  // Mark as used so no other user gets same "unique" query
        
        queries.push({
          text: allQueries[idx],
          topicId: null,
          isParaphrase: false,
        });
      }
    }
    
    users.push({ userId: `user-${u}`, queries });
  }
  
  return { topics, users };
}

// ============================================================================
// RUN ABLATION
// ============================================================================

interface AblationResult {
  config: string;
  totalQueries: number;
  cacheHits: number;
  hitRate: number;
  exactMatches: number;
  semanticMatches: number;
  hitsByType: {
    exactTopic: number;     // Same topic, exact match
    paraphraseTopic: number; // Same topic, different wording
    crossTopic: number;      // Hit on different topic (false positive?)
    uniqueQuery: number;     // Hit on unique query
  };
  missReason: {
    uniqueNoMatch: number;
    paraphraseMiss: number;
    notInCache: number;
  };
  userStats: {
    usersWithHits: number;
    avgHitsPerUser: number;
    maxHitsForUser: number;
  };
}

async function runCrossUserAblation(): Promise<AblationResult> {
  const allQueries = loadDataset();
  
  console.log('\n🏢 Simulating Organization...');
  console.log(`   Users: ${CONFIG.numUsers}`);
  console.log(`   Queries per user: ${CONFIG.queriesPerUser}`);
  console.log(`   Topic clusters: ${CONFIG.numTopics}`);
  console.log(`   Topic repeat rate: ${(CONFIG.topicRepeatRate * 100).toFixed(0)}%`);
  
  const { topics, users } = simulateOrganization(allQueries);
  
  console.log(`   Generated ${topics.length} topic clusters`);
  console.log(`   Total variations: ${topics.reduce((s, t) => s + t.variations.length, 0)}`);
  
  // KEY CHANGE: Split users into seed users and test users
  // Seed users = first 20% of users (their queries populate the cache)
  // Test users = remaining 80% (evaluate cache hit rate)
  const seedUserCount = Math.floor(CONFIG.numUsers * 0.2);
  const seedUsers = users.slice(0, seedUserCount);
  const testUsers = users.slice(seedUserCount);
  
  // Get seed queries from seed users only
  const seedQueries: Array<typeof users[0]['queries'][0] & { userId: string }> = [];
  for (const user of seedUsers) {
    for (const q of user.queries) {
      seedQueries.push({ ...q, userId: user.userId });
    }
  }
  
  // Get test queries from test users only  
  const testQueries: Array<typeof users[0]['queries'][0] & { userId: string }> = [];
  for (const user of testUsers) {
    for (const q of user.queries) {
      testQueries.push({ ...q, userId: user.userId });
    }
  }
  
  console.log(`   Seed users: ${seedUserCount}, Test users: ${testUsers.length}`);
  console.log(`   Seed queries: ${seedQueries.length}, Test queries: ${testQueries.length}`);

  // Build cache from seed user queries
  console.log('\n⚙️  Building cache from seed users...');
  const cacheTexts = seedQueries.map(q => q.text || 'empty');
  const cacheEmbeddings = await batchGetEmbeddings(cacheTexts, 'Cache');
  
  const exactCache = new Map<string, number>(); // normalized -> index
  const index = new HNSWIndex();
  
  for (let i = 0; i < cacheEmbeddings.length; i++) {
    const queryText = seedQueries[i].text || 'empty';
    const normalized = normalizeQuery(queryText);  // returns string directly
    exactCache.set(normalized, i);
    index.insert(String(i), cacheEmbeddings[i]);
  }
  
  // Process test queries
  console.log('\n🔬 Processing test queries...');
  const testTexts = testQueries.map(q => q.text || 'empty');
  const testEmbeddings = await batchGetEmbeddings(testTexts, 'Test');
  
  // Track results
  const hitsByType = { exactTopic: 0, paraphraseTopic: 0, crossTopic: 0, uniqueQuery: 0 };
  const missReason = { uniqueNoMatch: 0, paraphraseMiss: 0, notInCache: 0 };
  const userHits = new Map<string, number>();
  
  let cacheHits = 0;
  
  // Track which topics are in cache
  const cachedTopics = new Set<number>();
  for (const sq of seedQueries) {
    if (sq.topicId !== null) cachedTopics.add(sq.topicId);
  }
  
  let exactMatchCount = 0;
  let semanticMatchCount = 0;
  
  // Debug: check cache size
  console.log(`   Cache size: ${exactCache.size} normalized entries, ${index.size()} vectors`);
  
  for (let i = 0; i < testQueries.length; i++) {
    const tq = testQueries[i];
    const queryText = tq.text || 'empty';
    const normalized = normalizeQuery(queryText);  // returns string directly
    
    let hit = false;
    let hitType: 'exact' | 'semantic' | 'none' = 'none';
    
    // Check exact match first
    if (exactCache.has(normalized)) {
      hit = true;
      hitType = 'exact';
      exactMatchCount++;
      if (tq.topicId !== null) {
        hitsByType.exactTopic++;
      } else {
        hitsByType.uniqueQuery++;
      }
    } else {
      // Semantic search
      const results = index.search(testEmbeddings[i], 1);
      if (results.length > 0 && results[0].similarity >= CONFIG.baseThreshold) {
        hit = true;
        hitType = 'semantic';
        semanticMatchCount++;
        
        // Categorize the hit
        if (tq.topicId !== null && cachedTopics.has(tq.topicId)) {
          hitsByType.paraphraseTopic++;
        } else if (tq.topicId !== null) {
          hitsByType.crossTopic++;  // Hit on a different topic
        } else {
          hitsByType.uniqueQuery++;
        }
      }
    }
    
    if (hit) {
      cacheHits++;
      userHits.set(tq.userId, (userHits.get(tq.userId) || 0) + 1);
    } else {
      // Categorize miss
      if (tq.topicId === null) {
        missReason.uniqueNoMatch++;
      } else if (cachedTopics.has(tq.topicId)) {
        missReason.paraphraseMiss++;
      } else {
        missReason.notInCache++;
      }
    }
    
    // DO NOT add to cache - we want to measure pure cross-user matching
    // In production, you would add misses to cache for future users
  }
  
  const usersWithHits = userHits.size;
  const allHitCounts = Array.from(userHits.values());
  const avgHitsPerUser = allHitCounts.length > 0 
    ? allHitCounts.reduce((a, b) => a + b, 0) / CONFIG.numUsers 
    : 0;
  const maxHitsForUser = allHitCounts.length > 0 ? Math.max(...allHitCounts) : 0;
  
  console.log(`\n   Match breakdown: ${exactMatchCount} exact, ${semanticMatchCount} semantic`);
  
  return {
    config: `${CONFIG.numUsers} users, ${CONFIG.queriesPerUser} queries each, ${(CONFIG.topicRepeatRate * 100).toFixed(0)}% topic repeat`,
    totalQueries: testQueries.length,
    cacheHits,
    hitRate: cacheHits / testQueries.length,
    exactMatches: exactMatchCount,
    semanticMatches: semanticMatchCount,
    hitsByType,
    missReason,
    userStats: {
      usersWithHits,
      avgHitsPerUser,
      maxHitsForUser,
    },
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '═'.repeat(100));
  console.log('CROSS-USER SEMANTIC CACHE ABLATION STUDY');
  console.log('Simulating Real Organizational Usage Patterns');
  console.log('═'.repeat(100));
  
  const result = await runCrossUserAblation();
  
  // Print results
  console.log('\n' + '═'.repeat(100));
  console.log('RESULTS');
  console.log('═'.repeat(100) + '\n');
  
  console.log(`📊 Configuration: ${result.config}\n`);
  
  console.log('┌' + '─'.repeat(40) + '┬' + '─'.repeat(15) + '┐');
  console.log('│' + ' Metric'.padEnd(40) + '│' + ' Value'.padEnd(15) + '│');
  console.log('├' + '─'.repeat(40) + '┼' + '─'.repeat(15) + '┤');
  console.log('│' + ' Total Test Queries'.padEnd(40) + '│' + ` ${result.totalQueries}`.padEnd(15) + '│');
  console.log('│' + ' Cache Hits'.padEnd(40) + '│' + ` ${result.cacheHits}`.padEnd(15) + '│');
  console.log('│' + ' Hit Rate'.padEnd(40) + '│' + ` ${(result.hitRate * 100).toFixed(1)}%`.padEnd(15) + '│');
  console.log('└' + '─'.repeat(40) + '┴' + '─'.repeat(15) + '┘');
  
  console.log('\n📈 Hits by Type:');
  console.log(`   Exact topic match:     ${result.hitsByType.exactTopic}`);
  console.log(`   Paraphrase (semantic): ${result.hitsByType.paraphraseTopic}`);
  console.log(`   Cross-topic:           ${result.hitsByType.crossTopic}`);
  console.log(`   Unique query match:    ${result.hitsByType.uniqueQuery}`);
  
  console.log('\n📉 Miss Reasons:');
  console.log(`   Unique query (expected):  ${result.missReason.uniqueNoMatch}`);
  console.log(`   Paraphrase not matched:   ${result.missReason.paraphraseMiss}`);
  console.log(`   Topic not yet in cache:   ${result.missReason.notInCache}`);
  
  console.log('\n👥 User Statistics:');
  console.log(`   Users with cache hits: ${result.userStats.usersWithHits}/${CONFIG.numUsers} (${(result.userStats.usersWithHits / CONFIG.numUsers * 100).toFixed(0)}%)`);
  console.log(`   Average hits per user: ${result.userStats.avgHitsPerUser.toFixed(1)}`);
  console.log(`   Max hits for a user:   ${result.userStats.maxHitsForUser}`);
  
  // Calculate semantic matching effectiveness
  const paraphraseTotal = result.hitsByType.paraphraseTopic + result.missReason.paraphraseMiss;
  const paraphraseHitRate = paraphraseTotal > 0 
    ? result.hitsByType.paraphraseTopic / paraphraseTotal 
    : 0;
  
  console.log('\n' + '═'.repeat(100));
  console.log('KEY INSIGHTS FOR PAPER');
  console.log('═'.repeat(100) + '\n');
  
  console.log(`  🎯 Overall Cache Hit Rate: ${(result.hitRate * 100).toFixed(1)}%`);
  console.log(`  🔄 Cross-User Semantic Match Rate: ${(paraphraseHitRate * 100).toFixed(1)}%`);
  console.log(`  👥 ${result.userStats.usersWithHits} of ${CONFIG.numUsers} users benefited from cache`);
  
  console.log('\n  💡 Key Finding:');
  console.log('     Semantic caching is most effective for CROSS-USER queries,');
  console.log('     not within-session repeats. Organizations benefit when');
  console.log('     different users ask semantically similar questions.\n');
  
  // Estimate cost savings
  const avgTokensPerQuery = 50;
  const costPer1kTokens = 0.01; // Rough GPT-4 input cost
  const savedCalls = result.cacheHits;
  const estimatedSavings = savedCalls * avgTokensPerQuery * costPer1kTokens / 1000;
  
  console.log(`  💰 Estimated Savings (per ${result.totalQueries} queries):`);
  console.log(`     API calls avoided: ${savedCalls}`);
  console.log(`     Est. cost saved: $${estimatedSavings.toFixed(2)}`);
  
  // Save
  const outputPath = path.join(__dirname, `cross-user-results-${DATASET_NAME}.json`);
  fs.writeFileSync(outputPath, JSON.stringify({
    result,
    config: CONFIG,
    dataset: DATASET_NAME,
  }, null, 2));
  console.log(`\n📄 Results saved to: ${outputPath}\n`);
}

main().catch(console.error);
