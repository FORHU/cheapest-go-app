-- Add missing columns to flight_results_cache
ALTER TABLE public.flight_results_cache 
ADD COLUMN IF NOT EXISTS stops INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_seats INT;

-- Update indexes to include stops if useful, but not strictly necessary for now.
