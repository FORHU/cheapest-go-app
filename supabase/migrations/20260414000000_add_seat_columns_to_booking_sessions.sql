-- Add seat selection columns to booking_sessions
-- Stores Duffel seat service IDs and total seat cost for orders created with seat selections.

ALTER TABLE booking_sessions
    ADD COLUMN IF NOT EXISTS seat_service_ids text[] DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS seat_total numeric DEFAULT 0;
