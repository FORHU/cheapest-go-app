-- Flight booking notes — mirrors what is sent to Mystifly BookingNotes API
CREATE TABLE IF NOT EXISTS flight_booking_notes (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id  UUID        NOT NULL REFERENCES flight_bookings(id) ON DELETE CASCADE,
    note        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID        REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_flight_booking_notes_booking_id ON flight_booking_notes(booking_id);

ALTER TABLE flight_booking_notes ENABLE ROW LEVEL SECURITY;

-- Users can read notes on their own bookings
CREATE POLICY "Users can view own booking notes"
    ON flight_booking_notes FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM flight_bookings
            WHERE flight_bookings.id = flight_booking_notes.booking_id
            AND flight_bookings.user_id = auth.uid()
        )
    );

-- Users can insert notes on their own bookings
CREATE POLICY "Users can insert own booking notes"
    ON flight_booking_notes FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM flight_bookings
            WHERE flight_bookings.id = flight_booking_notes.booking_id
            AND flight_bookings.user_id = auth.uid()
        )
    );
