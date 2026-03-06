-- Add session_id to flight_bookings so the frontend can poll by session ID
-- to get the PNR after the Stripe webhook asynchronously creates the booking.
ALTER TABLE flight_bookings
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES booking_sessions(id) ON DELETE SET NULL;

-- Index for efficient polling queries
CREATE INDEX IF NOT EXISTS idx_flight_bookings_session_id
  ON flight_bookings(session_id)
  WHERE session_id IS NOT NULL;
