-- migrate:up
-- Add metapolicy columns required by RateHawk API Addendum §10(b)
ALTER TABLE public.hotel_content
    ADD COLUMN IF NOT EXISTS metapolicy_struct      jsonb,
    ADD COLUMN IF NOT EXISTS metapolicy_extra_info  text;

-- migrate:down
ALTER TABLE public.hotel_content
    DROP COLUMN IF EXISTS metapolicy_struct,
    DROP COLUMN IF EXISTS metapolicy_extra_info;
