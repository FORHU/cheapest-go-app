-- Migration: Add Cancellation states and Fare Policy snapshots to flight_bookings
-- Includes strict constraints to ensure refund integrity.

ALTER TABLE flight_bookings
  ADD COLUMN IF NOT EXISTS cancellation_requested_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_completed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_amount              NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS refund_penalty_amount      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS refund_currency            TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_log           JSONB DEFAULT '[]'::jsonb,
  -- Immutable pre-cancellation fare rules snapshot from checkout 
  ADD COLUMN IF NOT EXISTS fare_policy                JSONB,
  ADD COLUMN IF NOT EXISTS policy_snapshot_at         TIMESTAMPTZ DEFAULT NOW();

-- Expand the allowed statuses for flight_bookings
ALTER TABLE flight_bookings DROP CONSTRAINT IF EXISTS flight_bookings_status_check;
ALTER TABLE flight_bookings ADD CONSTRAINT flight_bookings_status_check
  CHECK (status IN (
    'booked', 'pnr_created', 'awaiting_ticket', 'ticketed', 'failed',
    'cancel_requested', 'cancel_failed', 'cancelled', 'refund_pending', 'refunded', 'refund_failed'
  ));

-- Constraint: Cannot be refunded if refund_amount is null
ALTER TABLE flight_bookings ADD CONSTRAINT refund_amount_required 
  CHECK (status != 'refunded' OR refund_amount IS NOT NULL);

-- Constraint: Financially active/post-confirmation states MUST have an immutable fare policy snapshot
ALTER TABLE flight_bookings ADD CONSTRAINT fare_policy_required_for_ticketed
  CHECK (
      status NOT IN (
          'ticketed', 'cancel_requested', 'cancel_failed', 'cancelled', 
          'refund_pending', 'refunded', 'refund_failed'
      ) OR fare_policy IS NOT NULL
  );
