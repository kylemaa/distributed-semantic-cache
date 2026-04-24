/**
 * Quality Evaluation for Semantic Cache Hits
 *
 * Reads hit-pairs-{dataset}.json and uses GPT-4o-mini to judge
 * whether each cache hit would actually be correct.
 *
 * Usage:
 *   npx tsx benchmarks/quality-eval.ts alpaca
 *   npx tsx benchmarks/quality-eval.ts dolly
 *   npx tsx benchmarks/quality-eval.ts all
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('❌ ANTHROPIC_API_KEY not found in environment');
  process.exit(1);
}

const DATASETS = ['alpaca', 'dolly', 'hhrlhf', 'wizardlm'];
const MAX_PAIRS = 100;
const DELAY_MS = 50;

// ============================================================================
// TYPES
// ============================================================================

interface HitPair {
  cacheQuery: string;
  testQuery: string;
  similarity: number;
  dataset: string;
}

interface EvalResult {
  cacheQuery: string;
  testQuery: string;
  similarity: number;
  judgment: 'YES' | 'NO' | 'PARTIAL';
}

interface QualityReport {
  dataset: string;
  totalPairs: number;
  evaluated: number;
  summary: {
    yes: number;
    no: number;
    partial: number;
    precision: number;
  };
  results: EvalResult[];
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stratifiedSample(pairs: HitPair[], n: number): HitPair[] {
  const sorted = [...pairs].sort((a, b) => a.similarity - b.similarity);
  const step = Math.floor(sorted.length / n);
  const sampled: HitPair[] = [];
  for (let i = 0; i < sorted.length && sampled.length < n; i += step) {
    sampled.push(sorted[i]);
  }
  return sampled;
}

// ============================================================================
// CLAUDE JUDGE (via Anthropic API)
// ============================================================================

async function judgePair(pair: HitPair): Promise<'YES' | 'NO' | 'PARTIAL'> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-6',
      max_tokens: 10,
      messages: [
        {
          role: 'user',
          content: `You are evaluating a semantic cache system.

Original question: ${pair.cacheQuery}
New question: ${pair.testQuery}

Would the response to the original question adequately answer the new question?

Answer with exactly one word: YES, NO, or PARTIAL`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const text = (data.content[0].text as string).trim().toUpperCase();

  if (text.startsWith('YES')) return 'YES';
  if (text.startsWith('PARTIAL')) return 'PARTIAL';
  return 'NO';
}

// ============================================================================
// EVALUATE ONE DATASET
// ============================================================================

async function evaluateDataset(dataset: string): Promise<QualityReport> {
  const pairsPath = path.join(__dirname, `hit-pairs-${dataset}.json`);

  if (!fs.existsSync(pairsPath)) {
    console.error(`❌ hit-pairs-${dataset}.json not found. Run the ablation first.`);
    process.exit(1);
  }

  const allPairs: HitPair[] = JSON.parse(fs.readFileSync(pairsPath, 'utf-8'));
  const totalPairs = allPairs.length;
  const pairs = totalPairs > MAX_PAIRS ? stratifiedSample(allPairs, MAX_PAIRS) : allPairs;
  const evaluated = pairs.length;

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`Dataset: ${dataset.toUpperCase()}`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`  Total hit pairs:  ${totalPairs}`);
  console.log(`  Evaluating:       ${evaluated}`);
  console.log(`  Judge model:      Claude Opus 4.6\n`);

  const results: EvalResult[] = [];
  let yes = 0, no = 0, partial = 0;

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    process.stdout.write(`  [${String(i + 1).padStart(3)}/${evaluated}] sim=${pair.similarity.toFixed(3)}  `);

    const judgment = await judgePair(pair);
    results.push({
      cacheQuery: pair.cacheQuery,
      testQuery: pair.testQuery,
      similarity: pair.similarity,
      judgment,
    });

    if (judgment === 'YES') yes++;
    else if (judgment === 'PARTIAL') partial++;
    else no++;

    console.log(judgment);

    if (i < pairs.length - 1) await sleep(DELAY_MS);
  }

  const precision = (yes + partial * 0.5) / evaluated * 100;

  const report: QualityReport = {
    dataset,
    totalPairs,
    evaluated,
    summary: { yes, no, partial, precision },
    results,
  };

  const outputPath = path.join(__dirname, `quality-eval-${dataset}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\n  📄 Saved: ${outputPath}`);

  return report;
}

// ============================================================================
// SUMMARY TABLE
// ============================================================================

function printSummaryTable(reports: QualityReport[]): void {
  console.log('\n' + '═'.repeat(70));
  console.log('QUALITY EVALUATION SUMMARY');
  console.log('═'.repeat(70) + '\n');

  console.log('┌' + '─'.repeat(12) + '┬' + '─'.repeat(10) + '┬' + '─'.repeat(8) + '┬' + '─'.repeat(9) + '┬' + '─'.repeat(8) + '┬' + '─'.repeat(12) + '┐');
  console.log('│' + ' Dataset'.padEnd(12) + '│' + ' Evaluated'.padEnd(10) + '│' + ' YES'.padEnd(8) + '│' + ' PARTIAL'.padEnd(9) + '│' + ' NO'.padEnd(8) + '│' + ' Precision'.padEnd(12) + '│');
  console.log('├' + '─'.repeat(12) + '┼' + '─'.repeat(10) + '┼' + '─'.repeat(8) + '┼' + '─'.repeat(9) + '┼' + '─'.repeat(8) + '┼' + '─'.repeat(12) + '┤');

  for (const r of reports) {
    const { yes, no, partial, precision } = r.summary;
    console.log(
      '│' + ` ${r.dataset}`.padEnd(12) +
      '│' + ` ${r.evaluated}`.padEnd(10) +
      '│' + ` ${yes}`.padEnd(8) +
      '│' + ` ${partial}`.padEnd(9) +
      '│' + ` ${no}`.padEnd(8) +
      '│' + ` ${precision.toFixed(1)}%`.padEnd(12) + '│'
    );
  }

  console.log('└' + '─'.repeat(12) + '┴' + '─'.repeat(10) + '┴' + '─'.repeat(8) + '┴' + '─'.repeat(9) + '┴' + '─'.repeat(8) + '┴' + '─'.repeat(12) + '┘');

  if (reports.length > 1) {
    const avg = reports.reduce((sum, r) => sum + r.summary.precision, 0) / reports.length;
    console.log(`\n  Average precision across all datasets: ${avg.toFixed(1)}%`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.error('Usage: npx tsx benchmarks/quality-eval.ts <dataset|all>');
    console.error('  Datasets: alpaca, dolly, hhrlhf, wizardlm');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('SEMANTIC CACHE QUALITY EVALUATION (Claude Opus 4.6 judge)');
  console.log('═'.repeat(70));

  const targets = arg === 'all' ? DATASETS : [arg];
  console.log(`\n  Datasets:              ${targets.join(', ')}`);
  console.log(`  Max pairs per dataset: ${MAX_PAIRS}`);
  console.log(`  Judge model:           Claude Opus 4.6`);

  const reports: QualityReport[] = [];
  for (const dataset of targets) {
    reports.push(await evaluateDataset(dataset));
  }

  printSummaryTable(reports);
}

main().catch(console.error);
