-- Add missing raw_liteapi_response column to booking_policy_snapshots
-- This column was defined in 004_booking_policy_system.sql but may be absent
-- if the table was created via an older migration path.
ALTER TABLE booking_policy_snapshots
  ADD COLUMN IF NOT EXISTS raw_liteapi_response JSONB NOT NULL DEFAULT '{}';
