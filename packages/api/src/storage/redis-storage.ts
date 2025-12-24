/**
 * Redis Storage Adapter
 * 
 * Provides distributed caching using Redis for horizontal scaling.
 * Supports:
 * - L1/L2 fast path cache (key-value)
 * - Cache entry storage with JSON serialization
 * - Distributed lock-free operations
 * - TTL-based expiration
 * 
 * Requires: npm install ioredis
 */

import type { CacheEntry } from '@distributed-semantic-cache/shared';
import type {
  ICacheStorage,
  IKVCache,
  StoredCacheEntry,
  AuditLogEntry,
  CacheStats,
} from './interfaces.js';

export interface RedisStorageConfig {
  url: string;
  keyPrefix?: string;
  ttlSeconds?: number;
  maxEntries?: number;
}

// Lazy load ioredis to avoid dependency issues if not used
let Redis: any;
async function getRedis() {
  if (!Redis) {
    try {
      Redis = (await import('ioredis')).default;
    } catch (e) {
      throw new Error('ioredis is required for Redis storage. Run: npm install ioredis');
    }
  }
  return Redis;
}

/**
 * Redis-based cache storage for horizontal scaling
 */
export class RedisStorage implements ICacheStorage {
  private client: any;
  private config: RedisStorageConfig;
  private prefix: string;

  constructor(config: RedisStorageConfig) {
    this.config = config;
    this.prefix = config.keyPrefix || 'dsc:';
  }

  private key(type: string, id?: string): string {
    return id ? `${this.prefix}${type}:${id}` : `${this.prefix}${type}`;
  }

  async initialize(): Promise<void> {
    const RedisClient = await getRedis();
    this.client = new RedisClient(this.config.url);
    
    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      this.client.once('ready', resolve);
      this.client.once('error', reject);
    });
  }

  async insertEntry(
    entry: CacheEntry,
    quantizedEmbedding?: Buffer,
    encryptedEmbedding?: Buffer,
    encryptionMetadata?: string
  ): Promise<void> {
    const stored: any = {
      id: entry.id,
      query: entry.query,
      response: entry.response,
      embedding: JSON.stringify(entry.embedding),
      timestamp: entry.timestamp,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
    };
    
    // Store embeddings as base64
    if (quantizedEmbedding) {
      stored.quantizedEmbedding = quantizedEmbedding.toString('base64');
    }
    if (encryptedEmbedding) {
      stored.encryptedEmbedding = encryptedEmbedding.toString('base64');
    }
    if (encryptionMetadata) {
      stored.encryptionMetadata = encryptionMetadata;
    }

    const pipeline = this.client.pipeline();
    
    // Store entry by ID
    pipeline.hset(this.key('entry', entry.id), stored);
    
    // Store query -> ID mapping for fast lookup
    pipeline.set(this.key('query', this.hashQuery(entry.query)), entry.id);
    
    // Add to sorted set for timestamp ordering
    pipeline.zadd(this.key('entries'), entry.timestamp, entry.id);
    
    // Set TTL if configured
    if (this.config.ttlSeconds) {
      pipeline.expire(this.key('entry', entry.id), this.config.ttlSeconds);
    }
    
    await pipeline.exec();
  }

  private hashQuery(query: string): string {
    // Simple hash for query lookup
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  async getAllEntries(): Promise<StoredCacheEntry[]> {
    // Get all entry IDs from sorted set
    const ids = await this.client.zrevrange(this.key('entries'), 0, -1);
    if (ids.length === 0) return [];

    // Batch fetch all entries
    const pipeline = this.client.pipeline();
    for (const id of ids) {
      pipeline.hgetall(this.key('entry', id));
    }
    
    const results = await pipeline.exec();
    
    return results
      .filter(([err, data]: [Error | null, any]) => !err && data && Object.keys(data).length > 0)
      .map(([, data]: [Error | null, any]) => this.deserializeEntry(data));
  }

  private deserializeEntry(data: any): StoredCacheEntry {
    return {
      id: data.id,
      query: data.query,
      response: data.response,
      embedding: JSON.parse(data.embedding),
      timestamp: parseInt(data.timestamp, 10),
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
      quantizedEmbedding: data.quantizedEmbedding 
        ? Buffer.from(data.quantizedEmbedding, 'base64') 
        : undefined,
      encryptedEmbedding: data.encryptedEmbedding 
        ? Buffer.from(data.encryptedEmbedding, 'base64') 
        : undefined,
      encryptionMetadata: data.encryptionMetadata || undefined,
    };
  }

  async getEntryById(id: string): Promise<CacheEntry | null> {
    const data = await this.client.hgetall(this.key('entry', id));
    if (!data || Object.keys(data).length === 0) return null;
    
    return {
      id: data.id,
      query: data.query,
      response: data.response,
      embedding: JSON.parse(data.embedding),
      timestamp: parseInt(data.timestamp, 10),
      metadata: data.metadata ? JSON.parse(data.metadata) : undefined,
    };
  }

  async getEntryByQuery(query: string): Promise<CacheEntry | null> {
    const id = await this.client.get(this.key('query', this.hashQuery(query)));
    if (!id) return null;
    return this.getEntryById(id);
  }

  async pruneCache(maxSize: number): Promise<void> {
    const count = await this.client.zcard(this.key('entries'));
    
    if (count > maxSize) {
      const deleteCount = count - maxSize;
      // Get oldest entries
      const toDelete = await this.client.zrange(this.key('entries'), 0, deleteCount - 1);
      
      if (toDelete.length > 0) {
        const pipeline = this.client.pipeline();
        for (const id of toDelete) {
          pipeline.del(this.key('entry', id));
          pipeline.zrem(this.key('entries'), id);
        }
        await pipeline.exec();
      }
    }
  }

  async clearCache(): Promise<void> {
    // Get all keys with our prefix
    const keys = await this.client.keys(`${this.prefix}*`);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async getStats(): Promise<CacheStats> {
    const count = await this.client.zcard(this.key('entries'));
    
    if (count === 0) {
      return {
        totalEntries: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
      };
    }

    // Get oldest and newest timestamps
    const oldest = await this.client.zrange(this.key('entries'), 0, 0, 'WITHSCORES');
    const newest = await this.client.zrevrange(this.key('entries'), 0, 0, 'WITHSCORES');

    return {
      totalEntries: count,
      oldestTimestamp: oldest.length >= 2 ? parseInt(oldest[1], 10) : null,
      newestTimestamp: newest.length >= 2 ? parseInt(newest[1], 10) : null,
    };
  }

  async addAuditLog(
    action: string,
    entryId?: string,
    queryHash?: string,
    success: boolean = true,
    metadata?: any
  ): Promise<void> {
    const log: AuditLogEntry = {
      timestamp: Date.now(),
      action,
      entryId,
      queryHash,
      success,
      metadata,
    };

    // Store audit log as list with auto-trim
    await this.client.lpush(this.key('audit'), JSON.stringify(log));
    await this.client.ltrim(this.key('audit'), 0, 9999); // Keep last 10K logs
  }

  async getAuditLogs(limit: number = 100, action?: string): Promise<AuditLogEntry[]> {
    const logs = await this.client.lrange(this.key('audit'), 0, limit - 1);
    
    let parsed = logs.map((log: string) => JSON.parse(log));
    
    if (action) {
      parsed = parsed.filter((log: AuditLogEntry) => log.action === action);
    }
    
    return parsed;
  }

  async clearOldAuditLogs(daysToKeep: number = 30): Promise<void> {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const logs = await this.client.lrange(this.key('audit'), 0, -1);
    
    // Filter and replace
    const kept = logs
      .map((log: string) => JSON.parse(log))
      .filter((log: AuditLogEntry) => log.timestamp >= cutoffTime);
    
    await this.client.del(this.key('audit'));
    if (kept.length > 0) {
      await this.client.rpush(this.key('audit'), ...kept.map((log: AuditLogEntry) => JSON.stringify(log)));
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

/**
 * Redis-based KV cache for L1/L2 fast path
 * Provides distributed exact match and normalized query caching
 */
export class RedisKVCache implements IKVCache {
  private client: any;
  private config: RedisStorageConfig;
  private prefix: string;

  constructor(config: RedisStorageConfig) {
    this.config = config;
    this.prefix = (config.keyPrefix || 'dsc:') + 'kv:';
  }

  async initialize(): Promise<void> {
    const RedisClient = await getRedis();
    this.client = new RedisClient(this.config.url);
    
    await new Promise<void>((resolve, reject) => {
      this.client.once('ready', resolve);
      this.client.once('error', reject);
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(this.prefix + key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.config.ttlSeconds;
    if (ttl) {
      await this.client.setex(this.prefix + key, ttl, value);
    } else {
      await this.client.set(this.prefix + key, value);
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.prefix + key);
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.client.exists(this.prefix + key);
    return exists === 1;
  }

  async clear(): Promise<void> {
    const keys = await this.client.keys(this.prefix + '*');
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async size(): Promise<number> {
    const keys = await this.client.keys(this.prefix + '*');
    return keys.length;
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
