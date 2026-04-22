-- Add refundable column to flight_results_cache so the UI tag survives cache reads.
-- Previously only stored in the raw JSON blob, which caused the tag to always show
-- "non-refundable" for cached results (raw.refundable doesn't exist on the raw itinerary).

ALTER TABLE public.flight_results_cache
    ADD COLUMN IF NOT EXISTS refundable BOOLEAN NOT NULL DEFAULT FALSE;
