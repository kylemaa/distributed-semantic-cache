/**
 * Embeddings service using OpenAI with LRU caching
 */

import OpenAI from 'openai';
import { config } from './config.js';
import { LRUCache, type LRUCacheStats } from './lru-cache.js';

export class EmbeddingsService {
  private openai: OpenAI;
  private model: string;
  private cache: LRUCache<string, number[]>;

  constructor(cacheSize?: number) {
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
    });
    this.model = config.openai.embeddingModel;
    this.cache = new LRUCache(cacheSize ?? config.embeddings.cacheSize);
  }

  /**
   * Generate embedding for a text string (with caching)
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // Check cache first
    return this.cache.getOrCompute(text, async () => {
      try {
        const response = await this.openai.embeddings.create({
          model: this.model,
          input: text,
        });

        return response.data[0].embedding;
      } catch (error) {
        console.error('Error generating embedding:', error);
        throw new Error('Failed to generate embedding');
      }
    });
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
    try {
      const response = await this.openai.embeddings.create({
        model: this.model,
        input: texts,
      });

      return response.data.map((item) => item.embedding);
    } catch (error) {
      console.error('Error generating embeddings:', error);
      throw new Error('Failed to generate embeddings');
    }
  }
}
