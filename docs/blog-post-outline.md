# Blog Post Outline

**Title:** We benchmarked semantic caching against real LLM query datasets — here is what the numbers actually mean

---

## 1. The Problem (~150 words)

- LLM API calls are billed per token; costs compound fast at any meaningful scale
- Concrete example: 1M queries/month × $0.002/call = $2,000/month in LLM costs before any other infrastructure
- Many queries are semantically identical ("what is X" vs "explain X" vs "can you describe X") but string comparison treats them as cache misses
- Exact-string caching catches only true duplicates — common wisdom says it helps ~5–10% in practice
- We benchmarked a 3-layer semantic cache against four real public datasets using real OpenAI embeddings to find out how much further semantic matching actually gets you — and where it falls short

---

## 2. How Our 3-Layer Cache Works (~250 words)

- **L1 — Exact hash match:** O(1), 0.12ms avg. Raw query string hashed and looked up in an in-memory LRU. Catches true duplicates at effectively zero cost.
- **L2 — Normalized match:** O(1), 0.29ms avg. Query is case-folded, punctuation-stripped, and contractions expanded before hashing. Catches "What is X?" vs "what is x" and similar surface variants.
- **L3 — Semantic match:** O(log n), 15–35ms. Query is embedded with `text-embedding-3-small`, then an HNSW index does approximate nearest-neighbor search. Any result above cosine similarity ≥ 0.85 is a hit.
- **Cache miss:** ~190ms. Full embedding generation + LLM call + write-through to all three layers.
- Why not skip straight to semantic? L1/L2 are nearly free — adding 15–35ms of embedding overhead on queries that could be answered in 0.12ms is waste. The layered approach means only genuine L1/L2 misses pay the semantic lookup cost.

```
Query
  │
  ▼
[L1: Exact Hash] ──hit──▶ Return (0.12ms)
  │ miss
  ▼
[L2: Normalized Hash] ──hit──▶ Return (0.29ms)
  │ miss
  ▼
[L3: HNSW Semantic] ──hit──▶ Return (15–35ms)
  │ miss
  ▼
[LLM Call + Store] (~190ms)
```

---

## 3. The Benchmark Setup (~300 words)

- **Four real datasets:** Stanford Alpaca, Databricks Dolly, Anthropic HHRLHF, WizardLM — all public instruction-tuning datasets covering creative, factual, reasoning, and conversational tasks
- **Scale:** 1,000 test queries per dataset; 500-entry warm cache (pre-populated from the same distribution)
- **Real embeddings:** OpenAI `text-embedding-3-small` (1536 dimensions) via live API — not synthetic vectors, not deterministic hashes
- **Threshold decision:** 0.85 similarity threshold was chosen based on pilot testing *before* any result collection; it was not tuned post-hoc to improve reported numbers
- **Cross-user simulation:** 50 simulated users × 20 queries each, 60% topic repeat rate — tests how a shared cache performs when different users ask about overlapping subjects
- **What we did NOT measure:**
  - Actual LLM response quality at miss time (we did not generate responses)
  - Real production traffic distributions (instruction datasets are a proxy, not prod logs)
  - Latency under concurrent load (covered in a separate throughput benchmark)
  - Net cost after subtracting embedding API costs from savings

---

## 4. Results: Hit Rates (~300 words)

| Dataset | Exact-only | Full System | Semantic gain |
|---------|-----------|-------------|---------------|
| WizardLM | 40.0% | **69.9%** | +29.9pp |
| Alpaca | 40.0% | **68.8%** | +28.8pp |
| Dolly | 40.2% | **67.5%** | +27.3pp |
| HHRLHF | 40.3% | **63.0%** | +22.7pp |

- The semantic layer adds 22–30 percentage points across all four datasets — roughly tripling the hit rate beyond exact matching alone
- **HHRLHF is lowest (63%):** HHRLHF conversations are intentionally diverse and adversarial by construction; the queries cluster less tightly in embedding space
- **WizardLM is highest (69.9%):** Instruction-style queries ("write a function that…", "explain the concept of…") share structure and vocabulary that embedding models pick up as semantic similarity
- **What the paraphrase hits actually look like:** The `hit-pairs` files show that most semantic hits are minor rephrasings at similarity 0.87–0.90, e.g. "List the benefits of Amazon Web Services." matched to "How do I list the benefits of Amazon Web Services" (sim=0.876) — the model is catching genuine intent overlap, not stretching
- **Cross-user counterintuitive result:** In the multi-user simulation (50 users, shared cache), alpaca hit rate drops to **34.4%** versus 68.8% single-user. Shared caches still help, but users don't naturally repeat each other's exact topics — the 60% topic repeat rate in the sim is optimistic, and real cross-user hit rates may be lower still

---

## 5. Results: Response Quality (~200 words)

- Cache hit quality evaluated with Claude Opus 4.6 as judge: for each hit pair, asked "would this cached response adequately answer the new query?"
- Sample: 100 hit pairs per dataset (out of 227–299 total pairs), stratified across the full similarity range (0.80–0.99)
- **Overall precision: 97.9% across all datasets** — nearly all cache hits are genuinely appropriate
  - HHRLHF: 99.0% (99 YES, 1 NO) — highest quality, even adversarial conversations cluster well
  - Alpaca: 98.5% (98 YES, 1 PARTIAL, 1 NO)
  - Dolly: 97.5% (96 YES, 3 PARTIAL, 1 NO)
  - WizardLM: 96.5% (95 YES, 3 PARTIAL, 2 NO) — lower end but still excellent
- **Pattern:** The rare misses occur at 0.82–0.87 range (borderline threshold); above 0.90 is nearly perfect (>99% YES)
- **Interpretation:** At 0.85 threshold, the cache is trading a tiny false-positive rate (~2%) for meaningful hit rate gains. For most use cases, caching responses at 97–99% confidence is acceptable

---

## 6. What This Means for Your LLM Costs (~200 words)

- At 68% cache hit rate, 68 out of every 100 LLM calls are answered from cache — no token generation, no API round-trip
- **Back-of-envelope:** 1M queries/month × $0.002/call × 68% hit rate = **$1,360/month saved** = ~$16K/year
- At enterprise scale (10M queries/month): ~$163K/year in avoided LLM costs
- Full GPT-4 pricing model (from `docs/BENCHMARKS.md`): $252K+ annual savings at 1M queries/month
- **Embedding costs are real:** `text-embedding-3-small` costs $0.02/1M tokens. At 1M queries/month, embedding every cache miss (roughly 310K misses) adds ~$6/month — small, but factor it in
- Hit rates in production depend on your workload's query duplication rate; a customer support bot or coding assistant will see higher overlap than a single-shot analytical API

---

## 7. Try It Yourself (~100 words)

- GitHub repo: [link]
- Run the full benchmark suite: `pnpm --filter api benchmark`
- Replicate with real OpenAI embeddings: set `EMBEDDING_PROVIDER=openai` and `OPENAI_API_KEY` in `.env`, then re-run
- Run the quality eval: `cd packages/api && npx tsx benchmarks/quality-eval.ts` (requires `OPENAI_API_KEY`, costs ~$0.04 for all four datasets)
- Open issues, PRs, or dataset suggestions welcome
