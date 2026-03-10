-- ============================================================================
-- Flights Search & Results Caching System
-- ============================================================================

-- ── Flight Searches Tracking ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.flight_searches (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        REFERENCES auth.users(id), -- Optional: allows anonymous searches
    origin          TEXT        NOT NULL,
    destination     TEXT        NOT NULL,
    departure_date  DATE        NOT NULL,
    return_date     DATE,
    adults          INT         NOT NULL DEFAULT 1,
    children        INT         NOT NULL DEFAULT 0,
    infants         INT         NOT NULL DEFAULT 0,
    cabin_class     TEXT        NOT NULL DEFAULT 'economy',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for frequent lookups
CREATE INDEX IF NOT EXISTS idx_flight_searches_user_id ON public.flight_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_flight_searches_route   ON public.flight_searches(origin, destination);
CREATE INDEX IF NOT EXISTS idx_flight_searches_date    ON public.flight_searches(departure_date);

-- Security
ALTER TABLE public.flight_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own searches"
    ON public.flight_searches FOR SELECT
    USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can insert own searches"
    ON public.flight_searches FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- ── Flight Results Cache ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.flight_results_cache (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    search_id       UUID        NOT NULL REFERENCES public.flight_searches(id) ON DELETE CASCADE,
    provider        TEXT        NOT NULL, -- 'duffel' or 'mystifly'
    offer_id        TEXT        NOT NULL,
    price           NUMERIC(12, 2) NOT NULL,
    currency        TEXT        NOT NULL DEFAULT 'USD',
    airline         TEXT        NOT NULL,
    departure_time  TIMESTAMPTZ NOT NULL,
    arrival_time    TIMESTAMPTZ NOT NULL,
    duration        INT         NOT NULL, -- In minutes
    raw             JSONB       NOT NULL, -- Full provider response for reference
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for sorting and filtering
CREATE INDEX IF NOT EXISTS idx_flight_results_search_id ON public.flight_results_cache(search_id);
CREATE INDEX IF NOT EXISTS idx_flight_results_price     ON public.flight_results_cache(price);
CREATE INDEX IF NOT EXISTS idx_flight_results_airline   ON public.flight_results_cache(airline);

-- Security
ALTER TABLE public.flight_results_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view results for their searches"
    ON public.flight_results_cache FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.flight_searches
            WHERE flight_searches.id = flight_results_cache.search_id
            AND (flight_searches.user_id = auth.uid() OR flight_searches.user_id IS NULL)
        )
    );
