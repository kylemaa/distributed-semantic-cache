/**
 * Cost Savings Calculator
 * 
 * Interactive calculator showing $$$ saved per 1M queries.
 * Can be run standalone or imported as a module.
 * 
 * Usage:
 *   npx tsx benchmarks/cost-calculator.ts
 *   
 * Or import:
 *   import { calculateSavings } from './cost-calculator';
 */

// ============================================================================
// PRICING MODELS (As of 2024)
// ============================================================================

export interface PricingModel {
  name: string;
  inputPer1kTokens: number;
  outputPer1kTokens: number;
  embeddingPer1kTokens: number;
  avgInputTokens: number;
  avgOutputTokens: number;
}

export const PRICING_MODELS: { [key: string]: PricingModel } = {
  'gpt-4-turbo': {
    name: 'GPT-4 Turbo',
    inputPer1kTokens: 0.01,
    outputPer1kTokens: 0.03,
    embeddingPer1kTokens: 0.00013,
    avgInputTokens: 100,
    avgOutputTokens: 300,
  },
  'gpt-4o': {
    name: 'GPT-4o',
    inputPer1kTokens: 0.005,
    outputPer1kTokens: 0.015,
    embeddingPer1kTokens: 0.00013,
    avgInputTokens: 100,
    avgOutputTokens: 300,
  },
  'gpt-4o-mini': {
    name: 'GPT-4o Mini',
    inputPer1kTokens: 0.00015,
    outputPer1kTokens: 0.0006,
    embeddingPer1kTokens: 0.00002,
    avgInputTokens: 100,
    avgOutputTokens: 300,
  },
  'gpt-3.5-turbo': {
    name: 'GPT-3.5 Turbo',
    inputPer1kTokens: 0.0005,
    outputPer1kTokens: 0.0015,
    embeddingPer1kTokens: 0.00002,
    avgInputTokens: 100,
    avgOutputTokens: 300,
  },
  'claude-3-opus': {
    name: 'Claude 3 Opus',
    inputPer1kTokens: 0.015,
    outputPer1kTokens: 0.075,
    embeddingPer1kTokens: 0.00013,
    avgInputTokens: 100,
    avgOutputTokens: 300,
  },
  'claude-3-sonnet': {
    name: 'Claude 3 Sonnet',
    inputPer1kTokens: 0.003,
    outputPer1kTokens: 0.015,
    embeddingPer1kTokens: 0.00013,
    avgInputTokens: 100,
    avgOutputTokens: 300,
  },
  'claude-3-haiku': {
    name: 'Claude 3 Haiku',
    inputPer1kTokens: 0.00025,
    outputPer1kTokens: 0.00125,
    embeddingPer1kTokens: 0.00002,
    avgInputTokens: 100,
    avgOutputTokens: 300,
  },
};

// ============================================================================
// CACHE CONFIGURATION
// ============================================================================

export interface CacheConfig {
  useLocalEmbeddings: boolean;
  hitRate: number; // 0-100
  l1Rate: number; // Percentage of L1 (exact) hits within cache hits
  l2Rate: number; // Percentage of L2 (normalized) hits within cache hits
  l3Rate: number; // Percentage of L3 (semantic) hits within cache hits
}

export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  useLocalEmbeddings: true,
  hitRate: 65, // Based on real-world testing
  l1Rate: 30,
  l2Rate: 25,
  l3Rate: 45,
};

// ============================================================================
// COST CALCULATION
// ============================================================================

export interface CostBreakdown {
  // Per query costs
  llmCostPerQuery: number;
  embeddingCostPerQuery: number;
  totalCostPerQuery: number;
  
  // Per million
  llmCostPer1M: number;
  embeddingCostPer1M: number;
  totalCostPer1M: number;
  
  // Monthly (1M/day)
  llmCostMonthly: number;
  embeddingCostMonthly: number;
  totalCostMonthly: number;
  
  // Annual
  llmCostAnnual: number;
  embeddingCostAnnual: number;
  totalCostAnnual: number;
}

export interface SavingsResult {
  // Baseline (no cache)
  baseline: CostBreakdown;
  
  // With cache
  withCache: CostBreakdown;
  
  // Savings
  savingsPerQuery: number;
  savingsPer1M: number;
  savingsMonthly: number;
  savingsAnnual: number;
  
  // Percentages
  percentSaved: number;
  effectiveHitRate: number;
  
  // Additional info
  model: PricingModel;
  cacheConfig: CacheConfig;
  queriesPerDay: number;
}

function calculateCostBreakdown(
  model: PricingModel,
  queriesPerDay: number,
  llmCallRate: number, // 0-1, percentage of queries that need LLM
  embeddingCallRate: number, // 0-1, percentage of queries that need embedding
): CostBreakdown {
  const llmCostPerQuery = (
    (model.avgInputTokens / 1000) * model.inputPer1kTokens +
    (model.avgOutputTokens / 1000) * model.outputPer1kTokens
  ) * llmCallRate;
  
  const embeddingCostPerQuery = (
    (model.avgInputTokens / 1000) * model.embeddingPer1kTokens
  ) * embeddingCallRate;
  
  const totalCostPerQuery = llmCostPerQuery + embeddingCostPerQuery;
  
  return {
    llmCostPerQuery,
    embeddingCostPerQuery,
    totalCostPerQuery,
    
    llmCostPer1M: llmCostPerQuery * 1_000_000,
    embeddingCostPer1M: embeddingCostPerQuery * 1_000_000,
    totalCostPer1M: totalCostPerQuery * 1_000_000,
    
    llmCostMonthly: llmCostPerQuery * queriesPerDay * 30,
    embeddingCostMonthly: embeddingCostPerQuery * queriesPerDay * 30,
    totalCostMonthly: totalCostPerQuery * queriesPerDay * 30,
    
    llmCostAnnual: llmCostPerQuery * queriesPerDay * 365,
    embeddingCostAnnual: embeddingCostPerQuery * queriesPerDay * 365,
    totalCostAnnual: totalCostPerQuery * queriesPerDay * 365,
  };
}

export function calculateSavings(
  modelName: string,
  queriesPerDay: number = 1_000_000,
  cacheConfig: CacheConfig = DEFAULT_CACHE_CONFIG,
): SavingsResult {
  const model = PRICING_MODELS[modelName];
  if (!model) {
    throw new Error(`Unknown model: ${modelName}. Available: ${Object.keys(PRICING_MODELS).join(', ')}`);
  }
  
  const hitRate = cacheConfig.hitRate / 100;
  
  // Baseline: 100% LLM calls, 100% embedding calls
  const baseline = calculateCostBreakdown(model, queriesPerDay, 1, 1);
  
  // With cache: only misses need LLM
  // L1/L2 hits don't need embedding, only L3 hits need embedding
  const missRate = 1 - hitRate;
  const l3HitRate = hitRate * (cacheConfig.l3Rate / 100);
  const embeddingRate = cacheConfig.useLocalEmbeddings ? 0 : (missRate + l3HitRate);
  
  const withCache = calculateCostBreakdown(model, queriesPerDay, missRate, embeddingRate);
  
  return {
    baseline,
    withCache,
    
    savingsPerQuery: baseline.totalCostPerQuery - withCache.totalCostPerQuery,
    savingsPer1M: baseline.totalCostPer1M - withCache.totalCostPer1M,
    savingsMonthly: baseline.totalCostMonthly - withCache.totalCostMonthly,
    savingsAnnual: baseline.totalCostAnnual - withCache.totalCostAnnual,
    
    percentSaved: ((baseline.totalCostMonthly - withCache.totalCostMonthly) / baseline.totalCostMonthly) * 100,
    effectiveHitRate: hitRate * 100,
    
    model,
    cacheConfig,
    queriesPerDay,
  };
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  } else if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(2)}K`;
  } else if (amount >= 1) {
    return `$${amount.toFixed(2)}`;
  } else {
    return `$${amount.toFixed(6)}`;
  }
}

function printResults(results: SavingsResult): void {
  console.log();
  console.log('═'.repeat(70));
  console.log('  COST SAVINGS CALCULATOR');
  console.log('═'.repeat(70));
  console.log();
  
  // Configuration
  console.log('📋 CONFIGURATION');
  console.log('─'.repeat(70));
  console.log(`   Model:           ${results.model.name}`);
  console.log(`   Queries/Day:     ${results.queriesPerDay.toLocaleString()}`);
  console.log(`   Cache Hit Rate:  ${results.cacheConfig.hitRate}%`);
  console.log(`   Local Embeddings: ${results.cacheConfig.useLocalEmbeddings ? 'Yes (Free)' : 'No (OpenAI)'}`);
  console.log();
  
  // Per Query Costs
  console.log('💵 COST PER QUERY');
  console.log('─'.repeat(70));
  console.log('┌────────────────────────┬────────────────┬────────────────┬────────────────┐');
  console.log('│ Cost Type              │ No Cache       │ With Cache     │ Savings        │');
  console.log('├────────────────────────┼────────────────┼────────────────┼────────────────┤');
  console.log(`│ ${'LLM Cost'.padEnd(22)} │ ${formatCurrency(results.baseline.llmCostPerQuery).padStart(14)} │ ${formatCurrency(results.withCache.llmCostPerQuery).padStart(14)} │ ${formatCurrency(results.baseline.llmCostPerQuery - results.withCache.llmCostPerQuery).padStart(14)} │`);
  console.log(`│ ${'Embedding Cost'.padEnd(22)} │ ${formatCurrency(results.baseline.embeddingCostPerQuery).padStart(14)} │ ${formatCurrency(results.withCache.embeddingCostPerQuery).padStart(14)} │ ${formatCurrency(results.baseline.embeddingCostPerQuery - results.withCache.embeddingCostPerQuery).padStart(14)} │`);
  console.log('├────────────────────────┼────────────────┼────────────────┼────────────────┤');
  console.log(`│ ${'TOTAL'.padEnd(22)} │ ${formatCurrency(results.baseline.totalCostPerQuery).padStart(14)} │ ${formatCurrency(results.withCache.totalCostPerQuery).padStart(14)} │ ${formatCurrency(results.savingsPerQuery).padStart(14)} │`);
  console.log('└────────────────────────┴────────────────┴────────────────┴────────────────┘');
  console.log();
  
  // Cost Per 1M Queries
  console.log('📊 COST PER 1 MILLION QUERIES');
  console.log('─'.repeat(70));
  console.log('┌────────────────────────┬────────────────┬────────────────┬────────────────┐');
  console.log('│ Cost Type              │ No Cache       │ With Cache     │ Savings        │');
  console.log('├────────────────────────┼────────────────┼────────────────┼────────────────┤');
  console.log(`│ ${'LLM Cost'.padEnd(22)} │ ${formatCurrency(results.baseline.llmCostPer1M).padStart(14)} │ ${formatCurrency(results.withCache.llmCostPer1M).padStart(14)} │ ${formatCurrency(results.baseline.llmCostPer1M - results.withCache.llmCostPer1M).padStart(14)} │`);
  console.log(`│ ${'Embedding Cost'.padEnd(22)} │ ${formatCurrency(results.baseline.embeddingCostPer1M).padStart(14)} │ ${formatCurrency(results.withCache.embeddingCostPer1M).padStart(14)} │ ${formatCurrency(results.baseline.embeddingCostPer1M - results.withCache.embeddingCostPer1M).padStart(14)} │`);
  console.log('├────────────────────────┼────────────────┼────────────────┼────────────────┤');
  console.log(`│ ${'TOTAL'.padEnd(22)} │ ${formatCurrency(results.baseline.totalCostPer1M).padStart(14)} │ ${formatCurrency(results.withCache.totalCostPer1M).padStart(14)} │ ${formatCurrency(results.savingsPer1M).padStart(14)} │`);
  console.log('└────────────────────────┴────────────────┴────────────────┴────────────────┘');
  console.log();
  
  // Monthly & Annual Projections
  console.log('📅 MONTHLY COSTS (at ' + results.queriesPerDay.toLocaleString() + ' queries/day)');
  console.log('─'.repeat(70));
  console.log('┌────────────────────────┬────────────────┬────────────────┬────────────────┐');
  console.log('│ Scenario               │ No Cache       │ With Cache     │ Savings        │');
  console.log('├────────────────────────┼────────────────┼────────────────┼────────────────┤');
  console.log(`│ ${'Monthly'.padEnd(22)} │ ${formatCurrency(results.baseline.totalCostMonthly).padStart(14)} │ ${formatCurrency(results.withCache.totalCostMonthly).padStart(14)} │ ${formatCurrency(results.savingsMonthly).padStart(14)} │`);
  console.log(`│ ${'Annual'.padEnd(22)} │ ${formatCurrency(results.baseline.totalCostAnnual).padStart(14)} │ ${formatCurrency(results.withCache.totalCostAnnual).padStart(14)} │ ${formatCurrency(results.savingsAnnual).padStart(14)} │`);
  console.log('└────────────────────────┴────────────────┴────────────────┴────────────────┘');
  console.log();
  
  // Summary
  console.log('🎯 SAVINGS SUMMARY');
  console.log('─'.repeat(70));
  console.log(`   💰 You save ${formatCurrency(results.savingsMonthly)} per month (${results.percentSaved.toFixed(1)}% reduction)`);
  console.log(`   💰 You save ${formatCurrency(results.savingsAnnual)} per year`);
  console.log(`   ⚡ Cache hit rate: ${results.effectiveHitRate.toFixed(1)}%`);
  console.log();
  
  // Visual savings bar
  const savingsPercent = Math.round(results.percentSaved);
  const savingsBar = '█'.repeat(Math.round(savingsPercent / 2));
  const remainingBar = '░'.repeat(50 - Math.round(savingsPercent / 2));
  console.log(`   Cost Reduction: [${savingsBar}${remainingBar}] ${savingsPercent}%`);
  console.log();
}

function runInteractiveCalculator(): void {
  console.log();
  console.log('═'.repeat(70));
  console.log('  COST SAVINGS COMPARISON ACROSS MODELS');
  console.log('═'.repeat(70));
  console.log();
  console.log('  Assumptions:');
  console.log('  • 1,000,000 queries per day');
  console.log('  • 65% cache hit rate');
  console.log('  • 100 input tokens, 300 output tokens average');
  console.log('  • Local embeddings (zero embedding cost)');
  console.log();
  
  const queriesPerDay = 1_000_000;
  const allResults: SavingsResult[] = [];
  
  for (const modelName of Object.keys(PRICING_MODELS)) {
    allResults.push(calculateSavings(modelName, queriesPerDay, DEFAULT_CACHE_CONFIG));
  }
  
  // Sort by annual savings
  allResults.sort((a, b) => b.savingsAnnual - a.savingsAnnual);
  
  console.log('📊 ANNUAL SAVINGS BY MODEL');
  console.log('─'.repeat(70));
  console.log('┌───────────────────────┬────────────────┬────────────────┬────────────────┐');
  console.log('│ Model                 │ No Cache/Year  │ With Cache     │ Annual Savings │');
  console.log('├───────────────────────┼────────────────┼────────────────┼────────────────┤');
  
  for (const result of allResults) {
    console.log(`│ ${result.model.name.padEnd(21)} │ ${formatCurrency(result.baseline.totalCostAnnual).padStart(14)} │ ${formatCurrency(result.withCache.totalCostAnnual).padStart(14)} │ ${formatCurrency(result.savingsAnnual).padStart(14)} │`);
  }
  
  console.log('└───────────────────────┴────────────────┴────────────────┴────────────────┘');
  console.log();
  
  // Top model analysis
  const topModel = allResults[0];
  console.log('🏆 BIGGEST SAVINGS OPPORTUNITY');
  console.log('─'.repeat(70));
  console.log(`   Model: ${topModel.model.name}`);
  console.log(`   Without Cache: ${formatCurrency(topModel.baseline.totalCostAnnual)}/year`);
  console.log(`   With Cache:    ${formatCurrency(topModel.withCache.totalCostAnnual)}/year`);
  console.log(`   Savings:       ${formatCurrency(topModel.savingsAnnual)}/year (${topModel.percentSaved.toFixed(0)}% reduction)`);
  console.log();
  
  // Most cost-effective option
  const cheapestWithCache = allResults.reduce((min, r) => 
    r.withCache.totalCostAnnual < min.withCache.totalCostAnnual ? r : min
  );
  
  console.log('💡 MOST COST-EFFECTIVE OPTION');
  console.log('─'.repeat(70));
  console.log(`   Model: ${cheapestWithCache.model.name}`);
  console.log(`   Annual Cost with Cache: ${formatCurrency(cheapestWithCache.withCache.totalCostAnnual)}`);
  console.log(`   Still saves ${topModel.percentSaved.toFixed(0)}% vs running without cache`);
  console.log();
  
  // Print detailed analysis for GPT-4o (most common)
  console.log('═'.repeat(70));
  console.log('  DETAILED ANALYSIS: GPT-4o');
  console.log('═'.repeat(70));
  printResults(calculateSavings('gpt-4o', queriesPerDay, DEFAULT_CACHE_CONFIG));
  
  // ROI Calculator
  console.log('═'.repeat(70));
  console.log('  ROI AT DIFFERENT VOLUMES');
  console.log('═'.repeat(70));
  console.log();
  
  const volumes = [10_000, 100_000, 1_000_000, 10_000_000];
  
  console.log('📈 MONTHLY SAVINGS BY QUERY VOLUME (GPT-4o)');
  console.log('─'.repeat(70));
  console.log('┌────────────────────────┬────────────────┬────────────────┬────────────────┐');
  console.log('│ Daily Queries          │ No Cache/Month │ With Cache     │ Monthly Savings│');
  console.log('├────────────────────────┼────────────────┼────────────────┼────────────────┤');
  
  for (const vol of volumes) {
    const result = calculateSavings('gpt-4o', vol, DEFAULT_CACHE_CONFIG);
    console.log(`│ ${vol.toLocaleString().padEnd(22)} │ ${formatCurrency(result.baseline.totalCostMonthly).padStart(14)} │ ${formatCurrency(result.withCache.totalCostMonthly).padStart(14)} │ ${formatCurrency(result.savingsMonthly).padStart(14)} │`);
  }
  
  console.log('└────────────────────────┴────────────────┴────────────────┴────────────────┘');
  console.log();
  
  // Call to action
  console.log('═'.repeat(70));
  console.log('  GET STARTED');
  console.log('═'.repeat(70));
  console.log();
  console.log('  🚀 Ready to save on LLM costs? Install the distributed semantic cache:');
  console.log();
  console.log('     npm install @distributed-semantic-cache/api');
  console.log();
  console.log('  📚 Documentation: https://github.com/your-org/distributed-semantic-cache');
  console.log();
}

// Run if called directly
runInteractiveCalculator();

export { runInteractiveCalculator };
