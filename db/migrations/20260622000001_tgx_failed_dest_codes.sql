-- migrate:up
-- Persists TGX destination codes that return 0 MERCHANT results for OTV.
-- Loaded into _failedDestCodes on first use so every cold start skips
-- the 18-22s wasted round-trip for known-bad codes (e.g. Tokyo 504948).
CREATE TABLE IF NOT EXISTS public.tgx_failed_dest_codes (
    dest_code  text PRIMARY KEY,
    city_key   text NOT NULL DEFAULT '',
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- migrate:down
DROP TABLE IF EXISTS public.tgx_failed_dest_codes;
