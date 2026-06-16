-- migrate:up
-- Add unique constraint so the sync-flight-deals cron can upsert by route.
ALTER TABLE public.flight_deals
    ADD CONSTRAINT flight_deals_origin_destination_cabin_class_key
    UNIQUE (origin, destination, cabin_class);

-- migrate:down
-- No automated rollback; revert manually if needed.
