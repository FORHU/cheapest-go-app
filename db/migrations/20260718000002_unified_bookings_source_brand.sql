-- migrate:up
ALTER TABLE unified_bookings ADD COLUMN IF NOT EXISTS source_brand text;

-- migrate:down
ALTER TABLE unified_bookings DROP COLUMN IF EXISTS source_brand;
