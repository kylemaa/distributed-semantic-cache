-- PostgreSQL initialization script for Distributed Semantic Cache
-- Requires pgvector extension

-- Create schema
CREATE SCHEMA IF NOT EXISTS semantic_cache;

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Set search path
SET search_path TO semantic_cache, public;

-- ============================================================================
-- CACHE ENTRIES TABLE
-- Main storage for cached LLM responses with vector embeddings
-- ============================================================================
CREATE TABLE IF NOT EXISTS cache_entries (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    
    -- Query data
    query TEXT NOT NULL,
    query_normalized TEXT,
    
    -- Embedding (using pgvector for native similarity search)
    embedding vector(384),  -- all-MiniLM-L6-v2 dimension
    
    -- Response data
    response TEXT NOT NULL,
    
    -- Metadata
    model TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    
    -- Cache management
    hit_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    -- Privacy
    encrypted BOOLEAN DEFAULT FALSE
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Tenant isolation
CREATE INDEX IF NOT EXISTS idx_cache_entries_tenant 
    ON cache_entries(tenant_id);

-- Exact match lookup (L1 cache)
CREATE INDEX IF NOT EXISTS idx_cache_entries_query_hash 
    ON cache_entries USING hash (query);

-- Normalized query lookup (L2 cache)
CREATE INDEX IF NOT EXISTS idx_cache_entries_normalized 
    ON cache_entries USING hash (query_normalized);

-- Vector similarity search (L3 cache) - HNSW for fast ANN
-- m=16: number of connections per layer
-- ef_construction=64: size of dynamic candidate list during construction
CREATE INDEX IF NOT EXISTS idx_cache_entries_embedding_hnsw 
    ON cache_entries 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- LRU eviction support
CREATE INDEX IF NOT EXISTS idx_cache_entries_lru 
    ON cache_entries(tenant_id, last_accessed);

-- Expiration cleanup
CREATE INDEX IF NOT EXISTS idx_cache_entries_expires 
    ON cache_entries(expires_at) 
    WHERE expires_at IS NOT NULL;

-- ============================================================================
-- AUDIT LOG TABLE
-- Privacy-compliant logging for compliance requirements
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    tenant_id TEXT NOT NULL DEFAULT 'default',
    action TEXT NOT NULL,
    entry_id TEXT,
    similarity REAL,
    latency_ms REAL,
    cache_layer TEXT,  -- 'L1', 'L2', 'L3', 'miss'
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Fast audit queries
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_time 
    ON audit_log(tenant_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_entry 
    ON audit_log(entry_id) 
    WHERE entry_id IS NOT NULL;

-- ============================================================================
-- ANALYTICS AGGREGATES TABLE
-- Pre-computed analytics for dashboard performance
-- ============================================================================
CREATE TABLE IF NOT EXISTS analytics_daily (
    date DATE NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    
    -- Hit/miss counts
    total_requests INTEGER DEFAULT 0,
    l1_hits INTEGER DEFAULT 0,
    l2_hits INTEGER DEFAULT 0,
    l3_hits INTEGER DEFAULT 0,
    misses INTEGER DEFAULT 0,
    
    -- Performance
    avg_latency_ms REAL,
    p50_latency_ms REAL,
    p95_latency_ms REAL,
    p99_latency_ms REAL,
    
    -- Cost savings
    estimated_tokens_saved BIGINT DEFAULT 0,
    estimated_cost_saved_usd REAL DEFAULT 0,
    
    PRIMARY KEY (date, tenant_id)
);

-- ============================================================================
-- TENANT CONFIGURATION TABLE
-- Multi-tenant configuration storage
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenant_config (
    tenant_id TEXT PRIMARY KEY,
    
    -- Thresholds
    similarity_threshold REAL DEFAULT 0.85,
    l1_enabled BOOLEAN DEFAULT TRUE,
    l2_enabled BOOLEAN DEFAULT TRUE,
    l3_enabled BOOLEAN DEFAULT TRUE,
    
    -- Limits
    max_cache_size INTEGER DEFAULT 10000,
    max_entry_size_bytes INTEGER DEFAULT 1048576,  -- 1MB
    ttl_seconds INTEGER,  -- NULL = no expiration
    
    -- Privacy
    privacy_mode TEXT DEFAULT 'normal',  -- normal, strict, paranoid
    encryption_enabled BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb
);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to perform semantic similarity search
CREATE OR REPLACE FUNCTION semantic_search(
    p_tenant_id TEXT,
    p_embedding vector(384),
    p_threshold REAL DEFAULT 0.85,
    p_limit INTEGER DEFAULT 1
)
RETURNS TABLE (
    id TEXT,
    query TEXT,
    response TEXT,
    similarity REAL,
    model TEXT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ce.id,
        ce.query,
        ce.response,
        1 - (ce.embedding <=> p_embedding) AS similarity,
        ce.model,
        ce.metadata
    FROM cache_entries ce
    WHERE ce.tenant_id = p_tenant_id
      AND ce.embedding IS NOT NULL
      AND (ce.expires_at IS NULL OR ce.expires_at > NOW())
      AND 1 - (ce.embedding <=> p_embedding) >= p_threshold
    ORDER BY ce.embedding <=> p_embedding
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to update hit count and last accessed
CREATE OR REPLACE FUNCTION record_cache_hit(p_id TEXT)
RETURNS VOID AS $$
BEGIN
    UPDATE cache_entries 
    SET hit_count = hit_count + 1,
        last_accessed = NOW()
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- Function to evict oldest entries when over capacity
CREATE OR REPLACE FUNCTION evict_lru_entries(
    p_tenant_id TEXT,
    p_max_entries INTEGER
)
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    WITH to_delete AS (
        SELECT id
        FROM cache_entries
        WHERE tenant_id = p_tenant_id
        ORDER BY last_accessed DESC
        OFFSET p_max_entries
    )
    DELETE FROM cache_entries
    WHERE id IN (SELECT id FROM to_delete);
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired entries
CREATE OR REPLACE FUNCTION cleanup_expired_entries()
RETURNS INTEGER AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM cache_entries
    WHERE expires_at IS NOT NULL AND expires_at < NOW();
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert default tenant config
INSERT INTO tenant_config (tenant_id) 
VALUES ('default')
ON CONFLICT (tenant_id) DO NOTHING;

-- ============================================================================
-- SCHEDULED MAINTENANCE (requires pg_cron extension)
-- Uncomment if pg_cron is available
-- ============================================================================

-- -- Cleanup expired entries every hour
-- SELECT cron.schedule('cleanup-expired', '0 * * * *', 
--     $$SELECT cleanup_expired_entries()$$
-- );

-- -- Vacuum and analyze daily
-- SELECT cron.schedule('vacuum-cache', '0 3 * * *', 
--     $$VACUUM ANALYZE semantic_cache.cache_entries$$
-- );

-- ============================================================================
-- GRANTS
-- ============================================================================

-- If using a separate application user, grant permissions:
-- GRANT USAGE ON SCHEMA semantic_cache TO app_user;
-- GRANT ALL ON ALL TABLES IN SCHEMA semantic_cache TO app_user;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA semantic_cache TO app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA semantic_cache TO app_user;
