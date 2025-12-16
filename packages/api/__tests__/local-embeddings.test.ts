/**
 * Tests for local embeddings provider
 * 
 * Note: These tests require downloading models on first run.
 * Set SKIP_LOCAL_TESTS=true to skip these tests.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { LocalEmbeddingsProvider, LOCAL_EMBEDDING_MODELS, createLocalEmbeddingsProvider } from '../src/local-embeddings.js';
import { cosineSimilarity } from '@distributed-semantic-cache/shared';

const skipTests = process.env.SKIP_LOCAL_TESTS === 'true';

describe.skipIf(skipTests)('LocalEmbeddingsProvider', () => {
  let provider: LocalEmbeddingsProvider;
  let initError: Error | null = null;

  beforeAll(async () => {
    try {
      provider = new LocalEmbeddingsProvider('all-MiniLM-L6-v2');
      // Initialize the model during setup to avoid timeout in individual tests
      await provider.initialize();
    } catch (error) {
      initError = error as Error;
      console.error('Failed to initialize local embeddings:', error);
    }
  }, 120000); // 2 minutes for initial model download

  afterAll(async () => {
    if (provider) {
      await provider.dispose();
    }
  });

  describe('Model Configuration', () => {
    it('should have correct model configurations', () => {
      expect(LOCAL_EMBEDDING_MODELS['all-MiniLM-L6-v2']).toEqual({
        name: 'Xenova/all-MiniLM-L6-v2',
        dimensions: 384,
        description: 'Fast, lightweight model for semantic search (384d)',
      });

      expect(LOCAL_EMBEDDING_MODELS['all-mpnet-base-v2']).toEqual({
        name: 'Xenova/all-mpnet-base-v2',
        dimensions: 768,
        description: 'Higher quality embeddings, slower (768d)',
      });
    });

    it('should return correct model info', () => {
      const info = provider.getModelInfo();
      expect(info.modelId).toBe('all-MiniLM-L6-v2');
      expect(info.dimensions).toBe(384);
      expect(info.modelName).toBe('Xenova/all-MiniLM-L6-v2');
    });

    it('should return correct dimensions', () => {
      expect(provider.getDimensions()).toBe(384);
    });
  });

  describe('Initialization', () => {
    it('should initialize lazily on first use', async () => {
      const newProvider = new LocalEmbeddingsProvider('all-MiniLM-L6-v2');
      
      const infoBefore = newProvider.getModelInfo();
      expect(infoBefore.isInitialized).toBe(false);

      await newProvider.generateEmbedding('test');

      const infoAfter = newProvider.getModelInfo();
      expect(infoAfter.isInitialized).toBe(true);

      await newProvider.dispose();
    });

    it('should not reinitialize if already initialized', async () => {
      const newProvider = new LocalEmbeddingsProvider('all-MiniLM-L6-v2');
      
      await newProvider.initialize();
      const firstInit = newProvider.getModelInfo().isInitialized;

      await newProvider.initialize();
      const secondInit = newProvider.getModelInfo().isInitialized;

      expect(firstInit).toBe(true);
      expect(secondInit).toBe(true);

      await newProvider.dispose();
    });
  });

  describe('Single Embedding Generation', () => {
    it('should generate embedding for text', async () => {
      const text = 'Hello world';
      const embedding = await provider.generateEmbedding(text);

      expect(embedding).toBeDefined();
      expect(Array.isArray(embedding)).toBe(true);
      expect(embedding.length).toBe(384);
      expect(embedding.every((val) => typeof val === 'number')).toBe(true);
    });

    it('should generate normalized embeddings', async () => {
      const text = 'Machine learning is fascinating';
      const embedding = await provider.generateEmbedding(text);

      // Calculate magnitude (should be ~1 for normalized vectors)
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      
      expect(magnitude).toBeGreaterThan(0.99);
      expect(magnitude).toBeLessThan(1.01);
    });

    it('should generate different embeddings for different texts', async () => {
      const text1 = 'What is artificial intelligence?';
      const text2 = 'How to cook pasta?';

      const embedding1 = await provider.generateEmbedding(text1);
      const embedding2 = await provider.generateEmbedding(text2);

      expect(embedding1).not.toEqual(embedding2);

      // Unrelated texts should have low similarity
      const similarity = cosineSimilarity(embedding1, embedding2);
      expect(similarity).toBeLessThan(0.5);
    });

    it('should generate similar embeddings for similar texts', async () => {
      const text1 = 'What is AI?';
      const text2 = 'What is artificial intelligence?';

      const embedding1 = await provider.generateEmbedding(text1);
      const embedding2 = await provider.generateEmbedding(text2);

      const similarity = cosineSimilarity(embedding1, embedding2);
      
      // Similar texts should have high similarity
      expect(similarity).toBeGreaterThan(0.7);
    });

    it('should handle empty strings', async () => {
      const embedding = await provider.generateEmbedding('');
      
      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(384);
    });

    it('should handle special characters', async () => {
      const text = '!@#$%^&*()_+ 你好 мир';
      const embedding = await provider.generateEmbedding(text);

      expect(embedding).toBeDefined();
      expect(embedding.length).toBe(384);
    });
  });

  describe('Batch Embedding Generation', () => {
    it('should generate embeddings for multiple texts', async () => {
      const texts = [
        'Hello world',
        'Machine learning',
        'Natural language processing',
      ];

      const embeddings = await provider.generateEmbeddings(texts);

      expect(embeddings).toBeDefined();
      expect(Array.isArray(embeddings)).toBe(true);
      expect(embeddings.length).toBe(3);
      expect(embeddings.every((emb) => emb.length === 384)).toBe(true);
    });

    it('should handle empty array', async () => {
      const embeddings = await provider.generateEmbeddings([]);
      
      expect(embeddings).toBeDefined();
      expect(embeddings.length).toBe(0);
    });

    it('should generate consistent embeddings in batch vs single', async () => {
      const text = 'Consistent embedding test';

      const singleEmbedding = await provider.generateEmbedding(text);
      const batchEmbeddings = await provider.generateEmbeddings([text]);

      // Should be very similar (allowing small numerical differences)
      const similarity = cosineSimilarity(singleEmbedding, batchEmbeddings[0]);
      expect(similarity).toBeGreaterThan(0.99);
    });
  });

  describe('Semantic Similarity', () => {
    it('should recognize semantic similarity between phrases', async () => {
      const pairs = [
        ['dog', 'puppy'],
        ['car', 'automobile'],
        ['happy', 'joyful'],
        ['big', 'large'],
      ];

      for (const [word1, word2] of pairs) {
        const emb1 = await provider.generateEmbedding(word1);
        const emb2 = await provider.generateEmbedding(word2);
        const similarity = cosineSimilarity(emb1, emb2);

        expect(similarity).toBeGreaterThan(0.6);
      }
    });

    it('should distinguish dissimilar concepts', async () => {
      const pairs = [
        ['dog', 'computer'],
        ['happy', 'algorithm'],
        ['car', 'philosophy'],
      ];

      for (const [word1, word2] of pairs) {
        const emb1 = await provider.generateEmbedding(word1);
        const emb2 = await provider.generateEmbedding(word2);
        const similarity = cosineSimilarity(emb1, emb2);

        expect(similarity).toBeLessThan(0.5);
      }
    });

    it('should handle case insensitivity semantically', async () => {
      const text1 = 'HELLO WORLD';
      const text2 = 'hello world';

      const emb1 = await provider.generateEmbedding(text1);
      const emb2 = await provider.generateEmbedding(text2);
      
      const similarity = cosineSimilarity(emb1, emb2);
      expect(similarity).toBeGreaterThan(0.95);
    });
  });

  describe('Performance', () => {
    it('should generate embeddings in reasonable time', async () => {
      const text = 'Performance test for local embeddings';
      const startTime = Date.now();

      await provider.generateEmbedding(text);

      const duration = Date.now() - startTime;
      
      // First call might be slower due to initialization
      // But should still complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    });

    it('should be faster on subsequent calls', async () => {
      const text = 'Repeated embedding generation';

      // First call (warm up)
      await provider.generateEmbedding(text);

      // Measure subsequent calls
      const startTime = Date.now();
      await provider.generateEmbedding('Another test');
      const duration = Date.now() - startTime;

      // Subsequent calls should be faster
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Factory Function', () => {
    it('should create provider using factory function', () => {
      const newProvider = createLocalEmbeddingsProvider('all-MiniLM-L6-v2');
      
      expect(newProvider).toBeInstanceOf(LocalEmbeddingsProvider);
      expect(newProvider.getDimensions()).toBe(384);
    });

    it('should use default model if not specified', () => {
      const newProvider = createLocalEmbeddingsProvider();
      
      const info = newProvider.getModelInfo();
      expect(info.modelId).toBe('all-MiniLM-L6-v2');
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup resources on dispose', async () => {
      const newProvider = new LocalEmbeddingsProvider('all-MiniLM-L6-v2');
      
      await newProvider.generateEmbedding('test');
      expect(newProvider.getModelInfo().isInitialized).toBe(true);

      await newProvider.dispose();
      expect(newProvider.getModelInfo().isInitialized).toBe(false);
    });
  });
});
