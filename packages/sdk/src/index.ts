/**
 * Distributed Semantic Cache SDK
 * 
 * Easy-to-use client for semantic caching operations.
 * 
 * @example
 * ```typescript
 * import { SemanticCache } from '@distributed-semantic-cache/sdk';
 * 
 * const cache = new SemanticCache({
 *   baseUrl: 'http://localhost:3000',
 *   apiKey: 'your-api-key'
 * });
 * 
 * // Query the cache
 * const result = await cache.query('What is TypeScript?');
 * if (result.hit) {
 *   console.log('Cache hit:', result.response);
 * }
 * 
 * // Store a response
 * await cache.store('What is TypeScript?', 'TypeScript is a typed superset of JavaScript.');
 * ```
 */

export * from './client.js';
export * from './types.js';
