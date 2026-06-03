-- Hotel search result cache.
-- Stores the full runTgxSearch result keyed by search parameters.
-- TTL is enforced by expires_at; stale rows are cheap to ignore and cleaned up periodically.

CREATE TABLE IF NOT EXISTS hotel_search_cache (
    cache_key  TEXT PRIMARY KEY,
    result     JSONB        NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ  NOT NULL
);

-- Fast lookup for TTL check on read
CREATE INDEX IF NOT EXISTS idx_hotel_search_cache_expires
    ON hotel_search_cache (expires_at);

-- Auto-delete expired rows once a day (requires pg_cron extension).
-- If pg_cron is not available this is a no-op — stale rows are ignored on read.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'hotel-search-cache-cleanup',
            '0 3 * * *',
            $cron$DELETE FROM hotel_search_cache WHERE expires_at < now()$cron$
        );
    END IF;
END;
$$;
