import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SemanticCacheBuilder, buildCache } from '../src/builder';
import { SemanticCache } from '../src/client';

describe('SemanticCacheBuilder', () => {
  describe('configuration methods', () => {
    it('should build with basic configuration', () => {
      const cache = new SemanticCacheBuilder()
        .withBaseUrl('http://localhost:3000')
        .withApiKey('test-key')
        .build();

      expect(cache).toBeInstanceOf(SemanticCache);
    });

    it('should chain all configuration methods', () => {
      const builder = new SemanticCacheBuilder()
        .withBaseUrl('http://localhost:3000')
        .withApiKey('api-key')
        .withAdminKey('admin-key')
        .withTimeout(5000)
        .withRetries(5, 500)
        .withHeader('X-Custom', 'value')
        .withHeaders({ 'X-Another': 'value2' });

      const config = builder.getConfig();

      expect(config.baseUrl).toBe('http://localhost:3000');
      expect(config.apiKey).toBe('api-key');
      expect(config.adminApiKey).toBe('admin-key');
      expect(config.timeout).toBe(5000);
      expect(config.retry?.maxRetries).toBe(5);
      expect(config.retry?.baseDelay).toBe(500);
      expect(config.headers?.['X-Custom']).toBe('value');
      expect(config.headers?.['X-Another']).toBe('value2');
    });

    it('should support tenant ID header', () => {
      const config = new SemanticCacheBuilder()
        .withBaseUrl('http://localhost:3000')
        .withTenantId('tenant-123')
        .getConfig();

      expect(config.headers?.['x-tenant-id']).toBe('tenant-123');
    });

    it('should support request ID header', () => {
      const config = new SemanticCacheBuilder()
        .withBaseUrl('http://localhost:3000')
        .withRequestId('req-abc')
        .getConfig();

      expect(config.headers?.['x-request-id']).toBe('req-abc');
    });

    it('should disable retries with withoutRetries', () => {
      const config = new SemanticCacheBuilder()
        .withBaseUrl('http://localhost:3000')
        .withoutRetries()
        .getConfig();

      expect(config.retry?.maxRetries).toBe(0);
    });
  });

  describe('presets', () => {
    it('should apply development preset', () => {
      const config = new SemanticCacheBuilder()
        .withPreset('development')
        .getConfig();

      expect(config.baseUrl).toBe('http://localhost:3000');
      expect(config.timeout).toBe(30000);
      expect(config.retry?.maxRetries).toBe(3);
    });

    it('should apply production preset', () => {
      const config = new SemanticCacheBuilder()
        .withBaseUrl('http://api.example.com')
        .withPreset('production')
        .getConfig();

      expect(config.timeout).toBe(10000);
      expect(config.retry?.maxRetries).toBe(5);
    });

    it('should apply testing preset', () => {
      const config = new SemanticCacheBuilder()
        .withBaseUrl('http://localhost:3000')
        .withPreset('testing')
        .getConfig();

      expect(config.timeout).toBe(5000);
      expect(config.retry?.maxRetries).toBe(0);
    });
  });

  describe('validation', () => {
    it('should throw error when baseUrl is missing', () => {
      expect(() => new SemanticCacheBuilder().build()).toThrow('baseUrl is required');
    });

    it('should validate explicitly', () => {
      expect(() => new SemanticCacheBuilder().validate()).toThrow('baseUrl is required');
    });

    it('should pass validation with baseUrl', () => {
      expect(() => 
        new SemanticCacheBuilder()
          .withBaseUrl('http://localhost:3000')
          .validate()
      ).not.toThrow();
    });
  });

  describe('fromEnvironment', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should read from environment variables', () => {
      process.env.CACHE_API_URL = 'http://env.example.com';
      process.env.CACHE_API_KEY = 'env-api-key';
      process.env.CACHE_ADMIN_KEY = 'env-admin-key';
      process.env.CACHE_TIMEOUT = '15000';

      const config = new SemanticCacheBuilder()
        .fromEnvironment()
        .getConfig();

      expect(config.baseUrl).toBe('http://env.example.com');
      expect(config.apiKey).toBe('env-api-key');
      expect(config.adminApiKey).toBe('env-admin-key');
      expect(config.timeout).toBe(15000);
    });
  });

  describe('buildCache helper', () => {
    it('should create a builder instance', () => {
      const builder = buildCache();
      expect(builder).toBeInstanceOf(SemanticCacheBuilder);
    });

    it('should support chaining from helper', () => {
      const cache = buildCache()
        .withBaseUrl('http://localhost:3000')
        .withApiKey('test')
        .build();

      expect(cache).toBeInstanceOf(SemanticCache);
    });
  });
});
