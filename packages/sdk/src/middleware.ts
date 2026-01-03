/**
 * LLM Integration Middleware
 * 
 * Seamlessly integrate semantic caching with popular LLM providers.
 * Wrap your API calls to automatically cache responses and reduce costs.
 * 
 * @module middleware
 */

import { SemanticCache } from './client.js';
import type { SemanticCacheConfig, CacheQueryResponse } from './types.js';

/**
 * Configuration for LLM middleware
 */
export interface LLMMiddlewareConfig {
  /** Semantic cache instance or configuration */
  cache: SemanticCache | SemanticCacheConfig;
  /** Similarity threshold for cache matches (0-1, default: 0.85) */
  threshold?: number;
  /** Whether to automatically store responses (default: true) */
  autoStore?: boolean;
  /** Custom key extractor for creating cache keys */
  keyExtractor?: (request: unknown) => string;
  /** Callback when cache hit occurs */
  onCacheHit?: (query: string, response: CacheQueryResponse) => void;
  /** Callback when cache miss occurs */
  onCacheMiss?: (query: string) => void;
  /** Callback when response is stored */
  onStore?: (query: string, response: string) => void;
  /** Skip cache for certain requests */
  skipCache?: (request: unknown) => boolean;
}

/**
 * OpenAI Chat Completion request structure
 */
export interface OpenAIChatRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  [key: string]: unknown;
}

/**
 * OpenAI Chat Completion response structure
 */
export interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Anthropic Claude request structure
 */
export interface AnthropicRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  max_tokens: number;
  system?: string;
  temperature?: number;
  [key: string]: unknown;
}

/**
 * Anthropic Claude response structure
 */
export interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  model: string;
  stop_reason: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

/**
 * Cached response wrapper
 */
export interface CachedLLMResponse<T> {
  /** The response data */
  response: T;
  /** Whether this came from cache */
  cached: boolean;
  /** Similarity score if cached */
  similarity?: number;
  /** Cache layer source if cached */
  source?: string;
  /** Time saved (estimated) if cached */
  timeSavedMs?: number;
}

/**
 * Creates middleware for OpenAI Chat Completions API
 * 
 * @example
 * ```typescript
 * import { createOpenAIMiddleware } from '@distributed-semantic-cache/sdk';
 * import OpenAI from 'openai';
 * 
 * const cache = new SemanticCache({ baseUrl: 'http://localhost:3000', apiKey: 'key' });
 * const middleware = createOpenAIMiddleware({ cache, threshold: 0.85 });
 * 
 * const openai = new OpenAI();
 * 
 * // Wrap your call
 * const result = await middleware.chat(
 *   { model: 'gpt-4', messages: [{ role: 'user', content: 'What is TypeScript?' }] },
 *   () => openai.chat.completions.create({ model: 'gpt-4', messages: [...] })
 * );
 * 
 * if (result.cached) {
 *   console.log('Saved API call! Similarity:', result.similarity);
 * }
 * ```
 */
export function createOpenAIMiddleware(config: LLMMiddlewareConfig) {
  const cache = config.cache instanceof SemanticCache 
    ? config.cache 
    : new SemanticCache(config.cache);
  
  const threshold = config.threshold ?? 0.85;
  const autoStore = config.autoStore ?? true;

  const extractKey = config.keyExtractor ?? ((request: OpenAIChatRequest) => {
    // Default: extract last user message as cache key
    const userMessages = request.messages.filter(m => m.role === 'user');
    return userMessages.length > 0 
      ? userMessages[userMessages.length - 1].content 
      : '';
  });

  return {
    /**
     * Wrap an OpenAI chat completion call with caching
     */
    async chat(
      request: OpenAIChatRequest,
      apiCall: () => Promise<OpenAIChatResponse>
    ): Promise<CachedLLMResponse<OpenAIChatResponse>> {
      // Check if we should skip cache
      if (config.skipCache?.(request)) {
        return { response: await apiCall(), cached: false };
      }

      // Don't cache streaming requests
      if (request.stream) {
        return { response: await apiCall(), cached: false };
      }

      const key = extractKey(request);
      if (!key) {
        return { response: await apiCall(), cached: false };
      }

      // Try cache first
      const startTime = Date.now();
      const cacheResult = await cache.query(key, { threshold });

      if (cacheResult.hit && cacheResult.response) {
        config.onCacheHit?.(key, cacheResult);
        
        // Reconstruct OpenAI-like response
        const cachedResponse: OpenAIChatResponse = {
          id: `cached-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: request.model,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: cacheResult.response,
            },
            finish_reason: 'stop',
          }],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
        };

        return {
          response: cachedResponse,
          cached: true,
          similarity: cacheResult.similarity,
          source: cacheResult.source,
          timeSavedMs: Date.now() - startTime + 500, // Estimate 500ms for typical API call
        };
      }

      config.onCacheMiss?.(key);

      // Call actual API
      const response = await apiCall();

      // Store response if autoStore enabled
      if (autoStore && response.choices?.[0]?.message?.content) {
        const content = response.choices[0].message.content;
        await cache.store(key, content);
        config.onStore?.(key, content);
      }

      return { response, cached: false };
    },

    /**
     * Get the underlying cache instance
     */
    getCache(): SemanticCache {
      return cache;
    },
  };
}

/**
 * Creates middleware for Anthropic Claude API
 * 
 * @example
 * ```typescript
 * import { createAnthropicMiddleware } from '@distributed-semantic-cache/sdk';
 * import Anthropic from '@anthropic-ai/sdk';
 * 
 * const cache = new SemanticCache({ baseUrl: 'http://localhost:3000', apiKey: 'key' });
 * const middleware = createAnthropicMiddleware({ cache });
 * 
 * const anthropic = new Anthropic();
 * 
 * const result = await middleware.messages(
 *   { model: 'claude-3-opus', messages: [...], max_tokens: 1024 },
 *   () => anthropic.messages.create({ ... })
 * );
 * ```
 */
export function createAnthropicMiddleware(config: LLMMiddlewareConfig) {
  const cache = config.cache instanceof SemanticCache 
    ? config.cache 
    : new SemanticCache(config.cache);
  
  const threshold = config.threshold ?? 0.85;
  const autoStore = config.autoStore ?? true;

  const extractKey = config.keyExtractor ?? ((request: AnthropicRequest) => {
    const userMessages = request.messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) return '';
    const lastMessage = userMessages[userMessages.length - 1];
    return typeof lastMessage.content === 'string' 
      ? lastMessage.content 
      : '';
  });

  return {
    /**
     * Wrap an Anthropic messages call with caching
     */
    async messages(
      request: AnthropicRequest,
      apiCall: () => Promise<AnthropicResponse>
    ): Promise<CachedLLMResponse<AnthropicResponse>> {
      if (config.skipCache?.(request)) {
        return { response: await apiCall(), cached: false };
      }

      const key = extractKey(request);
      if (!key) {
        return { response: await apiCall(), cached: false };
      }

      const startTime = Date.now();
      const cacheResult = await cache.query(key, { threshold });

      if (cacheResult.hit && cacheResult.response) {
        config.onCacheHit?.(key, cacheResult);

        const cachedResponse: AnthropicResponse = {
          id: `cached-${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [{
            type: 'text',
            text: cacheResult.response,
          }],
          model: request.model,
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 0,
            output_tokens: 0,
          },
        };

        return {
          response: cachedResponse,
          cached: true,
          similarity: cacheResult.similarity,
          source: cacheResult.source,
          timeSavedMs: Date.now() - startTime + 800,
        };
      }

      config.onCacheMiss?.(key);

      const response = await apiCall();

      if (autoStore && response.content?.[0]?.text) {
        const content = response.content[0].text;
        await cache.store(key, content);
        config.onStore?.(key, content);
      }

      return { response, cached: false };
    },

    getCache(): SemanticCache {
      return cache;
    },
  };
}

/**
 * Generic LLM middleware for any provider
 * 
 * @example
 * ```typescript
 * import { createGenericLLMMiddleware } from '@distributed-semantic-cache/sdk';
 * 
 * const middleware = createGenericLLMMiddleware({
 *   cache: new SemanticCache({ baseUrl: 'http://localhost:3000', apiKey: 'key' }),
 *   keyExtractor: (request) => request.prompt,
 *   responseExtractor: (response) => response.text,
 * });
 * 
 * const result = await middleware.call(
 *   { prompt: 'What is JavaScript?' },
 *   async () => myLLM.generate({ prompt: 'What is JavaScript?' })
 * );
 * ```
 */
export interface GenericLLMMiddlewareConfig<TRequest, TResponse> extends LLMMiddlewareConfig {
  /** Extract the text from the response to cache */
  responseExtractor: (response: TResponse) => string;
  /** Build a cached response from cached text */
  responseBuilder?: (cachedText: string, originalRequest: TRequest) => TResponse;
}

export function createGenericLLMMiddleware<TRequest, TResponse>(
  config: GenericLLMMiddlewareConfig<TRequest, TResponse>
) {
  const cache = config.cache instanceof SemanticCache 
    ? config.cache 
    : new SemanticCache(config.cache);
  
  const threshold = config.threshold ?? 0.85;
  const autoStore = config.autoStore ?? true;

  if (!config.keyExtractor) {
    throw new Error('keyExtractor is required for generic middleware');
  }

  return {
    async call(
      request: TRequest,
      apiCall: () => Promise<TResponse>
    ): Promise<CachedLLMResponse<TResponse>> {
      if (config.skipCache?.(request)) {
        return { response: await apiCall(), cached: false };
      }

      const key = config.keyExtractor!(request);
      if (!key) {
        return { response: await apiCall(), cached: false };
      }

      const startTime = Date.now();
      const cacheResult = await cache.query(key, { threshold });

      if (cacheResult.hit && cacheResult.response && config.responseBuilder) {
        config.onCacheHit?.(key, cacheResult);

        return {
          response: config.responseBuilder(cacheResult.response, request),
          cached: true,
          similarity: cacheResult.similarity,
          source: cacheResult.source,
          timeSavedMs: Date.now() - startTime + 500,
        };
      }

      config.onCacheMiss?.(key);

      const response = await apiCall();

      if (autoStore) {
        const content = config.responseExtractor(response);
        if (content) {
          await cache.store(key, content);
          config.onStore?.(key, content);
        }
      }

      return { response, cached: false };
    },

    getCache(): SemanticCache {
      return cache;
    },
  };
}
