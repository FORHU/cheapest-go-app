-- migrate:up
-- hotel_search_cache and tgx_destination_cache predate the dbmate migration
-- history, same situation as hotel_deals in 20260601000003_hotel_deals.sql:
-- they exist in the live database and are actively read/written by
-- src/lib/server/stays/travelgatex/search.ts and src/lib/server/search.ts,
-- but no migration ever created them. A fresh clone would fail hotel search
-- at runtime ("relation does not exist") without this.

CREATE TABLE IF NOT EXISTS public.hotel_search_cache (
    cache_key   text PRIMARY KEY,
    result      jsonb NOT NULL,
    created_at  timestamp with time zone NOT NULL DEFAULT now(),
    expires_at  timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hotel_search_cache_expires
    ON public.hotel_search_cache (expires_at);

CREATE TABLE IF NOT EXISTS public.tgx_destination_cache (
    city_key          text PRIMARY KEY,
    destination_code  text NOT NULL,
    created_at        timestamp with time zone DEFAULT now()
);

-- migrate:down
DROP TABLE IF EXISTS public.hotel_search_cache;
DROP TABLE IF EXISTS public.tgx_destination_cache;
