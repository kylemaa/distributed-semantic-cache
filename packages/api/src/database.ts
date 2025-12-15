/**
 * SQLite database management
 */

import Database from 'better-sqlite3';
import type { CacheEntry } from '@distributed-semantic-cache/shared';
import { config } from './config.js';

export class CacheDatabase {
  private db: Database.Database;

  constructor(dbPath: string = config.database.path) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize(): void {
    // Create cache entries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        id TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        response TEXT NOT NULL,
        embedding TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        metadata TEXT,
        quantized_embedding BLOB
      );
      CREATE INDEX IF NOT EXISTS idx_timestamp ON cache_entries(timestamp);
    `);
  }

  /**
   * Insert a new cache entry
   */
  insertEntry(entry: CacheEntry, quantizedEmbedding?: Buffer): void {
    const stmt = this.db.prepare(`
      INSERT INTO cache_entries (id, query, response, embedding, timestamp, metadata, quantized_embedding)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      entry.query,
      entry.response,
      JSON.stringify(entry.embedding),
      entry.timestamp,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      quantizedEmbedding || null
    );
  }

  /**
   * Get all cache entries
   * Returns entries with quantized embeddings if available
   */
  getAllEntries(): (CacheEntry & { quantizedEmbedding?: Buffer })[] {
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
    }));
  }

  /**
   * Get entry by ID
   */
  getEntryById(id: string): CacheEntry | null {
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

  /**
   * Delete oldest entries to maintain cache size
   */
  pruneCache(maxSize: number): void {
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

  /**
   * Clear all entries
   */
  clearCache(): void {
    this.db.prepare('DELETE FROM cache_entries').run();
  }

  /**
   * Get cache statistics
   */
  getStats(): { totalEntries: number; oldestTimestamp: number | null; newestTimestamp: number | null } {
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

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
