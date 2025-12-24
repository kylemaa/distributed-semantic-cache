/**
 * SQLite Storage Adapter
 * 
 * Wraps the existing CacheDatabase to implement ICacheStorage interface.
 * This maintains full backward compatibility while enabling the abstraction.
 */

import Database from 'better-sqlite3';
import type { CacheEntry } from '@distributed-semantic-cache/shared';
import type {
  ICacheStorage,
  StoredCacheEntry,
  AuditLogEntry,
  CacheStats,
} from './interfaces.js';

export interface SQLiteStorageConfig {
  path: string;
}

export class SQLiteStorage implements ICacheStorage {
  private db: Database.Database;
  private config: SQLiteStorageConfig;

  constructor(config: SQLiteStorageConfig) {
    this.config = config;
    this.db = new Database(config.path);
  }

  async initialize(): Promise<void> {
    // Create cache entries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        response TEXT NOT NULL,
        embedding TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        quantized_embedding BLOB,
        encrypted_embedding BLOB,
        encryption_metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_timestamp ON cache_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_query ON cache_entries(query);
      
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        action TEXT NOT NULL,
        entry_id TEXT,
        query_hash TEXT,
        success INTEGER NOT NULL,
        metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    `);
  }

  async insertEntry(
    entry: CacheEntry,
    quantizedEmbedding?: Buffer,
    encryptedEmbedding?: Buffer,
    encryptionMetadata?: string
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO cache_entries (id, query, response, embedding, timestamp, metadata, quantized_embedding, encrypted_embedding, encryption_metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      entry.query,
      entry.response,
      JSON.stringify(entry.embedding),
      entry.timestamp,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      quantizedEmbedding || null,
      encryptedEmbedding || null,
      encryptionMetadata || null
    );
  }

  async getAllEntries(): Promise<StoredCacheEntry[]> {
    const stmt = this.db.prepare('SELECT * FROM cache_entries ORDER BY timestamp DESC');
    const rows = stmt.all() as any[];

    return rows.map((row) => ({
      id: row.id,
      query: row.query,
      response: row.response,
      embedding: JSON.parse(row.embedding),
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      quantizedEmbedding: row.quantized_embedding ? Buffer.from(row.quantized_embedding) : undefined,
      encryptedEmbedding: row.encrypted_embedding ? Buffer.from(row.encrypted_embedding) : undefined,
      encryptionMetadata: row.encryption_metadata || undefined,
    }));
  }

  async getEntryById(id: string): Promise<CacheEntry | null> {
    const stmt = this.db.prepare('SELECT * FROM cache_entries WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      query: row.query,
      response: row.response,
      embedding: JSON.parse(row.embedding),
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  async getEntryByQuery(query: string): Promise<CacheEntry | null> {
    const stmt = this.db.prepare('SELECT * FROM cache_entries WHERE query = ? LIMIT 1');
    const row = stmt.get(query) as any;

    if (!row) return null;

    return {
      id: row.id,
      query: row.query,
      response: row.response,
      embedding: JSON.parse(row.embedding),
      timestamp: row.timestamp,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  async pruneCache(maxSize: number): Promise<void> {
    const count = (this.db.prepare('SELECT COUNT(*) as count FROM cache_entries').get() as any).count;

    if (count > maxSize) {
      const deleteCount = count - maxSize;
      this.db.prepare(`
        DELETE FROM cache_entries
        WHERE id IN (
          SELECT id FROM cache_entries
          ORDER BY timestamp ASC
          LIMIT ?
        )
      `).run(deleteCount);
    }
  }

  async clearCache(): Promise<void> {
    this.db.prepare('DELETE FROM cache_entries').run();
  }

  async getStats(): Promise<CacheStats> {
    const result = this.db.prepare(`
      SELECT 
        COUNT(*) as count,
        MIN(timestamp) as oldestTimestamp,
        MAX(timestamp) as newestTimestamp
      FROM cache_entries
    `).get() as any;

    return {
      totalEntries: result.count,
      oldestTimestamp: result.oldestTimestamp,
      newestTimestamp: result.newestTimestamp,
    };
  }

  async addAuditLog(
    action: string,
    entryId?: string,
    queryHash?: string,
    success: boolean = true,
    metadata?: any
  ): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (timestamp, action, entry_id, query_hash, success, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      Date.now(),
      action,
      entryId || null,
      queryHash || null,
      success ? 1 : 0,
      metadata ? JSON.stringify(metadata) : null
    );
  }

  async getAuditLogs(limit: number = 100, action?: string): Promise<AuditLogEntry[]> {
    let query = 'SELECT * FROM audit_log';
    const params: any[] = [];

    if (action) {
      query += ' WHERE action = ?';
      params.push(action);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      action: row.action,
      entryId: row.entry_id || undefined,
      queryHash: row.query_hash || undefined,
      success: row.success === 1,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }));
  }

  async clearOldAuditLogs(daysToKeep: number = 30): Promise<void> {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    this.db.prepare('DELETE FROM audit_log WHERE timestamp < ?').run(cutoffTime);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async isHealthy(): Promise<boolean> {
    try {
      this.db.prepare('SELECT 1').get();
      return true;
    } catch {
      return false;
    }
  }
}
