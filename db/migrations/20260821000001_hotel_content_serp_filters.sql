-- migrate:up
ALTER TABLE public.hotel_content
    ADD COLUMN IF NOT EXISTS serp_filters text[] DEFAULT '{}'::text[] NOT NULL;

CREATE INDEX IF NOT EXISTS hotel_content_serp_filters_gin
    ON public.hotel_content USING gin (serp_filters);
