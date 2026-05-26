-- Ensure financial audit columns exist on the bookings table.
-- Migration 20260413000000 added these but may not have executed on all envs.
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS supplier_cost  NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS charged_price  NUMERIC(12, 2) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS markup_pct     NUMERIC(6, 4)  DEFAULT NULL;
