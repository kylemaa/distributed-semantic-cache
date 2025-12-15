/**
 * Unit tests for similarity calculation utilities
 */

import { describe, it, expect } from 'vitest';
import { cosineSimilarity, findMostSimilar } from '../src/similarity.js';

describe('cosineSimilarity', () => {
  it('should return 1.0 for identical vectors', () => {
    const vec1 = [1, 0, 0];
    const vec2 = [1, 0, 0];
    expect(cosineSimilarity(vec1, vec2)).toBe(1.0);
  });

  it('should return 1.0 for proportionally scaled vectors', () => {
    const vec1 = [1, 2, 3];
    const vec2 = [2, 4, 6];
    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(1.0, 5);
  });

  it('should return 0 for orthogonal vectors', () => {
    const vec1 = [1, 0, 0];
    const vec2 = [0, 1, 0];
    expect(cosineSimilarity(vec1, vec2)).toBe(0);
  });

  it('should return -1 for opposite vectors', () => {
    const vec1 = [1, 0, 0];
    const vec2 = [-1, 0, 0];
    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(-1, 5);
  });

  it('should handle high-dimensional vectors', () => {
    const vec1 = Array(1536).fill(0.5);
    const vec2 = Array(1536).fill(0.5);
    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(1.0, 5);
  });

  it('should return 0 for zero magnitude vectors', () => {
    const vec1 = [0, 0, 0];
    const vec2 = [1, 2, 3];
    expect(cosineSimilarity(vec1, vec2)).toBe(0);
  });

  it('should throw error for vectors of different lengths', () => {
    const vec1 = [1, 2, 3];
    const vec2 = [1, 2];
    expect(() => cosineSimilarity(vec1, vec2)).toThrow('Vectors must have the same length');
  });

  it('should handle negative values correctly', () => {
    const vec1 = [1, -2, 3];
    const vec2 = [1, -2, 3];
    expect(cosineSimilarity(vec1, vec2)).toBe(1.0);
  });

  it('should calculate partial similarity correctly', () => {
    const vec1 = [1, 0];
    const vec2 = [1, 1];
    // cos(45°) ≈ 0.707
    expect(cosineSimilarity(vec1, vec2)).toBeCloseTo(0.707, 2);
  });
});

describe('findMostSimilar', () => {
  it('should return the most similar candidate above threshold', () => {
    const target = [1, 0, 0];
    const candidates = [
      { id: '1', embedding: [0.9, 0.1, 0], data: 'first' },
      { id: '2', embedding: [0, 1, 0], data: 'second' },
      { id: '3', embedding: [0.95, 0.05, 0], data: 'third' },
    ];

    const result = findMostSimilar(target, candidates, 0.8);
    
    expect(result).not.toBeNull();
    expect(result?.item.id).toBe('3'); // Most similar
    expect(result?.similarity).toBeGreaterThan(0.9);
  });

  it('should return null when no candidate meets threshold', () => {
    const target = [1, 0, 0];
    const candidates = [
      { id: '1', embedding: [0, 1, 0], data: 'perpendicular' },
      { id: '2', embedding: [0, 0, 1], data: 'also perpendicular' },
    ];

    const result = findMostSimilar(target, candidates, 0.9);
    
    expect(result).toBeNull();
  });

  it('should use default threshold of 0.8 when not specified', () => {
    const target = [1, 0, 0];
    const candidates = [
      { id: '1', embedding: [0.5, 0.8, 0], data: 'somewhat similar' },
    ];

    const result = findMostSimilar(target, candidates);
    
    // Similarity is ~0.53, below default 0.8 threshold
    expect(result).toBeNull();
  });

  it('should return null for empty candidate list', () => {
    const target = [1, 0, 0];
    const candidates: Array<{ id: string; embedding: number[] }> = [];

    const result = findMostSimilar(target, candidates, 0.8);
    
    expect(result).toBeNull();
  });

  it('should handle exact matches', () => {
    const target = [1, 2, 3];
    const candidates = [
      { id: '1', embedding: [1, 2, 3], data: 'exact match' },
    ];

    const result = findMostSimilar(target, candidates, 0.99);
    
    expect(result).not.toBeNull();
    expect(result?.similarity).toBe(1.0);
    expect(result?.item.id).toBe('1');
  });

  it('should prefer higher similarity when multiple candidates exceed threshold', () => {
    const target = [1, 0, 0];
    const candidates = [
      { id: '1', embedding: [0.8, 0.2, 0], data: 'good match' },
      { id: '2', embedding: [0.95, 0.05, 0], data: 'better match' },
      { id: '3', embedding: [0.7, 0.3, 0], data: 'ok match' },
    ];

    const result = findMostSimilar(target, candidates, 0.5);
    
    expect(result?.item.id).toBe('2'); // Highest similarity
  });

  it('should work with real-world embedding dimensions', () => {
    // Simulate OpenAI text-embedding-3-small (1536 dimensions)
    const target = Array(1536).fill(0).map((_, i) => i % 2 === 0 ? 0.1 : -0.1);
    const candidates = [
      { 
        id: '1', 
        embedding: Array(1536).fill(0).map((_, i) => i % 2 === 0 ? 0.1 : -0.1),
        data: 'similar pattern' 
      },
      { 
        id: '2', 
        embedding: Array(1536).fill(0).map((_, i) => i % 2 === 0 ? -0.1 : 0.1),
        data: 'opposite pattern' 
      },
    ];

    const result = findMostSimilar(target, candidates, 0.9);
    
    expect(result?.item.id).toBe('1');
  });
});
