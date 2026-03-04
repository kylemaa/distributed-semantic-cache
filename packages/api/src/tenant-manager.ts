/**
 * Multi-Tenancy Manager
 * Manages tenant isolation, quotas, and configuration
 * 
 * MIT License - See LICENSE for details
 */

import Database from 'better-sqlite3';
import path from 'path';

export interface TenantConfig {
  tenantId: string;
  name: string;
  similarityThreshold?: number;
  maxQueries?: number; // Monthly quota
  features?: {
    encryption?: boolean;
    auditLog?: boolean;
    smartMatching?: boolean;
    adaptiveLearning?: boolean;
  };
  createdAt: number;
  updatedAt: number;
}

export interface TenantUsage {
  tenantId: string;
  queriesThisMonth: number;
  cacheHits: number;
  cacheMisses: number;
  totalCost: number; // In USD
  savedCost: number; // In USD
  lastQueryAt?: number;
}

export interface TenantQuota {
  tenantId: string;
  maxQueries: number;
  usedQueries: number;
  percentUsed: number;
  isOverQuota: boolean;
}

export class TenantManager {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'tenants.db');
    this.db = new Database(this.dbPath);
    this.initializeTables();
  }

  private initializeTables(): void {
    // Tenants table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenants (
        tenant_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        similarity_threshold REAL DEFAULT 0.85,
        max_queries INTEGER DEFAULT 10000,
        features_encryption INTEGER DEFAULT 1,
        features_audit_log INTEGER DEFAULT 1,
        features_smart_matching INTEGER DEFAULT 1,
        features_adaptive_learning INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Tenant usage table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tenant_usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        year_month TEXT NOT NULL,
        queries INTEGER DEFAULT 0,
        cache_hits INTEGER DEFAULT 0,
        cache_misses INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0,
        saved_cost REAL DEFAULT 0,
        last_query_at INTEGER,
        UNIQUE(tenant_id, year_month),
        FOREIGN KEY(tenant_id) REFERENCES tenants(tenant_id) ON DELETE CASCADE
      )
    `);

    // Create indices for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_usage_tenant ON tenant_usage(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_usage_month ON tenant_usage(year_month);
    `);
  }

  /**
   * Create a new tenant
   */
  createTenant(config: Omit<TenantConfig, 'createdAt' | 'updatedAt'>): TenantConfig {
    const now = Date.now();
    
    // Provide default features if not specified
    const features = config.features || {};
    const fullConfig: TenantConfig = {
      ...config,
      features: {
        encryption: features.encryption !== undefined ? features.encryption : true,
        auditLog: features.auditLog !== undefined ? features.auditLog : true,
        smartMatching: features.smartMatching !== undefined ? features.smartMatching : true,
        adaptiveLearning: features.adaptiveLearning !== undefined ? features.adaptiveLearning : true,
      },
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO tenants (
        tenant_id, name, similarity_threshold, max_queries,
        features_encryption, features_audit_log, features_smart_matching, features_adaptive_learning,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      fullConfig.tenantId,
      fullConfig.name,
      fullConfig.similarityThreshold ?? 0.85,
      fullConfig.maxQueries ?? 10000,
      fullConfig.features?.encryption ? 1 : 0,
      fullConfig.features?.auditLog ? 1 : 0,
      fullConfig.features?.smartMatching ? 1 : 0,
      fullConfig.features?.adaptiveLearning ? 1 : 0,
      fullConfig.createdAt,
      fullConfig.updatedAt
    );

    return fullConfig;
  }

  /**
   * Get tenant configuration
   */
  getTenant(tenantId: string): TenantConfig | null {
    const stmt = this.db.prepare(`
      SELECT * FROM tenants WHERE tenant_id = ?
    `);

    const row = stmt.get(tenantId) as any;
    if (!row) return null;

    return {
      tenantId: row.tenant_id,
      name: row.name,
      similarityThreshold: row.similarity_threshold,
      maxQueries: row.max_queries,
      features: {
        encryption: row.features_encryption === 1,
        auditLog: row.features_audit_log === 1,
        smartMatching: row.features_smart_matching === 1,
        adaptiveLearning: row.features_adaptive_learning === 1,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Update tenant configuration
   */
  updateTenant(tenantId: string, updates: Partial<Omit<TenantConfig, 'tenantId' | 'createdAt'>>): TenantConfig | null {
    const existing = this.getTenant(tenantId);
    if (!existing) return null;

    const now = Date.now();
    const updated = {
      ...existing,
      ...updates,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      UPDATE tenants SET
        name = ?,
        similarity_threshold = ?,
        max_queries = ?,
        features_encryption = ?,
        features_audit_log = ?,
        features_smart_matching = ?,
        features_adaptive_learning = ?,
        updated_at = ?
      WHERE tenant_id = ?
    `);

    stmt.run(
      updated.name,
      updated.similarityThreshold ?? 0.85,
      updated.maxQueries ?? 10000,
      updated.features?.encryption ? 1 : 0,
      updated.features?.auditLog ? 1 : 0,
      updated.features?.smartMatching ? 1 : 0,
      updated.features?.adaptiveLearning ? 1 : 0,
      updated.updatedAt,
      tenantId
    );

    return updated;
  }

  /**
   * Delete tenant and all associated data
   */
  deleteTenant(tenantId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM tenants WHERE tenant_id = ?');
    const result = stmt.run(tenantId);
    return result.changes > 0;
  }

  /**
   * List all tenants
   */
  listTenants(): TenantConfig[] {
    const stmt = this.db.prepare('SELECT * FROM tenants ORDER BY created_at DESC');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      tenantId: row.tenant_id,
      name: row.name,
      similarityThreshold: row.similarity_threshold,
      maxQueries: row.max_queries,
      features: {
        encryption: row.features_encryption === 1,
        auditLog: row.features_audit_log === 1,
        smartMatching: row.features_smart_matching === 1,
        adaptiveLearning: row.features_adaptive_learning === 1,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Record query usage for tenant
   */
  recordQuery(tenantId: string, isHit: boolean, cost: number = 0, savedCost: number = 0): void {
    const yearMonth = this.getCurrentYearMonth();
    const now = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO tenant_usage (tenant_id, year_month, queries, cache_hits, cache_misses, total_cost, saved_cost, last_query_at)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, year_month) DO UPDATE SET
        queries = queries + 1,
        cache_hits = cache_hits + ?,
        cache_misses = cache_misses + ?,
        total_cost = total_cost + ?,
        saved_cost = saved_cost + ?,
        last_query_at = ?
    `);

    const hit = isHit ? 1 : 0;
    const miss = isHit ? 0 : 1;

    stmt.run(
      tenantId,
      yearMonth,
      hit,
      miss,
      cost,
      savedCost,
      now,
      hit,
      miss,
      cost,
      savedCost,
      now
    );
  }

  /**
   * Get tenant usage for current month
   */
  getTenantUsage(tenantId: string, yearMonth?: string): TenantUsage | null {
    const month = yearMonth || this.getCurrentYearMonth();

    const stmt = this.db.prepare(`
      SELECT * FROM tenant_usage WHERE tenant_id = ? AND year_month = ?
    `);

    const row = stmt.get(tenantId, month) as any;
    if (!row) {
      return {
        tenantId,
        queriesThisMonth: 0,
        cacheHits: 0,
        cacheMisses: 0,
        totalCost: 0,
        savedCost: 0,
      };
    }

    return {
      tenantId: row.tenant_id,
      queriesThisMonth: row.queries,
      cacheHits: row.cache_hits,
      cacheMisses: row.cache_misses,
      totalCost: row.total_cost,
      savedCost: row.saved_cost,
      lastQueryAt: row.last_query_at,
    };
  }

  /**
   * Get tenant quota status
   */
  getTenantQuota(tenantId: string): TenantQuota | null {
    const tenant = this.getTenant(tenantId);
    if (!tenant) return null;

    const usage = this.getTenantUsage(tenantId);
    if (!usage) return null;

    const maxQueries = tenant.maxQueries || 10000;
    const usedQueries = usage.queriesThisMonth;
    const percentUsed = (usedQueries / maxQueries) * 100;
    const isOverQuota = usedQueries >= maxQueries;

    return {
      tenantId,
      maxQueries,
      usedQueries,
      percentUsed: Math.round(percentUsed * 100) / 100,
      isOverQuota,
    };
  }

  /**
   * Check if tenant is over quota
   */
  isOverQuota(tenantId: string): boolean {
    const quota = this.getTenantQuota(tenantId);
    return quota?.isOverQuota ?? false;
  }

  /**
   * Get usage history for multiple months
   */
  getUsageHistory(tenantId: string, months: number = 12): TenantUsage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM tenant_usage 
      WHERE tenant_id = ? 
      ORDER BY year_month DESC 
      LIMIT ?
    `);

    const rows = stmt.all(tenantId, months) as any[];

    return rows.map(row => ({
      tenantId: row.tenant_id,
      queriesThisMonth: row.queries,
      cacheHits: row.cache_hits,
      cacheMisses: row.cache_misses,
      totalCost: row.total_cost,
      savedCost: row.saved_cost,
      lastQueryAt: row.last_query_at,
    }));
  }

  /**
   * Reset monthly usage (for testing)
   */
  resetMonthlyUsage(tenantId: string): void {
    const yearMonth = this.getCurrentYearMonth();
    const stmt = this.db.prepare(`
      DELETE FROM tenant_usage WHERE tenant_id = ? AND year_month = ?
    `);
    stmt.run(tenantId, yearMonth);
  }

  /**
   * Get all tenant statistics
   */
  getAllTenantsStats(): Array<TenantConfig & TenantUsage & { quota: TenantQuota }> {
    const tenants = this.listTenants();
    return tenants.map(tenant => {
      const usage = this.getTenantUsage(tenant.tenantId) || {
        tenantId: tenant.tenantId,
        queriesThisMonth: 0,
        cacheHits: 0,
        cacheMisses: 0,
        totalCost: 0,
        savedCost: 0,
      };
      const quota = this.getTenantQuota(tenant.tenantId) || {
        tenantId: tenant.tenantId,
        maxQueries: tenant.maxQueries || 10000,
        usedQueries: 0,
        percentUsed: 0,
        isOverQuota: false,
      };

      return {
        ...tenant,
        ...usage,
        quota,
      };
    });
  }

  private getCurrentYearMonth(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Export all data (for backup/migration)
   */
  export(): { tenants: TenantConfig[]; usage: any[] } {
    const tenants = this.listTenants();
    const usageStmt = this.db.prepare('SELECT * FROM tenant_usage');
    const usage = usageStmt.all();

    return { tenants, usage };
  }

  /**
   * Import data (for restore/migration)
   */
  import(data: { tenants: TenantConfig[]; usage: any[] }): void {
    const insertTenant = this.db.prepare(`
      INSERT OR REPLACE INTO tenants (
        tenant_id, name, similarity_threshold, max_queries,
        features_encryption, features_audit_log, features_smart_matching, features_adaptive_learning,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertUsage = this.db.prepare(`
      INSERT OR REPLACE INTO tenant_usage (
        tenant_id, year_month, queries, cache_hits, cache_misses, total_cost, saved_cost, last_query_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.db.transaction(() => {
      for (const tenant of data.tenants) {
        insertTenant.run(
          tenant.tenantId,
          tenant.name,
          tenant.similarityThreshold ?? 0.85,
          tenant.maxQueries ?? 10000,
          tenant.features?.encryption ? 1 : 0,
          tenant.features?.auditLog ? 1 : 0,
          tenant.features?.smartMatching ? 1 : 0,
          tenant.features?.adaptiveLearning ? 1 : 0,
          tenant.createdAt,
          tenant.updatedAt
        );
      }

      for (const usage of data.usage) {
        insertUsage.run(
          usage.tenant_id,
          usage.year_month,
          usage.queries,
          usage.cache_hits,
          usage.cache_misses,
          usage.total_cost,
          usage.saved_cost,
          usage.last_query_at
        );
      }
    })();
  }
}
