-- ============================================================================
-- Bundle FK columns
-- Links flight bookings ↔ hotel bookings when booked as a bundle.
-- ============================================================================

-- flight_bookings: which hotel booking is this flight bundled with?
ALTER TABLE public.flight_bookings
    ADD COLUMN IF NOT EXISTS bundled_with_hotel_id TEXT;

-- bookings (hotel): which flight booking is this hotel bundled with?
ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS bundled_with_flight_id TEXT;

-- Indexes for admin bundle queries
CREATE INDEX IF NOT EXISTS idx_flight_bookings_bundle_hotel
    ON public.flight_bookings(bundled_with_hotel_id)
    WHERE bundled_with_hotel_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_bundle_flight
    ON public.bookings(bundled_with_flight_id)
    WHERE bundled_with_flight_id IS NOT NULL;
