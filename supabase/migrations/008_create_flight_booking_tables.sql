-- ============================================================================
-- Flight booking system — bookings, flight_segments, passengers
-- ============================================================================

-- ── Bookings ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flight_bookings (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL,
    pnr             TEXT        NOT NULL,
    provider        TEXT        NOT NULL CHECK (provider IN ('amadeus', 'mystifly')),
    total_price     NUMERIC(12, 2) NOT NULL,
    status          TEXT        NOT NULL DEFAULT 'booked'
                                CHECK (status IN ('booked', 'ticketed', 'cancelled', 'failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flight_bookings_user_id ON flight_bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_flight_bookings_pnr     ON flight_bookings(pnr);
CREATE INDEX IF NOT EXISTS idx_flight_bookings_status  ON flight_bookings(status);

ALTER TABLE flight_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flight bookings"
    ON flight_bookings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own flight bookings"
    ON flight_bookings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own flight bookings"
    ON flight_bookings FOR UPDATE
    USING (auth.uid() = user_id);

-- ── Flight Segments ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS flight_segments (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id      UUID        NOT NULL REFERENCES flight_bookings(id) ON DELETE CASCADE,
    airline         TEXT        NOT NULL,
    flight_number   TEXT        NOT NULL,
    origin          TEXT        NOT NULL,
    destination     TEXT        NOT NULL,
    departure       TIMESTAMPTZ NOT NULL,
    arrival         TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flight_segments_booking_id ON flight_segments(booking_id);

ALTER TABLE flight_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own flight segments"
    ON flight_segments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM flight_bookings
            WHERE flight_bookings.id = flight_segments.booking_id
            AND flight_bookings.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own flight segments"
    ON flight_segments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM flight_bookings
            WHERE flight_bookings.id = flight_segments.booking_id
            AND flight_bookings.user_id = auth.uid()
        )
    );

-- ── Passengers ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS passengers (
    id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    booking_id      UUID        NOT NULL REFERENCES flight_bookings(id) ON DELETE CASCADE,
    first_name      TEXT        NOT NULL,
    last_name       TEXT        NOT NULL,
    type            TEXT        NOT NULL CHECK (type IN ('ADT', 'CHD', 'INF')),
    passport        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passengers_booking_id ON passengers(booking_id);

ALTER TABLE passengers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own passengers"
    ON passengers FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM flight_bookings
            WHERE flight_bookings.id = passengers.booking_id
            AND flight_bookings.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert own passengers"
    ON passengers FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM flight_bookings
            WHERE flight_bookings.id = passengers.booking_id
            AND flight_bookings.user_id = auth.uid()
        )
    );
