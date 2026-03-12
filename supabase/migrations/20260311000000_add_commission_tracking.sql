-- Migration: 20260311000000_add_commission_tracking.sql
-- Description: Adds columns to track supplier cost, markup, and profit for unified_bookings

ALTER TABLE unified_bookings 
ADD COLUMN IF NOT EXISTS supplier_cost NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS markup_amount NUMERIC(12, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS profit NUMERIC(12, 2) DEFAULT 0;

-- Backfill profit for existing rows if markup/cost are 0 (assume total_price is final_price)
-- For existing rows, we might not have supplier_cost, so we can't accurately calculate profit.
-- Defaulting to 0 is safe.
