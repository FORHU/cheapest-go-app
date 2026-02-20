-- ============================================================================
-- Booking sessions — temporary storage for passenger + flight data
-- before the real booking is confirmed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS booking_sessions (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL,

    -- Provider info
    provider        TEXT        NOT NULL CHECK (provider IN ('amadeus', 'mystifly')),

    -- Selected flight snapshot (full NormalizedFlight object)
    flight          JSONB       NOT NULL DEFAULT '{}',

    -- Passenger details
    passengers      JSONB       NOT NULL DEFAULT '[]',

    -- Contact info
    contact         JSONB       NOT NULL DEFAULT '{}',

    -- Session lifecycle
    status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'booked', 'expired')),

    -- Expiry (30 minutes from creation)
    expires_at      TIMESTAMPTZ NOT NULL,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_booking_sessions_user_id    ON booking_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_booking_sessions_status     ON booking_sessions(status);
CREATE INDEX IF NOT EXISTS idx_booking_sessions_expires_at ON booking_sessions(expires_at);

-- ── Row Level Security ───────────────────────────────────────────────

ALTER TABLE booking_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own booking sessions"
    ON booking_sessions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own booking sessions"
    ON booking_sessions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own booking sessions"
    ON booking_sessions FOR UPDATE
    USING (auth.uid() = user_id);

-- ── Auto-update updated_at trigger ───────────────────────────────────

CREATE OR REPLACE FUNCTION update_booking_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_booking_sessions_updated_at
    BEFORE UPDATE ON booking_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_booking_sessions_updated_at();
