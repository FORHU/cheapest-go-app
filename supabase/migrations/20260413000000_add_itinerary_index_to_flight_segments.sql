-- Add itinerary_index to flight_segments so we can distinguish outbound vs return hops
-- and compute accurate per-direction stop counts in the booking card.
ALTER TABLE flight_segments
    ADD COLUMN IF NOT EXISTS itinerary_index INTEGER NOT NULL DEFAULT 0;
