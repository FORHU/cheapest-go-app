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
        url:='https://bjhokdrgjyqhhccpuoaa.supabase.co/functions/v1/refresh-popular-flights',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqaG9rZHJnanlxaGhjY3B1b2FhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODg5MDI4OCwiZXhwIjoyMDg0NDY2Mjg4fQ.CNNPLs8GsF1KT-iYRRQ6vGcJuYH70bHAsfrpWaqzA3U"}'::jsonb
      ) as request_id;
    $$
);

-- ============================================================================
-- Schedule Poll Pending Tickets Cron (Mystifly awaiting_ticket → ticketed)
-- ============================================================================
-- Runs every 5 minutes to check Mystifly for ticket issuance on pending bookings.

SELECT cron.schedule(
    'poll-pending-tickets-every-5-mins',
    '*/5 * * * *',
    $$
    SELECT
      net.http_post(
        url:='https://bjhokdrgjyqhhccpuoaa.supabase.co/functions/v1/poll-pending-tickets',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqaG9rZHJnanlxaGhjY3B1b2FhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODg5MDI4OCwiZXhwIjoyMDg0NDY2Mjg4fQ.CNNPLs8GsF1KT-iYRRQ6vGcJuYH70bHAsfrpWaqzA3U"}'::jsonb
      ) as request_id;
    $$
);
