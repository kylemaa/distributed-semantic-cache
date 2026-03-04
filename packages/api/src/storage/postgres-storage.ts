/**
 * PostgreSQL Storage Adapter with pgvector support
 * 
 * Provides production-grade storage with:
 * - Full ACID compliance
 * - Native vector similarity search via pgvector
 * - Horizontal scaling via read replicas
 * - Managed service compatibility (AWS RDS, Supabase, Neon)
 * 
 * Requires: npm install pg
 * PostgreSQL extension: CREATE EXTENSION IF NOT EXISTS vector;
 */

import type { CacheEntry } from '@distributed-semantic-cache/shared';
import type {
  ICacheStorage,
  IVectorStore,
  StoredCacheEntry,
  AuditLogEntry,
  CacheStats,
  VectorSearchResult,
} from './interfaces.js';

export interface PostgresStorageConfig {
  connectionString: string;
  schema?: string;
  vectorDimension?: number;
}

// Lazy load pg to avoid dependency issues if not used
let Pool: any;
async function getPool() {
  if (!Pool) {
    try {
      Pool = (await import('pg')).Pool;
    } catch (e) {
      throw new Error('pg is required for PostgreSQL storage. Run: npm install pg');
    }
  }
  return Pool;
}

/**
 * PostgreSQL-based cache storage for production deployments
 */
export class PostgresStorage implements ICacheStorage {
  private pool: any;
  private config: PostgresStorageConfig;
  private schema: string;

  constructor(config: PostgresStorageConfig) {
    this.config = config;
    this.schema = config.schema || 'semantic_cache';
  }

  async initialize(): Promise<void> {
    const PoolClass = await getPool();
    this.pool = new PoolClass({
      connectionString: this.config.connectionString,
    });

    // Test connection
    const client = await this.pool.connect();
    try {
      // Create schema
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
      
      // Try to enable pgvector extension
      try {
        await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      } catch (e) {
        console.warn('pgvector extension not available - using JSONB for embeddings');
      }

      // Create cache entries table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.schema}.cache_entries (
          id TEXT PRIMARY KEY,
          query TEXT NOT NULL,
          response TEXT NOT NULL,
          embedding JSONB NOT NULL,
          timestamp BIGINT NOT NULL,
          metadata JSONB,
          quantized_embedding BYTEA,
          encrypted_embedding BYTEA,
          encryption_metadata TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_cache_timestamp 
          ON ${this.schema}.cache_entries(timestamp);
        CREATE INDEX IF NOT EXISTS idx_cache_query 
          ON ${this.schema}.cache_entries USING hash(query);
      `);

      // Create audit log table
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.schema}.audit_log (
          id SERIAL PRIMARY KEY,
          timestamp BIGINT NOT NULL,
          action TEXT NOT NULL,
          entry_id TEXT,
          query_hash TEXT,
          success BOOLEAN NOT NULL,
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_audit_timestamp 
          ON ${this.schema}.audit_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_audit_action 
          ON ${this.schema}.audit_log(action);
      `);
    } finally {
      client.release();
    }
  }

  async insertEntry(
    entry: CacheEntry,
    quantizedEmbedding?: Buffer,
    encryptedEmbedding?: Buffer,
    encryptionMetadata?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.schema}.cache_entries 
       (id, query, response, embedding, timestamp, metadata, quantized_embedding, encrypted_embedding, encryption_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         query = EXCLUDED.query,
         response = EXCLUDED.response,
         embedding = EXCLUDED.embedding,
         timestamp = EXCLUDED.timestamp,
         metadata = EXCLUDED.metadata`,
      [
        entry.id,
        entry.query,
        entry.response,
        JSON.stringify(entry.embedding),
        entry.timestamp,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        quantizedEmbedding || null,
        encryptedEmbedding || null,
        encryptionMetadata || null,
      ]
    );
  }

  async getAllEntries(): Promise<StoredCacheEntry[]> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.schema}.cache_entries ORDER BY timestamp DESC`
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      query: row.query,
      response: row.response,
      embedding: typeof row.embedding === 'string' 
        ? JSON.parse(row.embedding) 
        : row.embedding,
      timestamp: parseInt(row.timestamp, 10),
      metadata: row.metadata || undefined,
      quantizedEmbedding: row.quantized_embedding 
        ? Buffer.from(row.quantized_embedding) 
        : undefined,
      encryptedEmbedding: row.encrypted_embedding 
        ? Buffer.from(row.encrypted_embedding) 
        : undefined,
      encryptionMetadata: row.encryption_metadata || undefined,
    }));
  }

  async getEntryById(id: string): Promise<CacheEntry | null> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.schema}.cache_entries WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      query: row.query,
      response: row.response,
      embedding: typeof row.embedding === 'string' 
        ? JSON.parse(row.embedding) 
        : row.embedding,
      timestamp: parseInt(row.timestamp, 10),
      metadata: row.metadata || undefined,
    };
  }

  async getEntryByQuery(query: string): Promise<CacheEntry | null> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.schema}.cache_entries WHERE query = $1 LIMIT 1`,
      [query]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      query: row.query,
      response: row.response,
      embedding: typeof row.embedding === 'string' 
        ? JSON.parse(row.embedding) 
        : row.embedding,
      timestamp: parseInt(row.timestamp, 10),
      metadata: row.metadata || undefined,
    };
  }

  async pruneCache(maxSize: number): Promise<void> {
    await this.pool.query(`
      DELETE FROM ${this.schema}.cache_entries
      WHERE id IN (
        SELECT id FROM ${this.schema}.cache_entries
        ORDER BY timestamp ASC
        OFFSET $1
      )
    `, [maxSize]);
  }

  async clearCache(): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.schema}.cache_entries`);
  }

  async getStats(): Promise<CacheStats> {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*)::int as count,
        MIN(timestamp) as oldest_timestamp,
        MAX(timestamp) as newest_timestamp
      FROM ${this.schema}.cache_entries
    `);

    const row = result.rows[0];
    return {
      totalEntries: row.count,
      oldestTimestamp: row.oldest_timestamp ? parseInt(row.oldest_timestamp, 10) : null,
      newestTimestamp: row.newest_timestamp ? parseInt(row.newest_timestamp, 10) : null,
    };
  }

  async addAuditLog(
    action: string,
    entryId?: string,
    queryHash?: string,
    success: boolean = true,
    metadata?: any
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.schema}.audit_log 
       (timestamp, action, entry_id, query_hash, success, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        Date.now(),
        action,
        entryId || null,
        queryHash || null,
        success,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  }

  async getAuditLogs(limit: number = 100, action?: string): Promise<AuditLogEntry[]> {
    let query = `SELECT * FROM ${this.schema}.audit_log`;
    const params: any[] = [];

    if (action) {
      query += ' WHERE action = $1';
      params.push(action);
    }

    query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await this.pool.query(query, params);

    return result.rows.map((row: any) => ({
      id: row.id,
      timestamp: parseInt(row.timestamp, 10),
      action: row.action,
      entryId: row.entry_id || undefined,
      queryHash: row.query_hash || undefined,
      success: row.success,
      metadata: row.metadata || undefined,
    }));
  }

  async clearOldAuditLogs(daysToKeep: number = 30): Promise<void> {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    await this.pool.query(
      `DELETE FROM ${this.schema}.audit_log WHERE timestamp < $1`,
      [cutoffTime]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rows.length === 1;
    } catch {
      return false;
    }
  }
}

/**
 * PostgreSQL + pgvector for native vector similarity search
 * Provides production-scale semantic search with SQL interface
 */
export class PgVectorStore implements IVectorStore {
  private pool: any;
  private config: PostgresStorageConfig;
  private schema: string;
  private dimension: number;
  private tableName: string;

  constructor(config: PostgresStorageConfig) {
    this.config = config;
    this.schema = config.schema || 'semantic_cache';
    this.dimension = config.vectorDimension || 384;
    this.tableName = `${this.schema}.vector_index`;
  }

  async initialize(): Promise<void> {
    const PoolClass = await getPool();
    this.pool = new PoolClass({
      connectionString: this.config.connectionString,
    });

    const client = await this.pool.connect();
    try {
      // Ensure pgvector is enabled
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      
      // Create schema
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${this.schema}`);
      
      // Create vector table with HNSW index
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id TEXT PRIMARY KEY,
          embedding vector(${this.dimension}),
          metadata JSONB,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Create HNSW index for cosine similarity
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_vector_hnsw 
        ON ${this.tableName} 
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 200)
      `);
    } finally {
      client.release();
    }
  }

  async addVector(id: string, vector: number[], metadata?: Record<string, any>): Promise<void> {
    // Format vector for pgvector
    const vectorStr = `[${vector.join(',')}]`;
    
    await this.pool.query(`
      INSERT INTO ${this.tableName} (id, embedding, metadata)
      VALUES ($1, $2::vector, $3)
      ON CONFLICT (id) DO UPDATE SET
        embedding = EXCLUDED.embedding,
        metadata = EXCLUDED.metadata
    `, [id, vectorStr, metadata ? JSON.stringify(metadata) : null]);
  }

  async search(query: number[], k: number, threshold?: number): Promise<VectorSearchResult[]> {
    const vectorStr = `[${query.join(',')}]`;
    const minSimilarity = threshold || 0.7;

    // Use cosine distance (1 - cosine_similarity)
    const result = await this.pool.query(`
      SELECT 
        id,
        1 - (embedding <=> $1::vector) as similarity,
        metadata
      FROM ${this.tableName}
      WHERE 1 - (embedding <=> $1::vector) >= $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, [vectorStr, minSimilarity, k]);

    return result.rows.map((row: any) => ({
      id: row.id,
      similarity: parseFloat(row.similarity),
      entry: undefined, // Entry needs to be fetched separately if needed
    }));
  }

  async deleteVector(id: string): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
  }

  async clear(): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.tableName}`);
  }

  async size(): Promise<number> {
    const result = await this.pool.query(`SELECT COUNT(*)::int as count FROM ${this.tableName}`);
    return result.rows[0].count;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.pool.query('SELECT 1');
      return result.rows.length === 1;
    } catch {
      return false;
    }
  }
}
