-- ============================================================================
-- Add baseline_price and last_refreshed_at to flight_deals
-- baseline_price = the reference "was" price for discount % calculation.
-- It is set once (from original_price) and stays fixed unless manually changed.
-- The cron job only updates: price, airline, discount_tag, ends_in, last_refreshed_at
-- ============================================================================

ALTER TABLE flight_deals
    ADD COLUMN IF NOT EXISTS baseline_price  DECIMAL(10, 2),
    ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ;

-- Seed baseline_price from existing original_price values
UPDATE flight_deals
SET baseline_price = original_price
WHERE baseline_price IS NULL AND original_price IS NOT NULL;

-- For rows where original_price is also null, default baseline to price * 1.3 (30% premium)
UPDATE flight_deals
SET baseline_price = ROUND(price * 1.3, 2)
WHERE baseline_price IS NULL;

-- Also fix city names → IATA codes (safe to run even if already fixed)
UPDATE flight_deals SET destination = 'NRT' WHERE destination ILIKE 'Tokyo';
UPDATE flight_deals SET destination = 'CDG' WHERE destination ILIKE 'Paris';
UPDATE flight_deals SET destination = 'DPS' WHERE destination ILIKE 'Bali';
UPDATE flight_deals SET origin      = UPPER(origin);
UPDATE flight_deals SET destination = UPPER(destination);

-- IATA format constraints (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'flight_deals_origin_iata'
    ) THEN
        ALTER TABLE flight_deals
            ADD CONSTRAINT flight_deals_origin_iata      CHECK (origin      ~ '^[A-Z]{3}$'),
            ADD CONSTRAINT flight_deals_destination_iata CHECK (destination ~ '^[A-Z]{3}$');
    END IF;
END $$;
