import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOpenAIMiddleware, createAnthropicMiddleware, createGenericLLMMiddleware } from '../src/middleware';
import { SemanticCache } from '../src/client';
import type { OpenAIChatRequest, OpenAIChatResponse, AnthropicRequest, AnthropicResponse } from '../src/middleware';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('LLM Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createOpenAIMiddleware', () => {
    it('should return cached response when cache hits', async () => {
      // Setup cache to return hit
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          hit: true,
          response: 'Cached response',
          similarity: 0.95,
          source: 'semantic',
        }),
      });

      const middleware = createOpenAIMiddleware({
        cache: new SemanticCache({
          baseUrl: 'http://localhost:3000',
          apiKey: 'test-key',
        }),
        threshold: 0.85,
      });

      const request: OpenAIChatRequest = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'What is TypeScript?' }],
      };

      const mockApiCall = vi.fn();
      const result = await middleware.chat(request, mockApiCall);

      expect(result.cached).toBe(true);
      expect(result.similarity).toBe(0.95);
      expect(result.response.choices[0].message.content).toBe('Cached response');
      expect(mockApiCall).not.toHaveBeenCalled();
    });

    it('should call API and store response when cache misses', async () => {
      // Cache miss
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          hit: false,
        }),
      });

      // Store response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const middleware = createOpenAIMiddleware({
        cache: new SemanticCache({
          baseUrl: 'http://localhost:3000',
          apiKey: 'test-key',
        }),
      });

      const apiResponse: OpenAIChatResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript' },
          finish_reason: 'stop',
        }],
      };

      const mockApiCall = vi.fn().mockResolvedValue(apiResponse);

      const result = await middleware.chat(
        { model: 'gpt-4', messages: [{ role: 'user', content: 'What is TypeScript?' }] },
        mockApiCall
      );

      expect(result.cached).toBe(false);
      expect(result.response).toBe(apiResponse);
      expect(mockApiCall).toHaveBeenCalled();
    });

    it('should skip cache for streaming requests', async () => {
      const middleware = createOpenAIMiddleware({
        cache: new SemanticCache({
          baseUrl: 'http://localhost:3000',
          apiKey: 'test-key',
        }),
      });

      const mockApiCall = vi.fn().mockResolvedValue({ id: 'test' });

      await middleware.chat(
        { model: 'gpt-4', messages: [{ role: 'user', content: 'test' }], stream: true },
        mockApiCall
      );

      expect(mockApiCall).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should call onCacheHit callback', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          hit: true,
          response: 'Cached',
          similarity: 0.9,
        }),
      });

      const onCacheHit = vi.fn();
      const middleware = createOpenAIMiddleware({
        cache: new SemanticCache({ baseUrl: 'http://localhost:3000', apiKey: 'test' }),
        onCacheHit,
      });

      await middleware.chat(
        { model: 'gpt-4', messages: [{ role: 'user', content: 'test' }] },
        vi.fn()
      );

      expect(onCacheHit).toHaveBeenCalledWith('test', expect.objectContaining({ hit: true }));
    });

    it('should respect skipCache function', async () => {
      const middleware = createOpenAIMiddleware({
        cache: new SemanticCache({ baseUrl: 'http://localhost:3000', apiKey: 'test' }),
        skipCache: (req) => (req as OpenAIChatRequest).model === 'gpt-4',
      });

      const mockApiCall = vi.fn().mockResolvedValue({ id: 'test' });

      await middleware.chat(
        { model: 'gpt-4', messages: [{ role: 'user', content: 'test' }] },
        mockApiCall
      );

      expect(mockApiCall).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('createAnthropicMiddleware', () => {
    it('should return cached response when cache hits', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          hit: true,
          response: 'Cached Claude response',
          similarity: 0.92,
        }),
      });

      const middleware = createAnthropicMiddleware({
        cache: new SemanticCache({ baseUrl: 'http://localhost:3000', apiKey: 'test' }),
      });

      const request: AnthropicRequest = {
        model: 'claude-3-opus',
        messages: [{ role: 'user', content: 'What is JavaScript?' }],
        max_tokens: 1024,
      };

      const result = await middleware.messages(request, vi.fn());

      expect(result.cached).toBe(true);
      expect(result.response.content[0].text).toBe('Cached Claude response');
    });

    it('should call API on cache miss', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hit: false }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const apiResponse: AnthropicResponse = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'JavaScript is a programming language' }],
        model: 'claude-3-opus',
        stop_reason: 'end_turn',
      };

      const mockApiCall = vi.fn().mockResolvedValue(apiResponse);

      const middleware = createAnthropicMiddleware({
        cache: new SemanticCache({ baseUrl: 'http://localhost:3000', apiKey: 'test' }),
      });

      const result = await middleware.messages(
        { model: 'claude-3-opus', messages: [{ role: 'user', content: 'What is JavaScript?' }], max_tokens: 1024 },
        mockApiCall
      );

      expect(result.cached).toBe(false);
      expect(mockApiCall).toHaveBeenCalled();
    });
  });

  describe('createGenericLLMMiddleware', () => {
    interface CustomRequest {
      prompt: string;
      model: string;
    }

    interface CustomResponse {
      text: string;
      model: string;
    }

    it('should work with custom LLM types', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ hit: false }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const middleware = createGenericLLMMiddleware<CustomRequest, CustomResponse>({
        cache: new SemanticCache({ baseUrl: 'http://localhost:3000', apiKey: 'test' }),
        keyExtractor: (req) => req.prompt,
        responseExtractor: (res) => res.text,
        responseBuilder: (text, req) => ({ text, model: req.model }),
      });

      const mockApiCall = vi.fn().mockResolvedValue({ text: 'Response', model: 'custom' });

      const result = await middleware.call(
        { prompt: 'Hello', model: 'custom' },
        mockApiCall
      );

      expect(result.cached).toBe(false);
      expect(result.response.text).toBe('Response');
    });

    it('should throw error if keyExtractor is missing', () => {
      expect(() => createGenericLLMMiddleware({
        cache: new SemanticCache({ baseUrl: 'http://localhost:3000', apiKey: 'test' }),
        responseExtractor: () => '',
      })).toThrow('keyExtractor is required');
    });
  });
});
