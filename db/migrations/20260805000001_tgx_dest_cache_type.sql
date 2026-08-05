-- migrate:up
ALTER TABLE public.tgx_destination_cache
    ADD COLUMN IF NOT EXISTS dest_type   text DEFAULT 'CITY',
    ADD COLUMN IF NOT EXISTS parent_code text;

-- migrate:down
ALTER TABLE public.tgx_destination_cache
    DROP COLUMN IF EXISTS dest_type,
    DROP COLUMN IF EXISTS parent_code;
