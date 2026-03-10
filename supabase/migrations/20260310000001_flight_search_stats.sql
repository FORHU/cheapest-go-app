-- ============================================================================
-- Flight Search Analytics & Demand Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.flight_search_stats (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    origin          TEXT        NOT NULL,
    destination     TEXT        NOT NULL,
    min_price       NUMERIC(12, 2),
    avg_price       NUMERIC(12, 2),
    search_count    INT         DEFAULT 1,
    last_searched_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique stats per route
    UNIQUE(origin, destination)
);

-- Index for surfacing popular routes
CREATE INDEX IF NOT EXISTS idx_flight_search_stats_popularity ON public.flight_search_stats(search_count DESC);
CREATE INDEX IF NOT EXISTS idx_flight_search_stats_route      ON public.flight_search_stats(origin, destination);

-- Security (Admin only or system level)
ALTER TABLE public.flight_search_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of stats"
    ON public.flight_search_stats FOR SELECT
    USING (true);

-- Functions for atomic updates
CREATE OR REPLACE FUNCTION public.increment_search_stats(
    p_origin TEXT, 
    p_destination TEXT, 
    p_min_price NUMERIC, 
    p_avg_price NUMERIC
) RETURNS VOID AS $$
BEGIN
    INSERT INTO public.flight_search_stats (origin, destination, min_price, avg_price, search_count, last_searched_at)
    VALUES (p_origin, p_destination, p_min_price, p_avg_price, 1, NOW())
    ON CONFLICT (origin, destination) DO UPDATE SET
        search_count = public.flight_search_stats.search_count + 1,
        min_price = LEAST(public.flight_search_stats.min_price, EXCLUDED.min_price),
        avg_price = (public.flight_search_stats.avg_price + EXCLUDED.avg_price) / 2,
        last_searched_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
