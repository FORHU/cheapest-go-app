-- Drop existing restrictive provider check constraints
ALTER TABLE booking_sessions DROP CONSTRAINT IF EXISTS booking_sessions_provider_check;
ALTER TABLE flight_bookings DROP CONSTRAINT IF EXISTS flight_bookings_provider_check;

-- Add updated constraints that include mystifly_v2 and duffel
ALTER TABLE booking_sessions ADD CONSTRAINT booking_sessions_provider_check CHECK (provider IN ('amadeus', 'mystifly', 'mystifly_v2', 'duffel'));
ALTER TABLE flight_bookings ADD CONSTRAINT flight_bookings_provider_check CHECK (provider IN ('amadeus', 'mystifly', 'mystifly_v2', 'duffel'));
