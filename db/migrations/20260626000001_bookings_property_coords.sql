-- migrate:up
ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS property_lat double precision DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS property_lng double precision DEFAULT 0 NOT NULL;

-- migrate:down
ALTER TABLE public.bookings
    DROP COLUMN IF EXISTS property_lat,
    DROP COLUMN IF EXISTS property_lng;
