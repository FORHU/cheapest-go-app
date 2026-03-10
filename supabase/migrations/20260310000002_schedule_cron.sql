-- ============================================================================
-- Schedule Cache Refresh Cron
-- ============================================================================

-- 1. Enable pg_cron if not already enabled (managed by Supabase)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. Schedule the Edge Function call every 30 minutes
-- Note: Replace '<PROJECT_REF>' with actual project ref during deployment
-- For local/migration purposes, we define the structure.
-- Detailed scheduling is usually done via Supabase Dashboard or CLI, 
-- but we can record the intent here.

SELECT cron.schedule(
    'refresh-popular-flights-every-30-mins',
    '*/30 * * * *',
    $$
    SELECT
      net.http_post(
        url:='https://<PROJECT_REF>.supabase.co/functions/v1/refresh-popular-flights',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
      ) as request_id;
    $$
);
