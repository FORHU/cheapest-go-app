-- ============================================================================
-- Cancellation state machine for flight_bookings
--
-- New states added:
--   cancel_requested  → Immediately set when user initiates cancellation
--                        (prevents duplicate requests while supplier call runs)
--   cancel_failed     → Supplier returned failure; no refund triggered
--   cancelled         → Supplier confirmed cancellation; refund pending
--   refund_pending    → Stripe refund initiated; awaiting confirmation
--   refunded          → Stripe refund confirmed
--
-- Forbidden transitions (enforced at application layer):
--   REFUNDED → anything
--   CANCELLED → CONFIRMED
--   DEPARTED → CANCEL_REQUESTED
-- ============================================================================

-- Update status CHECK constraint to include new cancellation states
ALTER TABLE flight_bookings
    DROP CONSTRAINT IF EXISTS flight_bookings_status_check;

ALTER TABLE flight_bookings
    ADD CONSTRAINT flight_bookings_status_check
    CHECK (status IN (
        'booked',
        'awaiting_ticket',
        'pnr_created',
        'ticketed',
        'cancelled',
        'failed',
        'cancel_requested',
        'cancel_failed',
        'refund_pending',
        'refunded'
    ));

-- Cancellation tracking columns
ALTER TABLE flight_bookings
    ADD COLUMN IF NOT EXISTS cancellation_requested_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancellation_completed_at  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS refund_amount               NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS refund_penalty_amount       NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS refund_currency             TEXT,
    ADD COLUMN IF NOT EXISTS cancellation_log            JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN flight_bookings.cancellation_requested_at IS
    'Set immediately on cancel request — prevents duplicate supplier calls.';
COMMENT ON COLUMN flight_bookings.cancellation_log IS
    'Append-only log of each state transition: [{at,oldStatus,newStatus,supplierResponse}]';
