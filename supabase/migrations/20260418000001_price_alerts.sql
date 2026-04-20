-- ============================================================================
-- Price Alerts
-- Stores per-user alerts for a flight route. A daily cron checks live prices
-- and emails the user when the fare drops below their last-seen price.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.price_alerts (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT        NOT NULL,
    origin          TEXT        NOT NULL CHECK (origin ~ '^[A-Z]{3}$'),
    destination     TEXT        NOT NULL CHECK (destination ~ '^[A-Z]{3}$'),
    cabin_class     TEXT        NOT NULL DEFAULT 'economy'
                                CHECK (cabin_class IN ('economy','premium_economy','business','first')),
    adults          INT         NOT NULL DEFAULT 1 CHECK (adults BETWEEN 1 AND 9),
    current_price   NUMERIC(12,2),          -- last checked price (NULL = never checked)
    currency        TEXT        NOT NULL DEFAULT 'USD',
    target_price    NUMERIC(12,2),          -- optional user-set threshold; NULL = any drop
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    last_checked_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user      ON public.price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active    ON public.price_alerts(is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_price_alerts_route     ON public.price_alerts(origin, destination);

-- RLS
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own alerts"
    ON public.price_alerts
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Service role can read all (used by cron)
CREATE POLICY "Service role full access"
    ON public.price_alerts
    TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);
