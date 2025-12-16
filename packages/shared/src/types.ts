/**
 * Shared types for distributed semantic cache
 */

export interface CacheEntry {
  id: string;
  query: string;
  response: string;
  embedding: number[];
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface CacheHit {
  entry: CacheEntry;
  similarity: number;
}

export interface CacheQuery {
  query: string;
  threshold?: number;
}

export interface CacheResponse {
  hit: boolean;
  response?: string;
  similarity?: number;
  cached?: boolean;
  confidence?: {
    score: number;
    level: 'very_high' | 'high' | 'medium' | 'low' | 'very_low';
    layer: 'exact_match' | 'normalized_match' | 'semantic_match' | 'no_match';
    explanation: string;
  };
}

export interface EmbeddingRequest {
  text: string;
}

export interface EmbeddingResponse {
  embedding: number[];
}
