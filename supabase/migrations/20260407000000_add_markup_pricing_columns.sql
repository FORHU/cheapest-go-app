-- ============================================================================
-- Migration: 20260407000000_add_markup_pricing_columns.sql
--
-- Adds pricing audit columns to booking_sessions and flight_bookings so that
-- the platform margin can be tracked accurately for every transaction.
--
-- Rationale:
--   CheapestGo charges customers a marked-up fare while paying providers the
--   raw cost. Storing both values at booking time allows:
--     1. Finance reporting — actual margin per booking, not just total revenue
--     2. Dispute resolution — evidence of what was charged vs supplier cost
--     3. Refund accuracy — refund the marked-up price (what customer paid)
--
-- Markup rates (see src/lib/pricing.ts for full documentation):
--   Flights: 8%  — transparent market; must stay competitive vs Google Flights
--   Hotels:  15% — opaque market; aligns with OTA industry standard
-- ============================================================================

-- ── booking_sessions ────────────────────────────────────────────────────────
-- Captures pricing at the moment the PaymentIntent is created (before booking).

ALTER TABLE booking_sessions
    ADD COLUMN IF NOT EXISTS original_price  NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS charged_price   NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS markup_pct      NUMERIC(6, 4)  DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS currency        TEXT           DEFAULT NULL;

COMMENT ON COLUMN booking_sessions.original_price IS 'Raw provider fare — what we pay Duffel/Mystifly/hotel supplier';
COMMENT ON COLUMN booking_sessions.charged_price  IS 'Amount charged to the customer (original_price × (1 + markup_pct))';
COMMENT ON COLUMN booking_sessions.markup_pct     IS 'Decimal markup rate applied, e.g. 0.08 for 8%';
COMMENT ON COLUMN booking_sessions.currency       IS 'ISO 4217 currency code for original_price and charged_price';

-- ── flight_bookings ─────────────────────────────────────────────────────────
-- Captures the final confirmed pricing after the booking is completed.
-- total_price already exists and stores the confirmed fare from the provider.
-- We add supplier_cost (= total_price at confirmation) and markup columns.

ALTER TABLE flight_bookings
    ADD COLUMN IF NOT EXISTS supplier_cost   NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS charged_price   NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS markup_pct      NUMERIC(6, 4)  DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS currency        TEXT           DEFAULT NULL;

COMMENT ON COLUMN flight_bookings.supplier_cost  IS 'Confirmed fare charged by the provider (Duffel balance / Mystifly deduction)';
COMMENT ON COLUMN flight_bookings.charged_price  IS 'Amount the customer was charged (Stripe capture amount)';
COMMENT ON COLUMN flight_bookings.markup_pct     IS 'Decimal markup rate applied at booking time';
COMMENT ON COLUMN flight_bookings.currency       IS 'ISO 4217 currency code';
