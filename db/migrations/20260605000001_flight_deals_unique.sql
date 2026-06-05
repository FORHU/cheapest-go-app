-- Add unique constraint so the sync-flight-deals cron can upsert by route + cabin.
-- Run this against DATABASE_URL before deploying sync-flight-deals.

ALTER TABLE flight_deals
    DROP CONSTRAINT IF EXISTS flight_deals_origin_dest_cabin_key;

ALTER TABLE flight_deals
    ADD CONSTRAINT flight_deals_origin_dest_cabin_key
    UNIQUE (origin, destination, cabin_class);

CREATE INDEX IF NOT EXISTS idx_flight_deals_updated_at
    ON flight_deals (updated_at DESC);
