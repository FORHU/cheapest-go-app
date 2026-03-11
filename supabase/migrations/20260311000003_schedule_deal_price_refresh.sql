-- ============================================================================
-- Schedule live deal price refresh every 6 hours
-- ============================================================================
-- Note: pg_cron must be enabled on your Supabase project.
-- Enable it in: Dashboard → Database → Extensions → pg_cron

-- Every 6 hours at minute 0 (00:00, 06:00, 12:00, 18:00 UTC)
SELECT cron.schedule(
    'refresh-deal-prices-every-6h',
    '0 */6 * * *',
    $$
    SELECT
      net.http_post(
        url:='https://bjhokdrgjyqhhccpuoaa.supabase.co/functions/v1/refresh-deal-prices',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqaG9rZHJnanlxaGhjY3B1b2FhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODg5MDI4OCwiZXhwIjoyMDg0NDY2Mjg4fQ.CNNPLs8GsF1KT-iYRRQ6vGcJuYH70bHAsfrpWaqzA3U"}'::jsonb,
        body:='{}'::jsonb
      ) as request_id;
    $$
);
