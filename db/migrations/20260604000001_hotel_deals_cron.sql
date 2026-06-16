-- migrate:up
-- Migration: add currency + updated_at to weekend_flight_deals,
-- plus a unique constraint so the cron job can upsert by name+location.

-- 1. New columns
ALTER TABLE weekend_flight_deals
    ADD COLUMN IF NOT EXISTS currency    varchar(3)   NOT NULL DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS updated_at  timestamptz  NOT NULL DEFAULT now();

-- 2. Back-fill updated_at for any existing rows
UPDATE weekend_flight_deals
SET updated_at = created_at
WHERE updated_at = now()           -- only rows we just defaulted
  AND created_at IS NOT NULL;

-- 3. Unique constraint so the cron can upsert without duplicating hotels
ALTER TABLE weekend_flight_deals
    DROP CONSTRAINT IF EXISTS weekend_flight_deals_name_location_key;

ALTER TABLE weekend_flight_deals
    ADD CONSTRAINT weekend_flight_deals_name_location_key
    UNIQUE (name, location);

-- 4. Index to speed up the landing page query (ordered by updated_at DESC)
CREATE INDEX IF NOT EXISTS idx_weekend_flight_deals_updated_at
    ON weekend_flight_deals (updated_at DESC);

-- migrate:down
-- No automated rollback; revert manually if needed.
