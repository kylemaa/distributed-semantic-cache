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
import { createGunzip } from 'zlib';
import { Readable } from 'stream';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATASETS = {
  // The Stack - Programming questions/code (using StarCoder training data sample)
  code: {
    name: 'Code-Questions',
    // Use HuggingFace API for a code-related dataset
    url: 'https://datasets-server.huggingface.co/rows?dataset=bigcode%2Fstarcoderdata&config=default&split=train&offset=0&length=100',
    description: 'Programming questions and code snippets',
    isPaginated: true,
    pageSize: 100,
    maxPages: 50, // 5K samples
    extractor: (data: any[]) => {
      const queries: string[] = [];
      for (const item of data) {
        const content = item.row?.content || item.content || '';
        // Extract first comment or docstring as "query"
        const docMatch = content.match(/"""([^"]+)"""|'''([^']+)'''|\/\*\*([^*]+)\*\/|\/\/\s*(.+)/);
        if (docMatch) {
          const doc = (docMatch[1] || docMatch[2] || docMatch[3] || docMatch[4] || '').trim();
          if (doc.length > 20 && doc.length < 300) {
            queries.push(doc);
          }
        }
      }
      return queries;
    }
  },
  
  // Anthropic HH-RLHF - Real human conversations for RLHF training (public)
  hhrlhf: {
    name: 'Anthropic-HH-RLHF',
    url: 'https://huggingface.co/datasets/Anthropic/hh-rlhf/resolve/main/helpful-base/train.jsonl.gz',
    description: 'Real human conversations for AI safety research (Anthropic)',
    isJsonl: true,
    isGzip: true,
    extractor: (data: any[]) => {
      const queries: string[] = [];
      for (const item of data.slice(0, 15000)) {
        // Format: chosen/rejected fields with \n\nHuman: ... \n\nAssistant: ...
        const text = item.chosen || item.rejected || '';
        const humanTurns = text.match(/\n\nHuman: ([^\n]+)/g) || [];
        for (const turn of humanTurns) {
          const query = turn.replace('\n\nHuman: ', '').trim();
          if (query.length > 10 && query.length < 500) {
            queries.push(query);
          }
        }
      }
      return queries;
    }
  },
  
  // LMSYS-Chat-1M - Requires HuggingFace auth
  lmsys: {
    name: 'LMSYS-Chat-1M',
    // HuggingFace datasets API - get first rows as JSON
    url: 'https://datasets-server.huggingface.co/rows?dataset=lmsys%2Flmsys-chat-1m&config=default&split=train&offset=0&length=100',
    description: 'Real ChatGPT/Claude/Bard conversations (1M dataset sample)',
    isPaginated: true,
    pageSize: 100,
    maxPages: 100, // 10K rows total
    extractor: (data: any[]) => {
      const queries: string[] = [];
      for (const item of data) {
        const conv = item.row?.conversation || item.conversation;
        if (conv && Array.isArray(conv)) {
          for (const msg of conv) {
            if (msg.role === 'user' && msg.content && msg.content.length > 10 && msg.content.length < 500) {
              queries.push(msg.content.trim());
            }
          }
        }
      }
      return queries;
    }
  },
  
  // Dolly - Databricks open instruction dataset (15K, small file)
  dolly: {
    name: 'Dolly',
    url: 'https://huggingface.co/datasets/databricks/databricks-dolly-15k/resolve/main/databricks-dolly-15k.jsonl',
    description: 'Databricks Dolly 15K instructions (real human-written)',
    isJsonl: true,
    extractor: (data: any[]) => {
      return data
        .slice(0, 10000)
        .map(item => item.instruction + (item.context ? ` ${item.context.slice(0, 200)}` : ''))
        .filter(q => q && q.length > 10 && q.length < 500);
    }
  },
  
  // OpenAssistant conversations (real chat data)
  oasst: {
    name: 'OpenAssistant',
    url: 'https://huggingface.co/datasets/OpenAssistant/oasst1/resolve/main/2023-04-12_oasst_ready.trees.jsonl.gz',
    description: 'OpenAssistant real conversations (community)',
    isGzip: true,
    isJsonl: true,
    extractor: (data: any[]) => {
      const queries: string[] = [];
      for (const tree of data.slice(0, 5000)) {
        if (tree.prompt && tree.prompt.text && tree.prompt.text.length < 500) {
          queries.push(tree.prompt.text.trim());
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
  
  // WizardLM evol-instruct (diverse instructions)
  wizardlm: {
    name: 'WizardLM',
    url: 'https://huggingface.co/datasets/WizardLM/WizardLM_evol_instruct_V2_196k/resolve/main/WizardLM_evol_instruct_V2_143k.json',
    description: 'WizardLM evolved instructions (diverse)',
    extractor: (data: any[]) => {
      return data
        .slice(0, 10000)
        .map((item: any) => {
          // Handle different formats
          if (item.instruction) return item.instruction;
          if (item.conversations && item.conversations[0]) {
            return item.conversations[0].value;
          }
          return '';
        })
        .filter((q: string) => q && q.length > 10 && q.length < 500);
    }
  },
};

async function downloadDataset(datasetName: string) {
  const dataset = DATASETS[datasetName as keyof typeof DATASETS] as any;
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
    
    let data: any[];
    
    if (dataset.isPaginated) {
      // Paginated API - fetch multiple pages
      console.log(`   Fetching paginated data (${dataset.maxPages} pages of ${dataset.pageSize})...`);
      data = [];
      const baseUrl = dataset.url.replace(/offset=\d+/, 'offset=');
      
      for (let page = 0; page < dataset.maxPages; page++) {
        const offset = page * dataset.pageSize;
        const url = baseUrl.replace('offset=', `offset=${offset}`);
        
        try {
          const pageResponse = await fetch(url);
          if (!pageResponse.ok) {
            console.log(`   Warning: Page ${page} failed, stopping at ${data.length} rows`);
            break;
          }
          
          const pageData = await pageResponse.json();
          if (pageData.rows && pageData.rows.length > 0) {
            data.push(...pageData.rows);
            if ((page + 1) % 10 === 0) {
              console.log(`   ${data.length} rows fetched...`);
            }
          } else {
            break; // No more data
          }
        } catch (e) {
          console.log(`   Page ${page} error, continuing with ${data.length} rows`);
          break;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 50));
      }
    } else if (dataset.isJsonl) {
      console.log('   Streaming JSONL...');
      let text: string;
      
      if (dataset.isGzip) {
        // Handle gzipped JSONL
        const buffer = Buffer.from(await response.arrayBuffer());
        text = await new Promise((resolve, reject) => {
          const chunks: Buffer[] = [];
          const gunzip = createGunzip();
          gunzip.on('data', (chunk) => chunks.push(chunk));
          gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
          gunzip.on('error', reject);
          gunzip.write(buffer);
          gunzip.end();
        });
      } else {
        text = await response.text();
      }
      
      data = text
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } else {
      console.log('   Parsing JSON...');
      data = await response.json();
    }
    
    console.log(`   Raw records: ${data.length}`);
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
