-- migrate:up
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source_brand text;
ALTER TABLE flight_bookings ADD COLUMN IF NOT EXISTS source_brand text;

-- migrate:down
ALTER TABLE bookings DROP COLUMN IF EXISTS source_brand;
ALTER TABLE flight_bookings DROP COLUMN IF EXISTS source_brand;
