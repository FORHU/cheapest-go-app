-- Create place_cache table
CREATE TABLE IF NOT EXISTS public.place_cache (
    place_id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    cached_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE public.place_cache ENABLE ROW LEVEL SECURITY;

-- Optional: Create a bucket for place photos if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('place-photos', 'place-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to place-photos bucket
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
TO public
USING ( bucket_id = 'place-photos' );
