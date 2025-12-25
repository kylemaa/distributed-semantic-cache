/**
 * A/B Testing Example for Cache Optimizations
 * 
 * Demonstrates how to use the injectable optimization system
 * to compare cache performance with and without specific optimizations.
 */

import { OptimizedCacheService } from './optimized-cache-service.js';
import { 
  OptimizationPipeline, 
  ABTestRunner,
  QueryExpansionOptimization,
  NegativeMiningOptimization,
  ContextualRerankingOptimization,
  BloomFilterOptimization,
} from './optimizations/index.js';

// --- Example 1: Basic A/B Test ---
async function runBasicABTest() {
  console.log('=== Basic A/B Test: With vs Without Optimizations ===\n');

  // Control: No optimizations
  const controlCache = new OptimizedCacheService();
  
  // Treatment: Semantic-friendly optimizations (no bloom filter - it blocks semantic matches)
  const treatmentCache = new OptimizedCacheService({
    optimizationConfig: {
      queryExpansion: true,
      negativeMining: true,
      contextualReranking: true,
      bloomFilter: false,  // Disabled - bloom filter only works for exact/normalized matches
    },
  });

  // Populate both caches with same data
  const testData = [
    { q: 'How do I deploy to AWS?', r: 'Use the AWS CLI or console to deploy your application.' },
    { q: 'What is the best database for high traffic?', r: 'PostgreSQL or MySQL with read replicas for high traffic.' },
    { q: 'How to implement caching?', r: 'Use Redis or Memcached for caching layer.' },
    { q: 'Best practices for API design', r: 'Use REST or GraphQL with proper versioning.' },
  ];

  for (const { q, r } of testData) {
    await controlCache.store(q, r);
    await treatmentCache.store(q, r);
  }

  // Test queries
  const testQueries = [
    'how do I deploy my app to amazon web services?',  // Similar to AWS question
    'best database for lots of requests?',              // Similar to high traffic question
    'implement a cache layer',                          // Similar to caching question
    'design patterns for web APIs',                     // Similar to API design question
    'how to make coffee',                              // Should NOT match (negative test)
  ];

  console.log('Running queries against both caches...\n');

  for (const query of testQueries) {
    const controlResult = await controlCache.query({ query, threshold: 0.75 });
    const treatmentResult = await treatmentCache.query({ query, threshold: 0.75 });

    console.log(`Query: "${query}"`);
    console.log(`  Control:   hit=${controlResult.hit}, sim=${controlResult.similarity?.toFixed(3) ?? 'N/A'}`);
    console.log(`  Treatment: hit=${treatmentResult.hit}, sim=${treatmentResult.similarity?.toFixed(3) ?? 'N/A'}`);
    console.log();
  }

  // Print stats
  console.log('=== Control Cache Stats ===');
  console.log(JSON.stringify(controlCache.getStats(), null, 2));
  
  console.log('\n=== Treatment Cache Stats ===');
  console.log(JSON.stringify(treatmentCache.getStats(), null, 2));

  controlCache.close();
  treatmentCache.close();
}

// --- Example 2: Single Optimization A/B Test ---
async function runSingleOptimizationTest() {
  console.log('\n=== A/B Test: Contextual Reranking ===\n');

  // Create A/B test runner for contextual reranking
  const abTest = ABTestRunner.forOptimization('contextualReranking');

  // Create cache that will alternate between pipelines
  const cache = new OptimizedCacheService();
  
  // Store test data
  await cache.store('How to configure nginx?', 'Edit nginx.conf file and restart the service.');
  await cache.store('How to configure apache?', 'Edit httpd.conf or apache2.conf file.');
  await cache.store('How to deploy with docker?', 'Create Dockerfile and run docker build/run.');

  // Simulate alternating requests
  const queries = [
    'nginx configuration',
    'apache setup',
    'docker deployment',
    'server config',
  ];

  for (const query of queries) {
    // Alternate between pipelines
    const pipeline = abTest.alternate();
    cache.setOptimizationPipeline(pipeline);
    
    const result = await cache.query({ query, threshold: 0.7 });
    console.log(`Query: "${query}" | Pipeline: ${abTest.current === pipeline ? 'A' : 'B'} | Hit: ${result.hit}`);
  }

  // Get comparison
  const comparison = abTest.getComparison();
  console.log('\n' + comparison.summary);

  cache.close();
}

// --- Example 3: Custom Optimization Pipeline ---
async function runCustomPipelineTest() {
  console.log('\n=== Custom Optimization Pipeline ===\n');

  // Create custom pipeline with only specific optimizations
  const pipeline = new OptimizationPipeline();

  // Add bloom filter (fast rejection)
  const bloomFilter = new BloomFilterOptimization({ expectedEntries: 1000 });
  pipeline.register(bloomFilter);

  // Add contextual reranking (session-aware)
  const contextual = new ContextualRerankingOptimization({ contextWeight: 0.4 });
  pipeline.register(contextual);

  // Create cache with custom pipeline
  const cache = new OptimizedCacheService({ optimizations: pipeline });

  // Store data
  await cache.store('JavaScript array methods', 'map(), filter(), reduce(), forEach()');
  await cache.store('Python list methods', 'append(), extend(), pop(), remove()');
  await cache.store('TypeScript types', 'string, number, boolean, any, unknown');

  // Test queries
  const result = await cache.query({ query: 'JS array functions', threshold: 0.7 });
  console.log(`Query result: hit=${result.hit}, similarity=${result.similarity?.toFixed(3)}`);

  // Check stats
  console.log('\nOptimization Stats:');
  console.log(pipeline.getSummary());

  cache.close();
}

// --- Example 4: Negative Mining in Action ---
async function runNegativeMiningTest() {
  console.log('\n=== Negative Mining Demo ===\n');

  // Create pipeline with negative mining
  const pipeline = OptimizationPipeline.createDefault({
    queryExpansion: false,
    contextualReranking: false,
    bloomFilter: false,
    negativeMining: true,
  });

  const negativeMining = pipeline.get<NegativeMiningOptimization>('negative-mining');

  const cache = new OptimizedCacheService({ optimizations: pipeline });

  // Store data
  await cache.store('Python list comprehension', 'Use [x for x in list if condition] syntax');
  await cache.store('Python dictionary comprehension', 'Use {k: v for k, v in dict.items()}');

  // First query - might match wrong answer
  console.log('First query: "list filtering in python"');
  const result1 = await cache.query({ query: 'list filtering in python', threshold: 0.6 });
  console.log(`  Hit: ${result1.hit}, Response: "${result1.response?.slice(0, 50)}..."`);

  // Record negative feedback (user rephrased)
  // In a real scenario, you'd have access to the query embedding and rejected answer embedding
  // For demo purposes, we'll just show how the API works
  if (negativeMining && result1.hit) {
    // Create mock embeddings for demo (in reality these come from the cache lookup)
    const mockQueryEmbedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);
    const mockAnswerEmbedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);
    negativeMining.recordNegative(mockQueryEmbedding, 'rejected-answer-id', mockAnswerEmbedding);
    console.log('  -> User rephrased (recorded as negative)');
  }

  // Second query - same query should now potentially avoid that answer
  console.log('\nSecond query: "list filtering in python" (after feedback)');
  const result2 = await cache.query({ query: 'list filtering in python', threshold: 0.6 });
  console.log(`  Hit: ${result2.hit}`);

  console.log('\nNegative Mining Stats:', negativeMining?.getStats());

  cache.close();
}

// --- Run Examples ---
async function main() {
  try {
    await runBasicABTest();
    await runSingleOptimizationTest();
    await runCustomPipelineTest();
    await runNegativeMiningTest();
  } catch (error) {
    console.error('Error:', error);
  }
}

// Export for testing
export {
  runBasicABTest,
  runSingleOptimizationTest,
  runCustomPipelineTest,
  runNegativeMiningTest,
};

// Run if executed directly
main();
