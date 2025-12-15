/**
 * Tests for vector quantization utilities
 */

import { describe, it, expect } from 'vitest';
import {
  quantize,
  dequantize,
  serializeQuantized,
  deserializeQuantized,
  getStorageReduction,
} from '../src/quantization.js';

describe('Quantization', () => {
  describe('quantize and dequantize', () => {
    it('should quantize a float32 vector to uint8', () => {
      const embedding = [0.1, 0.5, -0.3, 0.8, -0.5];
      const result = quantize(embedding);

      expect(result.quantized).toBeInstanceOf(Uint8Array);
      expect(result.quantized.length).toBe(embedding.length);
      expect(result.min).toBe(-0.5);
      expect(result.max).toBe(0.8);
    });

    it('should dequantize back to approximate float32', () => {
      const embedding = [0.1, 0.5, -0.3, 0.8, -0.5];
      const quantized = quantize(embedding);
      const dequantized = dequantize(quantized.quantized, quantized.min, quantized.max);

      expect(dequantized.length).toBe(embedding.length);
      
      // Check that dequantized values are close to original
      for (let i = 0; i < embedding.length; i++) {
        expect(Math.abs(dequantized[i] - embedding[i])).toBeLessThan(0.01);
      }
    });

    it('should handle normalized embeddings (typical case)', () => {
      // Typical embedding: normalized vector with values ~[-1, 1]
      const embedding = Array(384).fill(0).map((_, i) => Math.sin(i) * 0.5);
      const quantized = quantize(embedding);
      const dequantized = dequantize(quantized.quantized, quantized.min, quantized.max);

      // Calculate reconstruction error
      const mse = embedding.reduce((sum, val, i) => {
        const error = val - dequantized[i];
        return sum + error * error;
      }, 0) / embedding.length;

      // MSE should be very small (< 0.0001)
      expect(mse).toBeLessThan(0.0001);
    });

    it('should handle edge case: all values the same', () => {
      const embedding = [0.5, 0.5, 0.5, 0.5];
      const quantized = quantize(embedding);
      const dequantized = dequantize(quantized.quantized, quantized.min, quantized.max);

      expect(dequantized).toEqual(embedding);
    });

    it('should handle edge case: empty vector', () => {
      const embedding: number[] = [];
      const quantized = quantize(embedding);
      const dequantized = dequantize(quantized.quantized, quantized.min, quantized.max);

      expect(quantized.quantized.length).toBe(0);
      expect(dequantized.length).toBe(0);
    });

    it('should preserve vector magnitude approximately', () => {
      const embedding = [0.3, 0.4, 0.5, -0.2, -0.1];
      const originalMagnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));

      const quantized = quantize(embedding);
      const dequantized = dequantize(quantized.quantized, quantized.min, quantized.max);
      const dequantizedMagnitude = Math.sqrt(dequantized.reduce((sum, v) => sum + v * v, 0));

      // Magnitude should be within 5% of original
      const magnitudeError = Math.abs(dequantizedMagnitude - originalMagnitude) / originalMagnitude;
      expect(magnitudeError).toBeLessThan(0.05);
    });
  });

  describe('serialization', () => {
    it('should serialize and deserialize quantized vector', () => {
      const embedding = [0.1, 0.5, -0.3, 0.8, -0.5];
      const quantized = quantize(embedding);
      
      const buffer = serializeQuantized(quantized);
      expect(buffer).toBeInstanceOf(Buffer);

      const deserialized = deserializeQuantized(buffer);
      expect(deserialized.min).toBe(quantized.min);
      expect(deserialized.max).toBe(quantized.max);
      expect(deserialized.quantized).toEqual(quantized.quantized);
    });

    it('should handle large vectors (384 dimensions)', () => {
      const embedding = Array(384).fill(0).map((_, i) => Math.sin(i) * 0.5);
      const quantized = quantize(embedding);
      
      const buffer = serializeQuantized(quantized);
      const deserialized = deserializeQuantized(buffer);

      expect(deserialized.quantized.length).toBe(384);
      expect(deserialized.min).toBeCloseTo(quantized.min, 10);
      expect(deserialized.max).toBeCloseTo(quantized.max, 10);
    });
  });

  describe('storage reduction', () => {
    it('should calculate correct storage reduction for typical embedding', () => {
      const reduction = getStorageReduction(384);
      
      // float32: 384 * 4 = 1536 bytes
      // uint8: 384 * 1 + 16 (min/max) = 400 bytes
      // Reduction: (1536 - 400) / 1536 = ~74%
      expect(reduction).toBeCloseTo(73.96, 1);
    });

    it('should show ~75% reduction for standard embeddings', () => {
      const reduction = getStorageReduction(384);
      expect(reduction).toBeGreaterThan(70);
      expect(reduction).toBeLessThan(80);
    });
  });

  describe('accuracy preservation', () => {
    it('should preserve cosine similarity within 1%', () => {
      // Create two similar vectors
      const vec1 = Array(384).fill(0).map((_, i) => Math.sin(i) * 0.5);
      const vec2 = Array(384).fill(0).map((_, i) => Math.sin(i + 0.1) * 0.5);

      // Calculate original cosine similarity
      const dotProduct = vec1.reduce((sum, v, i) => sum + v * vec2[i], 0);
      const mag1 = Math.sqrt(vec1.reduce((sum, v) => sum + v * v, 0));
      const mag2 = Math.sqrt(vec2.reduce((sum, v) => sum + v * v, 0));
      const originalSimilarity = dotProduct / (mag1 * mag2);

      // Quantize and dequantize
      const q1 = quantize(vec1);
      const q2 = quantize(vec2);
      const dq1 = dequantize(q1.quantized, q1.min, q1.max);
      const dq2 = dequantize(q2.quantized, q2.min, q2.max);

      // Calculate quantized cosine similarity
      const dotProductQ = dq1.reduce((sum, v, i) => sum + v * dq2[i], 0);
      const mag1Q = Math.sqrt(dq1.reduce((sum, v) => sum + v * v, 0));
      const mag2Q = Math.sqrt(dq2.reduce((sum, v) => sum + v * v, 0));
      const quantizedSimilarity = dotProductQ / (mag1Q * mag2Q);

      // Similarity should be within 1%
      const similarityError = Math.abs(quantizedSimilarity - originalSimilarity);
      expect(similarityError).toBeLessThan(0.01);
    });

    it('should maintain relative ordering of similarities', () => {
      const query = Array(384).fill(0).map((_, i) => Math.sin(i) * 0.5);
      const similar = Array(384).fill(0).map((_, i) => Math.sin(i + 0.1) * 0.5);
      const dissimilar = Array(384).fill(0).map((_, i) => Math.cos(i + 1) * 0.5);

      // Calculate original similarities
      const calcSimilarity = (v1: number[], v2: number[]) => {
        const dot = v1.reduce((sum, val, i) => sum + val * v2[i], 0);
        const mag1 = Math.sqrt(v1.reduce((sum, v) => sum + v * v, 0));
        const mag2 = Math.sqrt(v2.reduce((sum, v) => sum + v * v, 0));
        return dot / (mag1 * mag2);
      };

      const origSimilarScore = calcSimilarity(query, similar);
      const origDissimilarScore = calcSimilarity(query, dissimilar);

      // Quantize all vectors
      const qQuery = quantize(query);
      const qSimilar = quantize(similar);
      const qDissimilar = quantize(dissimilar);

      const dqQuery = dequantize(qQuery.quantized, qQuery.min, qQuery.max);
      const dqSimilar = dequantize(qSimilar.quantized, qSimilar.min, qSimilar.max);
      const dqDissimilar = dequantize(qDissimilar.quantized, qDissimilar.min, qDissimilar.max);

      const quantSimilarScore = calcSimilarity(dqQuery, dqSimilar);
      const quantDissimilarScore = calcSimilarity(dqQuery, dqDissimilar);

      // Relative ordering should be preserved
      expect(origSimilarScore > origDissimilarScore).toBe(true);
      expect(quantSimilarScore > quantDissimilarScore).toBe(true);
    });
  });

  describe('boundary conditions', () => {
    it('should handle very small values', () => {
      const embedding = [0.001, 0.002, -0.001, 0.0015];
      const quantized = quantize(embedding);
      const dequantized = dequantize(quantized.quantized, quantized.min, quantized.max);

      for (let i = 0; i < embedding.length; i++) {
        expect(Math.abs(dequantized[i] - embedding[i])).toBeLessThan(0.001);
      }
    });

    it('should handle large values', () => {
      const embedding = [100, 200, -150, 300];
      const quantized = quantize(embedding);
      const dequantized = dequantize(quantized.quantized, quantized.min, quantized.max);

      for (let i = 0; i < embedding.length; i++) {
        const relativeError = Math.abs(dequantized[i] - embedding[i]) / Math.abs(embedding[i]);
        expect(relativeError).toBeLessThan(0.01);
      }
    });

    it('should handle single element vector', () => {
      const embedding = [0.5];
      const quantized = quantize(embedding);
      const dequantized = dequantize(quantized.quantized, quantized.min, quantized.max);

      expect(dequantized).toEqual(embedding);
    });
  });
});
