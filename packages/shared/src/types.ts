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
}

export interface EmbeddingRequest {
  text: string;
}

export interface EmbeddingResponse {
  embedding: number[];
}
