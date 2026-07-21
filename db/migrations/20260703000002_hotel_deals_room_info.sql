-- migrate:up
-- The mobile landing "Trending near you" cards now source from hotel_deals (real
-- TravelgateX/ETG properties, so photos resolve via /api/hotel-photo?hotelCode=).
-- Those cards also show sleeping capacity and room counts, which hotel_deals never
-- stored. Add the columns so getHotelDeals() can surface them, mirroring the earlier
-- weekend_flight_deals change. Defaults reflect a typical stay (sleeps 2, 1 bedroom,
-- 1 bathroom); the deal-sync cron / per-row edits can set real values later.
ALTER TABLE public.hotel_deals
    ADD COLUMN IF NOT EXISTS guests    integer DEFAULT 2,
    ADD COLUMN IF NOT EXISTS bedrooms  integer DEFAULT 1,
    ADD COLUMN IF NOT EXISTS bathrooms integer DEFAULT 1;

-- migrate:down
ALTER TABLE public.hotel_deals
    DROP COLUMN IF EXISTS guests,
    DROP COLUMN IF EXISTS bedrooms,
    DROP COLUMN IF EXISTS bathrooms;
