-- Tracks which cities users are actually searching hotels in.
-- Used by the warm-hotel-cache cron to pre-warm the most in-demand cities,
-- making the cache demand-driven rather than hardcoded.

CREATE TABLE IF NOT EXISTS hotel_search_stats (
    city_key         TEXT        NOT NULL,
    country_code     TEXT        NOT NULL DEFAULT '',
    search_count     INTEGER     NOT NULL DEFAULT 1,
    last_searched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (city_key)
);

CREATE INDEX IF NOT EXISTS idx_hotel_search_stats_count
    ON hotel_search_stats (search_count DESC, last_searched_at DESC);
