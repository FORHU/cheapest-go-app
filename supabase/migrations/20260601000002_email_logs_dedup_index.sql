-- Migration: 20260601000002_email_logs_dedup_index.sql
-- Prevent duplicate emails for the same booking + type.
-- A customer must never receive two "confirmation" or two "refund" emails
-- for the same booking — which can happen when both the Stripe webhook and
-- the /confirm endpoint fire concurrently.
--
-- Scope: only deduplicate sent/queued records (failed entries can be retried).
-- NULL booking_id (price alerts) is excluded — those have no booking to key on.

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_booking_type_dedup
    ON email_logs (booking_id, email_type)
    WHERE booking_id IS NOT NULL
      AND status IN ('sent', 'queued');
