-- migrate:up
-- Track when hotel_content.room_groups was last seeded from ETG (WorldOTA).
-- Used by the seed-room-groups cron to skip fresh rows and refresh stale ones.
ALTER TABLE hotel_content
    ADD COLUMN IF NOT EXISTS room_groups_seeded_at TIMESTAMPTZ;

-- Backfill: rows already seeded (non-empty room_groups) get a past timestamp
-- so they're not immediately refreshed on the first cron run.
UPDATE hotel_content
SET room_groups_seeded_at = NOW()
WHERE room_groups IS NOT NULL
  AND room_groups != '[]'::jsonb;

-- migrate:down
ALTER TABLE hotel_content
    DROP COLUMN IF EXISTS room_groups_seeded_at;
