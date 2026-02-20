-- Add cancellation_policy column to store prebook cancellation data as JSON
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_policy JSONB;
