-- ============================================================================
-- Migration: 20260428000000_add_provider_to_bookings.sql
--
-- Adds provider tracking to the legacy hotel bookings table so TravelgateX
-- bookings can be distinguished from LiteAPI bookings at cancellation time.
-- ============================================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS provider          TEXT    NOT NULL DEFAULT 'liteapi',
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB   DEFAULT NULL;

COMMENT ON COLUMN bookings.provider          IS 'Booking provider: liteapi, travelgatex';
COMMENT ON COLUMN bookings.provider_metadata IS 'Provider-specific references (e.g. TGX supplier/hotel reference for cancellation)';
