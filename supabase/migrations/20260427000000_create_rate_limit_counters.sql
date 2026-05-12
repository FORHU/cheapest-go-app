-- ============================================================================
-- Rate Limit Counters
-- Replaces per-process in-memory Map with a shared, persistent store so
-- rate limits survive Vercel cold-starts and work across all instances.
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limit_counters (
    key      TEXT        PRIMARY KEY,
    count    INTEGER     NOT NULL DEFAULT 0,
    reset_at TIMESTAMPTZ NOT NULL
);

-- Index to speed up the periodic cleanup cron
CREATE INDEX IF NOT EXISTS rate_limit_counters_reset_at_idx
    ON rate_limit_counters (reset_at);

-- Row-level security: service role only (no anon/authenticated access)
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Atomic increment RPC
-- Inserts a new window on first call; increments on subsequent calls.
-- Resets the counter if the existing window has expired.
-- Returns the post-increment count and window end time.
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_rate_limit(
    p_key       TEXT,
    p_window_ms BIGINT
)
RETURNS TABLE (current_count INT, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
AS $$
DECLARE
    v_now      TIMESTAMPTZ := NOW();
    v_reset_at TIMESTAMPTZ := v_now + (p_window_ms || ' milliseconds')::INTERVAL;
BEGIN
    RETURN QUERY
    INSERT INTO rate_limit_counters (key, count, reset_at)
    VALUES (p_key, 1, v_reset_at)
    ON CONFLICT (key) DO UPDATE SET
        count    = CASE
                       WHEN rate_limit_counters.reset_at < v_now THEN 1
                       ELSE rate_limit_counters.count + 1
                   END,
        reset_at = CASE
                       WHEN rate_limit_counters.reset_at < v_now THEN v_reset_at
                       ELSE rate_limit_counters.reset_at
                   END
    RETURNING
        rate_limit_counters.count::INT,
        rate_limit_counters.reset_at;
END;
$$;

-- ============================================================================
-- Hourly cleanup: delete rows whose window has already expired.
-- Keeps the table small; active IPs auto-recreate their row on next request.
-- ============================================================================

SELECT cron.schedule(
    'purge-expired-rate-limit-counters',
    '0 * * * *',
    $$DELETE FROM rate_limit_counters WHERE reset_at < NOW()$$
);
