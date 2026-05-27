-- Delete flight searches (and cascaded results) older than 7 days.
-- Runs daily at 03:00 UTC. Keeps the flight_results_cache from bloating.

SELECT cron.schedule(
    'cleanup-old-flight-searches-daily',
    '0 3 * * *',
    $$
    DELETE FROM public.flight_searches
    WHERE created_at < NOW() - INTERVAL '7 days';
    $$
);
