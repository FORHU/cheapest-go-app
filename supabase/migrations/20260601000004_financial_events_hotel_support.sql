-- Migration: 20260601000004_financial_events_hotel_support.sql
-- The original booking_financial_events table had:
--   booking_id UUID NOT NULL REFERENCES flight_bookings(id)
-- Hotel bookings live in the `bookings` table with a TEXT primary key,
-- so hotel financial events could never be inserted without a FK violation.
--
-- Fix: make booking_id nullable (flight events) and add hotel_booking_id TEXT
-- (hotel events). A CHECK constraint enforces exactly one is always set.

-- 1. Drop the NOT NULL constraint and FK on booking_id
ALTER TABLE booking_financial_events
    ALTER COLUMN booking_id DROP NOT NULL;

ALTER TABLE booking_financial_events
    DROP CONSTRAINT IF EXISTS booking_financial_events_booking_id_fkey;

-- Re-add as a nullable FK so existing flight event rows keep referential integrity
ALTER TABLE booking_financial_events
    ADD CONSTRAINT booking_financial_events_flight_booking_fkey
    FOREIGN KEY (booking_id) REFERENCES flight_bookings(id) ON DELETE CASCADE;

-- 2. Add hotel_booking_id column (TEXT, matches bookings.booking_id)
ALTER TABLE booking_financial_events
    ADD COLUMN IF NOT EXISTS hotel_booking_id TEXT
        REFERENCES bookings(booking_id) ON DELETE CASCADE;

-- 3. Exactly one of the two IDs must be non-null on every row
ALTER TABLE booking_financial_events
    ADD CONSTRAINT booking_financial_events_one_booking_id CHECK (
        (booking_id IS NOT NULL AND hotel_booking_id IS NULL) OR
        (booking_id IS NULL AND hotel_booking_id IS NOT NULL)
    );

-- 4. Index for hotel lookups
CREATE INDEX IF NOT EXISTS idx_booking_financial_events_hotel_booking_id
    ON booking_financial_events(hotel_booking_id);

-- 5. Extend event_type to cover cancellation fees
ALTER TABLE booking_financial_events
    DROP CONSTRAINT IF EXISTS booking_financial_events_event_type_check;

ALTER TABLE booking_financial_events
    ADD CONSTRAINT booking_financial_events_event_type_check
    CHECK (event_type IN ('payment', 'refund', 'cancellation_fee', 'supplier_reconciliation'));
