-- ============================================================================
-- Migration: 20260413000000_add_financial_audit_to_hotels.sql
--
-- Adds financial audit columns to unified_bookings and legacy bookings (hotels).
-- This fulfills the requirement to "store actual supplier cost at booking time"
-- for future transactions, while allowing estimated lookups for past ones.
-- ============================================================================

-- ── unified_bookings ────────────────────────────────────────────────────────
-- Currently used for new hotel and flight bookings.
ALTER TABLE unified_bookings
    ADD COLUMN IF NOT EXISTS supplier_cost   NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS charged_price   NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS markup_pct      NUMERIC(6, 4)  DEFAULT NULL;

COMMENT ON COLUMN unified_bookings.supplier_cost  IS 'Confirmed cost charged by the provider (LiteAPI/Mystifly/Duffel)';
COMMENT ON COLUMN unified_bookings.charged_price  IS 'Amount the customer was charged (Stripe capture amount)';
COMMENT ON COLUMN unified_bookings.markup_pct     IS 'Decimal markup rate applied at booking time';

-- ── bookings (Legacy Hotels) ────────────────────────────────────────────────
-- Used for older hotel-only bookings.
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS supplier_cost   NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS charged_price   NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS markup_pct      NUMERIC(6, 4)  DEFAULT NULL;

COMMENT ON COLUMN bookings.supplier_cost  IS 'Confirmed cost charged by the provider';
COMMENT ON COLUMN bookings.charged_price  IS 'Amount the customer was charged';
COMMENT ON COLUMN bookings.markup_pct     IS 'Decimal markup rate applied at booking time';
