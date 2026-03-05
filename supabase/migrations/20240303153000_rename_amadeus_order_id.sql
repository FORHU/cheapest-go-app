-- Migration to rename amadeus_order_id to provider_order_id and remove 'amadeus' from provider constraints.

-- 1. Rename the column in flight_bookings
ALTER TABLE public.flight_bookings RENAME COLUMN amadeus_order_id TO provider_order_id;

-- 2. Update the CHECK constraint on flight_bookings.provider
-- First, drop the old constraint
ALTER TABLE public.flight_bookings DROP CONSTRAINT IF EXISTS flight_bookings_provider_check;
-- Then, add the new constraint without 'amadeus'
ALTER TABLE public.flight_bookings ADD CONSTRAINT flight_bookings_provider_check CHECK (provider IN ('mystifly', 'mystifly_v2', 'duffel'));

-- 3. Update the CHECK constraint on booking_sessions.provider
-- First, drop the old constraint
ALTER TABLE public.booking_sessions DROP CONSTRAINT IF EXISTS booking_sessions_provider_check;
-- Then, add the new constraint without 'amadeus'
ALTER TABLE public.booking_sessions ADD CONSTRAINT booking_sessions_provider_check CHECK (provider IN ('mystifly', 'mystifly_v2', 'duffel'));

-- (Optional but recommended) For consistency, do the same for unified_bookings if it exists.
-- It originally didn't have a CHECK constraint in 006, but it's good practice.
-- We won't strictly enforce it here to avoid breaking if the table schema differs slightly. 
