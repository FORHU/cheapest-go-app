-- migrate:up
-- hotel_search_stats: tracks which cities users search so the sync cron
-- knows which destinations to keep fresh.
CREATE TABLE IF NOT EXISTS public.hotel_search_stats (
    city_key          text PRIMARY KEY,
    country_code      text NOT NULL DEFAULT '',
    search_count      integer NOT NULL DEFAULT 1,
    last_searched_at  timestamp with time zone NOT NULL DEFAULT now()
);

-- hotel_deals already exists with a different schema — add missing columns
-- and a unique constraint on hotel_code so the sync cron can upsert.
ALTER TABLE public.hotel_deals
    ADD COLUMN IF NOT EXISTS city_key          text,
    ADD COLUMN IF NOT EXISTS lat               numeric(9,6),
    ADD COLUMN IF NOT EXISTS lng               numeric(9,6),
    ADD COLUMN IF NOT EXISTS board_code        text,
    ADD COLUMN IF NOT EXISTS refundable        boolean,
    ADD COLUMN IF NOT EXISTS baseline_price    numeric(10,2),
    ADD COLUMN IF NOT EXISTS last_refreshed_at timestamp with time zone;

ALTER TABLE public.hotel_deals
    ADD CONSTRAINT hotel_deals_hotel_code_key UNIQUE (hotel_code);

-- migrate:down
-- No automated rollback; revert manually if needed.
