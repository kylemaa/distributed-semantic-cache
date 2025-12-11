/**
 * Similarity calculation utilities
 */

/**
 * Calculate cosine similarity between two vectors
 * @param vecA First vector
 * @param vecB Second vector
 * @returns Similarity score between 0 and 1
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  
  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Find the most similar vector from a list
 * @param target Target vector
 * @param candidates List of candidate vectors with metadata
 * @param threshold Minimum similarity threshold
 * @returns Most similar candidate or null
 */
export function findMostSimilar<T extends { embedding: number[] }>(
  target: number[],
  candidates: T[],
  threshold: number = 0.8
): { item: T; similarity: number } | null {
  let bestMatch: { item: T; similarity: number } | null = null;

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(target, candidate.embedding);
    
    if (similarity >= threshold) {
      if (!bestMatch || similarity > bestMatch.similarity) {
        bestMatch = { item: candidate, similarity };
      }
    }
  }

  return bestMatch;
}
