-- API Logs table for tracking all external provider API calls.
-- Used for debugging production issues, monitoring provider reliability, and cost tracking.

CREATE TABLE IF NOT EXISTS api_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider          TEXT NOT NULL,           -- 'duffel' | 'mystifly' | 'mystifly_v2' | 'stripe' | 'cache'
    endpoint          TEXT NOT NULL,           -- URL or function name
    method            TEXT DEFAULT 'POST',
    request_params    JSONB,                   -- sanitized request (no secrets)
    response_status   INT,                     -- HTTP status code
    response_summary  JSONB,                   -- { resultCount, error, priceChanged, etc. }
    duration_ms       INT NOT NULL DEFAULT 0,
    error_message     TEXT,                    -- NULL = success
    user_id           UUID,
    search_id         UUID,                    -- FK to flight_searches (optional)
    created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_api_logs_provider ON api_logs(provider);
CREATE INDEX idx_api_logs_created_at ON api_logs(created_at DESC);
CREATE INDEX idx_api_logs_errors ON api_logs(created_at DESC) WHERE error_message IS NOT NULL;

-- RLS: server-side insert only, admin read
ALTER TABLE api_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role (server-side) to insert
CREATE POLICY "Service role can insert api_logs"
    ON api_logs FOR INSERT
    WITH CHECK (true);

-- Allow service role to select all
CREATE POLICY "Service role can read api_logs"
    ON api_logs FOR SELECT
    USING (true);
