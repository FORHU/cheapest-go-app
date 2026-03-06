-- Migration: Add Fare Policy to Booking Sessions
-- Ensures we temporarily store the exact JSON snapshot of the fare rules before payment.

ALTER TABLE booking_sessions
  ADD COLUMN IF NOT EXISTS fare_policy              JSONB;
  -- Structure: { isRefundable, isChangeable, refundPenaltyAmount, refundPenaltyCurrency, policySource, policyVersion }

ALTER TABLE booking_sessions
  ADD COLUMN IF NOT EXISTS policy_source            TEXT,
  ADD COLUMN IF NOT EXISTS policy_version           TEXT,
  ADD COLUMN IF NOT EXISTS policy_locked            BOOLEAN DEFAULT FALSE;
  -- policy_locked = FALSE at search, TRUE after successful revalidation
  -- Block payment and booking completion if policy_locked = FALSE

-- The booking_sessions table is temporary. After successful payment and booking creation, 
-- the final `fare_policy` JSONB snapshot MUST be copied immutably into `flight_bookings`.
