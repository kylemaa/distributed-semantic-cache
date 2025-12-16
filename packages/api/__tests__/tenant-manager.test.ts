import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TenantManager } from '../src/tenant-manager.js';
import fs from 'fs';
import path from 'path';

describe('TenantManager', () => {
  let tenantManager: TenantManager;
  const testDbPath = path.join(process.cwd(), `test-tenants-${Date.now()}-${Math.random()}.db`);

  beforeEach(() => {
    tenantManager = new TenantManager(testDbPath);
  });

  afterEach(() => {
    tenantManager.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Tenant CRUD', () => {
    it('should create a tenant', () => {
      const tenant = tenantManager.createTenant({
        tenantId: 'test-tenant',
        name: 'Test Tenant',
        maxQueries: 1000,
      });

      expect(tenant.tenantId).toBe('test-tenant');
      expect(tenant.name).toBe('Test Tenant');
      expect(tenant.maxQueries).toBe(1000);
      expect(tenant.createdAt).toBeDefined();
      expect(tenant.updatedAt).toBeDefined();
    });

    it('should get a tenant', () => {
      tenantManager.createTenant({
        tenantId: 'test-tenant',
        name: 'Test Tenant',
      });

      const tenant = tenantManager.getTenant('test-tenant');
      expect(tenant).toBeDefined();
      expect(tenant?.tenantId).toBe('test-tenant');
      expect(tenant?.name).toBe('Test Tenant');
    });

    it('should return null for non-existent tenant', () => {
      const tenant = tenantManager.getTenant('non-existent');
      expect(tenant).toBeNull();
    });

    it('should update a tenant', () => {
      tenantManager.createTenant({
        tenantId: 'test-tenant',
        name: 'Test Tenant',
        maxQueries: 1000,
      });

      const updated = tenantManager.updateTenant('test-tenant', {
        name: 'Updated Tenant',
        maxQueries: 2000,
      });

      expect(updated?.name).toBe('Updated Tenant');
      expect(updated?.maxQueries).toBe(2000);
      expect(updated?.updatedAt).toBeGreaterThan(updated?.createdAt || 0);
    });

    it('should delete a tenant', () => {
      tenantManager.createTenant({
        tenantId: 'test-tenant',
        name: 'Test Tenant',
      });

      const deleted = tenantManager.deleteTenant('test-tenant');
      expect(deleted).toBe(true);

      const tenant = tenantManager.getTenant('test-tenant');
      expect(tenant).toBeNull();
    });

    it('should list all tenants', () => {
      tenantManager.createTenant({
        tenantId: 'tenant-1',
        name: 'Tenant 1',
      });

      tenantManager.createTenant({
        tenantId: 'tenant-2',
        name: 'Tenant 2',
      });

      const tenants = tenantManager.listTenants();
      expect(tenants).toHaveLength(2);
      expect(tenants[0].tenantId).toBe('tenant-2'); // Most recent first
      expect(tenants[1].tenantId).toBe('tenant-1');
    });
  });

  describe('Tenant Features', () => {
    it('should create tenant with custom features', () => {
      const tenant = tenantManager.createTenant({
        tenantId: 'test-tenant',
        name: 'Test Tenant',
        features: {
          encryption: false,
          auditLog: true,
          smartMatching: true,
          adaptiveLearning: false,
        },
      });

      expect(tenant.features?.encryption).toBe(false);
      expect(tenant.features?.auditLog).toBe(true);
      expect(tenant.features?.smartMatching).toBe(true);
      expect(tenant.features?.adaptiveLearning).toBe(false);
    });

    it('should use default features when not specified', () => {
      const tenant = tenantManager.createTenant({
        tenantId: 'test-tenant',
        name: 'Test Tenant',
      });

      expect(tenant.features?.encryption).toBe(true);
      expect(tenant.features?.auditLog).toBe(true);
      expect(tenant.features?.smartMatching).toBe(true);
      expect(tenant.features?.adaptiveLearning).toBe(true);
    });
  });

  describe('Usage Tracking', () => {
    beforeEach(() => {
      tenantManager.createTenant({
        tenantId: 'test-tenant',
        name: 'Test Tenant',
        maxQueries: 100,
      });
    });

    it('should record query usage', () => {
      tenantManager.recordQuery('test-tenant', true, 0.001, 0.005);

      const usage = tenantManager.getTenantUsage('test-tenant');
      expect(usage?.queriesThisMonth).toBe(1);
      expect(usage?.cacheHits).toBe(1);
      expect(usage?.cacheMisses).toBe(0);
      expect(usage?.savedCost).toBe(0.005);
    });

    it('should accumulate multiple queries', () => {
      tenantManager.recordQuery('test-tenant', true, 0, 0.005);
      tenantManager.recordQuery('test-tenant', false, 0.006, 0);
      tenantManager.recordQuery('test-tenant', true, 0, 0.005);

      const usage = tenantManager.getTenantUsage('test-tenant');
      expect(usage?.queriesThisMonth).toBe(3);
      expect(usage?.cacheHits).toBe(2);
      expect(usage?.cacheMisses).toBe(1);
      expect(usage?.totalCost).toBe(0.006);
      expect(usage?.savedCost).toBe(0.010);
    });

    it('should track last query time', () => {
      const before = Date.now();
      tenantManager.recordQuery('test-tenant', true);
      const after = Date.now();

      const usage = tenantManager.getTenantUsage('test-tenant');
      expect(usage?.lastQueryAt).toBeGreaterThanOrEqual(before);
      expect(usage?.lastQueryAt).toBeLessThanOrEqual(after);
    });
  });

  describe('Quota Management', () => {
    beforeEach(() => {
      tenantManager.createTenant({
        tenantId: 'test-tenant',
        name: 'Test Tenant',
        maxQueries: 10,
      });
    });

    it('should return quota status', () => {
      tenantManager.recordQuery('test-tenant', true);
      tenantManager.recordQuery('test-tenant', true);
      tenantManager.recordQuery('test-tenant', true);

      const quota = tenantManager.getTenantQuota('test-tenant');
      expect(quota?.maxQueries).toBe(10);
      expect(quota?.usedQueries).toBe(3);
      expect(quota?.percentUsed).toBe(30);
      expect(quota?.isOverQuota).toBe(false);
    });

    it('should detect over-quota', () => {
      // Record 11 queries (over the limit of 10)
      for (let i = 0; i < 11; i++) {
        tenantManager.recordQuery('test-tenant', true);
      }

      const quota = tenantManager.getTenantQuota('test-tenant');
      expect(quota?.usedQueries).toBe(11);
      expect(quota?.isOverQuota).toBe(true);
    });

    it('should check if tenant is over quota', () => {
      expect(tenantManager.isOverQuota('test-tenant')).toBe(false);

      for (let i = 0; i < 10; i++) {
        tenantManager.recordQuery('test-tenant', true);
      }

      expect(tenantManager.isOverQuota('test-tenant')).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should get all tenant stats', () => {
      tenantManager.createTenant({
        tenantId: 'tenant-1',
        name: 'Tenant 1',
        maxQueries: 100,
      });

      tenantManager.createTenant({
        tenantId: 'tenant-2',
        name: 'Tenant 2',
        maxQueries: 200,
      });

      tenantManager.recordQuery('tenant-1', true);
      tenantManager.recordQuery('tenant-1', false);
      tenantManager.recordQuery('tenant-2', true);

      const stats = tenantManager.getAllTenantsStats();
      expect(stats).toHaveLength(2);

      const tenant1Stats = stats.find(s => s.tenantId === 'tenant-1');
      expect(tenant1Stats?.queriesThisMonth).toBe(2);
      expect(tenant1Stats?.cacheHits).toBe(1);
      expect(tenant1Stats?.quota.percentUsed).toBe(2);

      const tenant2Stats = stats.find(s => s.tenantId === 'tenant-2');
      expect(tenant2Stats?.queriesThisMonth).toBe(1);
      expect(tenant2Stats?.quota.percentUsed).toBe(0.5);
    });
  });

  describe('Data Export/Import', () => {
    it('should export and import tenant data', () => {
      tenantManager.createTenant({
        tenantId: 'tenant-1',
        name: 'Tenant 1',
        maxQueries: 100,
      });

      tenantManager.recordQuery('tenant-1', true, 0, 0.005);

      const exported = tenantManager.export();
      expect(exported.tenants).toHaveLength(1);
      expect(exported.usage).toHaveLength(1);

      // Close and recreate
      tenantManager.close();
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }

      tenantManager = new TenantManager(testDbPath);
      tenantManager.import(exported);

      const tenant = tenantManager.getTenant('tenant-1');
      expect(tenant?.name).toBe('Tenant 1');

      const usage = tenantManager.getTenantUsage('tenant-1');
      expect(usage?.queriesThisMonth).toBe(1);
    });
  });

  describe('Usage History', () => {
    it('should get usage history for multiple months', () => {
      tenantManager.createTenant({
        tenantId: 'test-tenant',
        name: 'Test Tenant',
      });

      tenantManager.recordQuery('test-tenant', true);

      const history = tenantManager.getUsageHistory('test-tenant', 12);
      expect(history).toHaveLength(1);
      expect(history[0].queriesThisMonth).toBe(1);
    });
  });

  describe('Monthly Reset', () => {
    it('should reset monthly usage', () => {
      tenantManager.createTenant({
        tenantId: 'test-tenant',
        name: 'Test Tenant',
      });

      tenantManager.recordQuery('test-tenant', true);
      tenantManager.recordQuery('test-tenant', false);

      let usage = tenantManager.getTenantUsage('test-tenant');
      expect(usage?.queriesThisMonth).toBe(2);

      tenantManager.resetMonthlyUsage('test-tenant');

      usage = tenantManager.getTenantUsage('test-tenant');
      expect(usage?.queriesThisMonth).toBe(0);
    });
  });
});
