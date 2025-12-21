import { pipeline, FeatureExtractionPipeline, env } from '@xenova/transformers';

// Configure transformers to cache models locally
env.cacheDir = './.cache/transformers';

/**
 * Local embedding models configuration
 */
export const LOCAL_EMBEDDING_MODELS = {
  'all-MiniLM-L6-v2': {
    name: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    description: 'Fast, lightweight model for semantic search (384d)',
  },
  'all-mpnet-base-v2': {
    name: 'Xenova/all-mpnet-base-v2',
    dimensions: 768,
    description: 'Higher quality embeddings, slower (768d)',
  },
  'e5-small-v2': {
    name: 'Xenova/e5-small-v2',
    dimensions: 384,
    description: 'Multilingual support, good quality (384d)',
  },
} as const;

export type LocalEmbeddingModelId = keyof typeof LOCAL_EMBEDDING_MODELS;

/**
 * Local embeddings provider using Transformer.js
 * Runs embedding models directly in Node.js (no API calls)
 */
export class LocalEmbeddingsProvider {
  private pipeline: FeatureExtractionPipeline | null = null;
  private modelId: LocalEmbeddingModelId;
  private modelConfig: typeof LOCAL_EMBEDDING_MODELS[LocalEmbeddingModelId];
  private isInitialized = false;

  constructor(modelId: LocalEmbeddingModelId = 'all-MiniLM-L6-v2') {
    this.modelId = modelId;
    this.modelConfig = LOCAL_EMBEDDING_MODELS[modelId];
  }

  /**
   * Initialize the embedding model (lazy loading)
   * Downloads model on first use, then caches locally
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    console.log(`[LocalEmbeddings] Loading model: ${this.modelConfig.name}...`);
    const startTime = Date.now();

    try {
      this.pipeline = await pipeline('feature-extraction', this.modelConfig.name);
      this.isInitialized = true;

      const loadTime = Date.now() - startTime;
      console.log(`[LocalEmbeddings] Model loaded in ${loadTime}ms`);
    } catch (error) {
      console.error('[LocalEmbeddings] Failed to load model:', error);
      throw new Error(`Failed to initialize local embedding model: ${error}`);
    }
  }

  /**
   * Generate embedding for a single text input
   * @param text - Input text to embed
   * @returns Embedding vector (normalized)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    await this.initialize();

    if (!this.pipeline) {
      throw new Error('Embedding pipeline not initialized');
    }

    const startTime = Date.now();

    // Generate embedding using the model
    const output = await this.pipeline(text, { pooling: 'mean', normalize: true });

    // Convert tensor to regular array
    const embedding = Array.from(output.data) as number[];

    const duration = Date.now() - startTime;
    console.log(`[LocalEmbeddings] Generated embedding in ${duration}ms (${embedding.length}d)`);

    return embedding;
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   * @param texts - Array of input texts
   * @returns Array of embedding vectors
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    await this.initialize();

    if (!this.pipeline) {
      throw new Error('Embedding pipeline not initialized');
    }

    const startTime = Date.now();

    // Process in batch for efficiency
    const embeddings: number[][] = [];

    for (const text of texts) {
      const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
      embeddings.push(Array.from(output.data) as number[]);
    }

    const duration = Date.now() - startTime;
    console.log(`[LocalEmbeddings] Generated ${texts.length} embeddings in ${duration}ms`);

    return embeddings;
  }

  /**
   * Get model information
   */
  getModelInfo() {
    return {
      modelId: this.modelId,
      modelName: this.modelConfig.name,
      dimensions: this.modelConfig.dimensions,
      description: this.modelConfig.description,
      isInitialized: this.isInitialized,
    };
  }

  /**
   * Get expected embedding dimensions for this model
   */
  getDimensions(): number {
    return this.modelConfig.dimensions;
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    this.pipeline = null;
    this.isInitialized = false;
    console.log('[LocalEmbeddings] Pipeline disposed');
  }
}

/**
 * Create a local embeddings provider instance
 * @param modelId - Model to use (default: all-MiniLM-L6-v2)
 */
export function createLocalEmbeddingsProvider(
  modelId: LocalEmbeddingModelId = 'all-MiniLM-L6-v2'
): LocalEmbeddingsProvider {
  return new LocalEmbeddingsProvider(modelId);
}
