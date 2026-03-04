-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: booking_state_machine
-- Adds payment_intent_id + ticket_time_limit columns and expands status
-- CHECK constraints to support the Mystifly manual capture state machine.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. booking_sessions ──────────────────────────────────────────────────────
-- Store the Stripe PaymentIntent ID so create-booking can capture or cancel it
ALTER TABLE booking_sessions
    ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
    ADD COLUMN IF NOT EXISTS capture_method    TEXT DEFAULT 'automatic';

-- Expand status CHECK to include new state machine values
ALTER TABLE booking_sessions
    DROP CONSTRAINT IF EXISTS booking_sessions_status_check;

ALTER TABLE booking_sessions
    ADD CONSTRAINT booking_sessions_status_check
        CHECK (status IN (
            'pending',            -- legacy alias for 'initiated'
            'initiated',          -- session created, awaiting payment auth
            'payment_authorized', -- card authorized (requires_capture for Mystifly)
            'processing',         -- create-booking claimed the session (atomic lock)
            'booked',             -- booking confirmed with provider
            'failed',             -- booking or payment failed
            'expired'             -- session TTL exceeded
        ));

-- ── 2. flight_bookings ───────────────────────────────────────────────────────
-- Store the PaymentIntent ID on the booking for capture/cancel/refund later
ALTER TABLE flight_bookings
    ADD COLUMN IF NOT EXISTS payment_intent_id TEXT,
    ADD COLUMN IF NOT EXISTS ticket_time_limit TIMESTAMPTZ; -- Mystifly TimeLimit field

-- Expand status CHECK to include pnr_created and awaiting_ticket
ALTER TABLE flight_bookings
    DROP CONSTRAINT IF EXISTS flight_bookings_status_check;

ALTER TABLE flight_bookings
    ADD CONSTRAINT flight_bookings_status_check
        CHECK (status IN (
            'booked',           -- legacy / Duffel: order created
            'pnr_created',      -- Mystifly: PNR received, payment captured, awaiting ticket
            'awaiting_ticket',  -- Mystifly: payment captured, ticket issuance pending
            'ticketed',         -- e-ticket issued
            'cancelled',        -- booking cancelled
            'failed'            -- booking failed (payment cancelled/refunded)
        ));

-- Index for efficient polling of awaiting_ticket bookings
CREATE INDEX IF NOT EXISTS idx_flight_bookings_awaiting_ticket
    ON flight_bookings (status, ticket_time_limit)
    WHERE status = 'awaiting_ticket';

CREATE INDEX IF NOT EXISTS idx_flight_bookings_payment_intent
    ON flight_bookings (payment_intent_id)
    WHERE payment_intent_id IS NOT NULL;
