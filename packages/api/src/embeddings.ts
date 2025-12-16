/**
 * Embeddings service with support for OpenAI and local models
 */

import OpenAI from 'openai';
import { config } from './config.js';
import { LRUCache, type LRUCacheStats } from './lru-cache.js';
import { LocalEmbeddingsProvider, type LocalEmbeddingModelId } from './local-embeddings.js';

export class EmbeddingsService {
  private openai: OpenAI | null = null;
  private localProvider: LocalEmbeddingsProvider | null = null;
  private provider: 'openai' | 'local';
  private model: string;
  private cache: LRUCache<string, number[]>;

  constructor(cacheSize?: number, provider?: 'openai' | 'local') {
    this.provider = provider ?? config.embeddings.provider;
    this.cache = new LRUCache(cacheSize ?? config.embeddings.cacheSize);

    // Initialize the appropriate provider
    if (this.provider === 'openai') {
      this.openai = new OpenAI({
        apiKey: config.openai.apiKey,
      });
      this.model = config.openai.embeddingModel;
      console.log(`[Embeddings] Using OpenAI provider (${this.model})`);
    } else {
      const localModel = config.embeddings.localModel as LocalEmbeddingModelId;
      this.localProvider = new LocalEmbeddingsProvider(localModel);
      this.model = localModel;
      console.log(`[Embeddings] Using local provider (${localModel})`);
    }
  }

  /**
   * Generate embedding for a text string (with caching)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    return this.cache.getOrCompute(text, async () => {
      if (this.provider === 'openai') {
        return this.generateOpenAIEmbedding(text);
      } else {
        return this.generateLocalEmbedding(text);
      }
    });
  }

  /**
   * Generate embedding using OpenAI API
   */
  private async generateOpenAIEmbedding(text: string): Promise<number[]> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: text,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('[Embeddings] Error generating OpenAI embedding:', error);
      throw new Error('Failed to generate OpenAI embedding');
    }
  }

  /**
   * Generate embedding using local model
   */
  private async generateLocalEmbedding(text: string): Promise<number[]> {
    if (!this.localProvider) {
      throw new Error('Local embeddings provider not initialized');
    }

    try {
      return await this.localProvider.generateEmbedding(text);
    } catch (error) {
      console.error('[Embeddings] Error generating local embedding:', error);
      throw new Error('Failed to generate local embedding');
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): LRUCacheStats {
    return this.cache.getStats();
  }

  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Generate embeddings for multiple texts
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (this.provider === 'openai') {
      return this.generateOpenAIEmbeddings(texts);
    } else {
      return this.generateLocalEmbeddings(texts);
    }
  }

  /**
   * Generate embeddings using OpenAI API (batch)
   */
  private async generateOpenAIEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts,
      });

      return response.data.map((item) => item.embedding);
    } catch (error) {
      console.error('[Embeddings] Error generating OpenAI embeddings:', error);
      throw new Error('Failed to generate OpenAI embeddings');
    }
  }

  /**
   * Generate embeddings using local model (batch)
   */
  private async generateLocalEmbeddings(texts: string[]): Promise<number[][]> {
    if (!this.localProvider) {
      throw new Error('Local embeddings provider not initialized');
    }

    try {
      return await this.localProvider.generateEmbeddings(texts);
    } catch (error) {
      console.error('[Embeddings] Error generating local embeddings:', error);
      throw new Error('Failed to generate local embeddings');
    }
  }

  /**
   * Get provider information
   */
  getProviderInfo() {
    if (this.provider === 'openai') {
      return {
        provider: 'openai',
        model: this.model,
        apiKey: this.openai ? 'configured' : 'missing',
      };
    } else {
      return {
        provider: 'local',
        ...this.localProvider?.getModelInfo(),
      };
    }
  }

  /**
   * Cleanup resources
   */
  async dispose(): Promise<void> {
    if (this.localProvider) {
      await this.localProvider.dispose();
    }
    this.cache.clear();
  }
}
