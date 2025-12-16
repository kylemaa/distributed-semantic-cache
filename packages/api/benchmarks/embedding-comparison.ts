/**
 * Benchmark script: OpenAI vs Local Embeddings
 * 
 * Compares:
 * - Generation time
 * - Semantic similarity quality
 * - Cost (OpenAI vs free local)
 * - Memory usage
 * 
 * Usage:
 *   tsx benchmarks/embedding-comparison.ts
 */

import { EmbeddingsService } from '../src/embeddings.js';
import { cosineSimilarity } from '@distributed-semantic-cache/shared';

// Test queries - pairs of similar and dissimilar texts
const testCases = [
  {
    category: 'Similar Questions',
    pairs: [
      ['What is artificial intelligence?', 'What is AI?'],
      ['How do I learn JavaScript?', 'How can I study JavaScript?'],
      ['Best restaurants in NYC', 'Top places to eat in New York'],
      ['Python tutorial for beginners', 'Learn Python from scratch'],
    ],
    expectation: 'high similarity (>0.7)',
  },
  {
    category: 'Dissimilar Questions',
    pairs: [
      ['What is AI?', 'How to cook pasta?'],
      ['JavaScript tutorials', 'Weather forecast'],
      ['Best restaurants', 'Machine learning algorithms'],
      ['Python programming', 'Travel destinations'],
    ],
    expectation: 'low similarity (<0.5)',
  },
  {
    category: 'Moderate Similarity',
    pairs: [
      ['Programming languages', 'Software development'],
      ['Cooking recipes', 'Food preparation'],
      ['Travel tips', 'Vacation planning'],
      ['Exercise routines', 'Fitness training'],
    ],
    expectation: 'moderate similarity (0.5-0.8)',
  },
];

interface BenchmarkResult {
  provider: 'openai' | 'local';
  avgGenerationTime: number;
  totalCost: number;
  qualityScore: number;
  memoryUsed: number;
  errors: number;
}

async function benchmarkProvider(provider: 'openai' | 'local'): Promise<BenchmarkResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Benchmarking: ${provider.toUpperCase()}`);
  console.log('='.repeat(60));

  const service = new EmbeddingsService(100, provider);
  const times: number[] = [];
  let errors = 0;
  let qualityScore = 0;
  let totalTests = 0;

  for (const testCase of testCases) {
    console.log(`\n${testCase.category}:`);
    
    for (const [text1, text2] of testCase.pairs) {
      try {
        const start = Date.now();
        const emb1 = await service.generateEmbedding(text1);
        const emb2 = await service.generateEmbedding(text2);
        const duration = Date.now() - start;
        
        times.push(duration);

        const similarity = cosineSimilarity(emb1, emb2);
        
        console.log(`  "${text1}" <-> "${text2}"`);
        console.log(`    Similarity: ${similarity.toFixed(3)} | Time: ${duration}ms`);

        // Quality scoring (based on expectations)
        if (testCase.category === 'Similar Questions' && similarity > 0.7) {
          qualityScore += 1;
        } else if (testCase.category === 'Dissimilar Questions' && similarity < 0.5) {
          qualityScore += 1;
        } else if (testCase.category === 'Moderate Similarity' && similarity >= 0.5 && similarity <= 0.8) {
          qualityScore += 1;
        }

        totalTests++;
      } catch (error) {
        console.log(`  ERROR: ${error}`);
        errors++;
      }
    }
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
  
  // Cost calculation (OpenAI only)
  const totalCost = provider === 'openai' 
    ? (totalTests * 2 * 0.00002) // Rough estimate: $0.00002 per embedding
    : 0;

  // Memory usage (rough estimate)
  const memoryUsed = provider === 'local' ? 200 : 0; // Local models use ~200MB RAM

  const result: BenchmarkResult = {
    provider,
    avgGenerationTime: Math.round(avgTime),
    totalCost,
    qualityScore: (qualityScore / totalTests) * 100,
    memoryUsed,
    errors,
  };

  await service.dispose();
  
  return result;
}

async function runBenchmark() {
  console.log('🚀 Embedding Provider Benchmark');
  console.log('================================\n');
  console.log('This benchmark compares OpenAI vs Local embeddings on:');
  console.log('- Generation speed');
  console.log('- Semantic similarity quality');
  console.log('- Cost');
  console.log('- Memory usage\n');

  const results: BenchmarkResult[] = [];

  // Benchmark OpenAI (if API key available)
  if (process.env.OPENAI_API_KEY) {
    try {
      const openaiResult = await benchmarkProvider('openai');
      results.push(openaiResult);
    } catch (error) {
      console.error('\n❌ OpenAI benchmark failed:', error);
    }
  } else {
    console.log('\n⚠️  Skipping OpenAI benchmark (no API key)');
  }

  // Benchmark Local
  try {
    const localResult = await benchmarkProvider('local');
    results.push(localResult);
  } catch (error) {
    console.error('\n❌ Local benchmark failed:', error);
  }

  // Print comparison table
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 BENCHMARK RESULTS');
  console.log('='.repeat(60));
  console.log('\n');
  console.log('┌─────────────────────┬─────────────┬─────────────┐');
  console.log('│ Metric              │ OpenAI      │ Local       │');
  console.log('├─────────────────────┼─────────────┼─────────────┤');

  if (results.length === 2) {
    const [openai, local] = results;
    
    console.log(`│ Avg Time (ms)       │ ${String(openai.avgGenerationTime).padEnd(11)} │ ${String(local.avgGenerationTime).padEnd(11)} │`);
    console.log(`│ Quality Score (%)   │ ${String(openai.qualityScore.toFixed(1)).padEnd(11)} │ ${String(local.qualityScore.toFixed(1)).padEnd(11)} │`);
    console.log(`│ Total Cost ($)      │ ${String(openai.totalCost.toFixed(5)).padEnd(11)} │ ${String(local.totalCost.toFixed(5)).padEnd(11)} │`);
    console.log(`│ Memory (MB)         │ ${String(openai.memoryUsed).padEnd(11)} │ ${String(local.memoryUsed).padEnd(11)} │`);
    console.log(`│ Errors              │ ${String(openai.errors).padEnd(11)} │ ${String(local.errors).padEnd(11)} │`);
  } else if (results.length === 1) {
    const result = results[0];
    const col = result.provider === 'openai' ? 1 : 2;
    console.log(`│ Avg Time (ms)       ${col === 1 ? `│ ${String(result.avgGenerationTime).padEnd(11)} │ N/A         │` : `│ N/A         │ ${String(result.avgGenerationTime).padEnd(11)} │`}`);
    console.log(`│ Quality Score (%)   ${col === 1 ? `│ ${String(result.qualityScore.toFixed(1)).padEnd(11)} │ N/A         │` : `│ N/A         │ ${String(result.qualityScore.toFixed(1)).padEnd(11)} │`}`);
    console.log(`│ Total Cost ($)      ${col === 1 ? `│ ${String(result.totalCost.toFixed(5)).padEnd(11)} │ N/A         │` : `│ N/A         │ ${String(result.totalCost.toFixed(5)).padEnd(11)} │`}`);
    console.log(`│ Memory (MB)         ${col === 1 ? `│ ${String(result.memoryUsed).padEnd(11)} │ N/A         │` : `│ N/A         │ ${String(result.memoryUsed).padEnd(11)} │`}`);
    console.log(`│ Errors              ${col === 1 ? `│ ${String(result.errors).padEnd(11)} │ N/A         │` : `│ N/A         │ ${String(result.errors).padEnd(11)} │`}`);
  }

  console.log('└─────────────────────┴─────────────┴─────────────┘');
  
  // Winner determination
  if (results.length === 2) {
    const [openai, local] = results;
    console.log('\n🏆 WINNER ANALYSIS:');
    console.log(`- Speed: ${local.avgGenerationTime < openai.avgGenerationTime ? '✅ Local' : '✅ OpenAI'} (${Math.abs(local.avgGenerationTime - openai.avgGenerationTime)}ms difference)`);
    console.log(`- Quality: ${local.qualityScore > openai.qualityScore ? '✅ Local' : '✅ OpenAI'} (${Math.abs(local.qualityScore - openai.qualityScore).toFixed(1)}% difference)`);
    console.log(`- Cost: ✅ Local (saves $${openai.totalCost.toFixed(5)} per benchmark)`);
    console.log(`- Memory: ${openai.memoryUsed < local.memoryUsed ? '✅ OpenAI' : '✅ Local'} (${Math.abs(local.memoryUsed - openai.memoryUsed)}MB difference)`);
  }

  console.log('\n💡 RECOMMENDATION:');
  if (results.length === 2) {
    const [openai, local] = results;
    if (local.qualityScore >= openai.qualityScore * 0.95) {
      console.log('✅ Use LOCAL embeddings - Similar quality, 100% cost savings!');
    } else {
      console.log('⚠️  OpenAI has better quality, but Local is still viable for most use cases');
    }
  } else {
    console.log('⚠️  Run with both providers to see full comparison');
  }

  console.log('\n');
}

// Run benchmark
runBenchmark().catch(console.error);
