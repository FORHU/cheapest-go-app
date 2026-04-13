-- ============================================================================
-- Migration: 20260410000000_add_supplier_cost_to_flight_bookings.sql
--
-- Adds financial audit columns to flight_bookings if they don't already exist.
-- This ensures we can track the raw cost (supplier_cost) vs selling price (charged_price).
-- ============================================================================

ALTER TABLE flight_bookings
    ADD COLUMN IF NOT EXISTS supplier_cost   NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS charged_price   NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS markup_pct      NUMERIC(6, 4)  DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS currency        TEXT           DEFAULT NULL;

COMMENT ON COLUMN flight_bookings.supplier_cost  IS 'Confirmed fare charged by the provider (Duffel balance / Mystifly deduction)';
COMMENT ON COLUMN flight_bookings.charged_price  IS 'Amount the customer was charged (Stripe capture amount)';
COMMENT ON COLUMN flight_bookings.markup_pct     IS 'Decimal markup rate applied at booking time';
COMMENT ON COLUMN flight_bookings.currency       IS 'ISO 4217 currency code';
