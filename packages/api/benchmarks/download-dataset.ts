/**
 * Download and Prepare Real-World Query Datasets
 * 
 * Options:
 * 1. ShareGPT - Real ChatGPT conversations
 * 2. MS MARCO - Real search queries
 * 3. Alpaca - Instruction-following queries
 * 
 * Usage:
 *   npx tsx benchmarks/download-dataset.ts [dataset]
 *   npx tsx benchmarks/download-dataset.ts sharegpt
 *   npx tsx benchmarks/download-dataset.ts msmarco
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATASETS = {
  // ShareGPT - Real ChatGPT conversations (smaller sample)
  sharegpt: {
    name: 'ShareGPT',
    url: 'https://huggingface.co/datasets/anon8231489123/ShareGPT_Vicuna_unfiltered/resolve/main/ShareGPT_V3_unfiltered_cleaned_split.json',
    description: 'Real ChatGPT user conversations',
    extractor: (data: any[]) => {
      const queries: string[] = [];
      for (const conv of data.slice(0, 10000)) {
        if (conv.conversations) {
          for (const msg of conv.conversations) {
            if (msg.from === 'human' && msg.value && msg.value.length < 500) {
              queries.push(msg.value.trim());
            }
          }
        }
      }
      return queries;
    }
  },
  
  // Alpaca - Instruction dataset
  alpaca: {
    name: 'Alpaca',
    url: 'https://raw.githubusercontent.com/tatsu-lab/stanford_alpaca/main/alpaca_data.json',
    description: 'Stanford Alpaca instruction dataset',
    extractor: (data: any[]) => {
      return data
        .slice(0, 10000)
        .map(item => item.instruction + (item.input ? ` ${item.input}` : ''))
        .filter(q => q.length > 10 && q.length < 500);
    }
  },
};

async function downloadDataset(datasetName: string) {
  const dataset = DATASETS[datasetName as keyof typeof DATASETS];
  if (!dataset) {
    console.error(`Unknown dataset: ${datasetName}`);
    console.log('Available datasets:', Object.keys(DATASETS).join(', '));
    process.exit(1);
  }
  
  console.log(`\n📥 Downloading ${dataset.name}...`);
  console.log(`   ${dataset.description}\n`);
  
  try {
    const response = await fetch(dataset.url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    console.log('   Parsing JSON...');
    const data = await response.json();
    
    console.log('   Extracting queries...');
    const queries = dataset.extractor(data);
    
    // Save to file
    const outputPath = path.join(__dirname, `dataset-${datasetName}.json`);
    fs.writeFileSync(outputPath, JSON.stringify({
      source: dataset.name,
      description: dataset.description,
      count: queries.length,
      queries: queries,
    }, null, 2));
    
    console.log(`\n✅ Success!`);
    console.log(`   Extracted ${queries.length} queries`);
    console.log(`   Saved to: ${outputPath}`);
    
    // Show sample
    console.log('\n📝 Sample queries:');
    for (const q of queries.slice(0, 5)) {
      console.log(`   • "${q.substring(0, 80)}${q.length > 80 ? '...' : ''}"`);
    }
    
  } catch (error) {
    console.error('❌ Download failed:', error);
    console.log('\n💡 Alternative: Create a manual dataset');
    console.log('   See instructions below...\n');
    printManualInstructions();
  }
}

function printManualInstructions() {
  console.log(`
═══════════════════════════════════════════════════════════════════
MANUAL DATASET COLLECTION OPTIONS
═══════════════════════════════════════════════════════════════════

Option 1: Export from your own application
------------------------------------------
If you deploy the cache, log queries for a few days:

  // In your API handler:
  fs.appendFileSync('queries.log', query + '\\n');

Option 2: Download from HuggingFace manually
--------------------------------------------
1. Go to: https://huggingface.co/datasets
2. Search for: "chat", "conversations", "instructions"
3. Download and extract queries

Recommended datasets on HuggingFace:
  • lmsys/lmsys-chat-1m (1M real ChatGPT conversations)
  • anon8231489123/ShareGPT_Vicuna_unfiltered
  • databricks/databricks-dolly-15k

Option 3: Generate synthetic but diverse
----------------------------------------
Use an LLM to generate 10K diverse queries:

  "Generate 100 diverse questions a user might ask ChatGPT about [topic]"

Option 4: Use MS MARCO
----------------------
Download from: https://microsoft.github.io/msmarco/
Extract queries from qrels or queries files.

═══════════════════════════════════════════════════════════════════
`);
}

// Main
const datasetName = process.argv[2] || 'alpaca';
console.log('\n' + '═'.repeat(70));
console.log('REAL-WORLD DATASET DOWNLOADER');
console.log('═'.repeat(70));

if (datasetName === 'help' || datasetName === '--help') {
  console.log('\nUsage: npx tsx benchmarks/download-dataset.ts [dataset]\n');
  console.log('Available datasets:');
  for (const [key, val] of Object.entries(DATASETS)) {
    console.log(`  ${key.padEnd(12)} - ${val.description}`);
  }
  printManualInstructions();
} else {
  downloadDataset(datasetName);
}
