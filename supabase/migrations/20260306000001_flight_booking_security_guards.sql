-- Migration: Add Security Guards for Flight Booking and Cancellation
-- Implements expiry, idempotency, and supplier reconciliation metadata.

-- 1. Session Expiry
ALTER TABLE booking_sessions
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + interval '15 minutes');

-- 2. Financial Reconciliation & Traceability
ALTER TABLE flight_bookings
  ADD COLUMN IF NOT EXISTS supplier_cancellation_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_currency         TEXT,
  ADD COLUMN IF NOT EXISTS supplier_currency        TEXT,
  ADD COLUMN IF NOT EXISTS fx_rate_snapshot         NUMERIC;

-- 3. Expand the allowed statuses to include the new 'ticketing' state.
--    This prevents cancellations mid-issuance by suppliers like Mystifly.
ALTER TABLE flight_bookings DROP CONSTRAINT IF EXISTS flight_bookings_status_check;
ALTER TABLE flight_bookings ADD CONSTRAINT flight_bookings_status_check
  CHECK (status IN (
    'booked', 'pnr_created', 'awaiting_ticket', 'ticketing', 'ticketed', 'failed',
    'cancel_requested', 'cancel_failed', 'cancelled', 'refund_pending', 'refunded', 'refund_failed'
  ));
