-- ============================================================================
-- Saved Trips / Wishlist
-- Users can save flight offers and hotel cards for later.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saved_trips (
    id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type         TEXT        NOT NULL CHECK (type IN ('flight', 'hotel')),
    -- Human-readable summary
    title        TEXT        NOT NULL,   -- e.g. "MNL → SIN · May 10"
    subtitle     TEXT,                   -- e.g. "Duffel Airways · 7h 30m · Nonstop"
    price        NUMERIC(12,2),
    currency     TEXT        NOT NULL DEFAULT 'USD',
    image_url    TEXT,                   -- hotel thumbnail or airline logo URL
    -- Deep-link back to the search/offer
    deep_link    TEXT        NOT NULL,   -- full relative URL to re-open the offer
    -- Raw offer snapshot (for display)
    snapshot     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_trips_user    ON public.saved_trips(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_trips_type    ON public.saved_trips(user_id, type);

ALTER TABLE public.saved_trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own saved trips"
    ON public.saved_trips
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
