-- ============================================================================
-- Unified bookings table supporting both flights and hotels
-- ============================================================================

CREATE TABLE IF NOT EXISTS unified_bookings (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL,

    -- Booking classification
    type            TEXT        NOT NULL CHECK (type IN ('flight', 'hotel')),
    provider        TEXT        NOT NULL,       -- e.g. amadeus, mystifly, liteapi, mock
    external_id     TEXT,                       -- Provider-specific booking ID (PNR, LiteAPI bookingId, etc.)

    -- Status lifecycle
    status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN (
                                    'pending', 'confirmed', 'ticketed', 'cancelled',
                                    'refunded', 'failed', 'expired'
                                )),

    -- Pricing
    total_price     NUMERIC(12, 2) NOT NULL,
    currency        TEXT        NOT NULL DEFAULT 'USD',

    -- Flexible metadata (flight segments, hotel rooms, passenger info, etc.)
    metadata        JSONB       NOT NULL DEFAULT '{}',

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_unified_bookings_user_id   ON unified_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_unified_bookings_type      ON unified_bookings(type);
CREATE INDEX IF NOT EXISTS idx_unified_bookings_status    ON unified_bookings(status);
CREATE INDEX IF NOT EXISTS idx_unified_bookings_provider  ON unified_bookings(provider);
CREATE INDEX IF NOT EXISTS idx_unified_bookings_created   ON unified_bookings(created_at DESC);

-- GIN index for JSONB metadata queries (e.g. searching by PNR inside metadata)
CREATE INDEX IF NOT EXISTS idx_unified_bookings_metadata  ON unified_bookings USING GIN (metadata);

-- ── Row Level Security ───────────────────────────────────────────────

ALTER TABLE unified_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own unified bookings"
    ON unified_bookings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own unified bookings"
    ON unified_bookings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own unified bookings"
    ON unified_bookings FOR UPDATE
    USING (auth.uid() = user_id);

-- ── Auto-update updated_at trigger ───────────────────────────────────

CREATE OR REPLACE FUNCTION update_unified_bookings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_unified_bookings_updated_at
    BEFORE UPDATE ON unified_bookings
    FOR EACH ROW
    EXECUTE FUNCTION update_unified_bookings_updated_at();
