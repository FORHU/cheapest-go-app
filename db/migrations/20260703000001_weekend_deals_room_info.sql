-- migrate:up
-- Weekend deal hotel cards on the landing page (web + mobile) show sleeping
-- capacity and room counts, but weekend_flight_deals never stored them. Add
-- the columns so getLandingData() can surface them in the JSON the cards read.
-- Defaults reflect a typical curated stay (sleeps 2, 1 bedroom, 1 bathroom);
-- edit per-row for larger properties.
ALTER TABLE public.weekend_flight_deals
    ADD COLUMN IF NOT EXISTS guests    integer DEFAULT 2,
    ADD COLUMN IF NOT EXISTS bedrooms  integer DEFAULT 1,
    ADD COLUMN IF NOT EXISTS bathrooms integer DEFAULT 1;

-- migrate:down
ALTER TABLE public.weekend_flight_deals
    DROP COLUMN IF EXISTS guests,
    DROP COLUMN IF EXISTS bedrooms,
    DROP COLUMN IF EXISTS bathrooms;
