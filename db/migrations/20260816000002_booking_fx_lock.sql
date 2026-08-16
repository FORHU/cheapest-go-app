-- migrate:up
-- Revenue is reported in USD at a rate locked when payment is taken.
-- See docs/adr/0008-fx-locked-at-booking-in-usd.md.
--
-- Until now nothing recorded the rate a booking was taken at, so no past figure
-- could be reproduced and get_revenue_stats fell back to assuming every booking
-- was USD or PHP — valuing a ₩500,000 booking as ₱500,000.
--
-- Three fields travel with every booking:
--   usd_amount      the gross, restated into USD, fixed forever
--   fx_rate         the rate used, as USD per 1 unit of the booking's currency
--                   (so usd_amount = total_price * fx_rate)
--   fx_captured_at  when that rate was read
--   fx_source       provenance, so estimated rows are visible as such
--
-- fx_rate is evidence, not a cache. It is never recalculated.

DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['unified_bookings', 'bookings', 'flight_bookings'] LOOP
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS usd_amount NUMERIC(14,4)', t);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS fx_rate NUMERIC(20,10)', t);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS fx_captured_at TIMESTAMPTZ', t);
        EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS fx_source TEXT', t);
        -- Reporting scans by date across these columns.
        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON %I (created_at) WHERE usd_amount IS NOT NULL',
            t || '_usd_amount_created_idx', t
        );
    END LOOP;
END $$;

COMMENT ON COLUMN unified_bookings.fx_rate IS
    'USD per 1 unit of this booking''s currency, captured when payment was taken. Never recalculated.';
COMMENT ON COLUMN unified_bookings.fx_source IS
    'live = rate provider at booking time; ecb-historical = backfilled at the true rate for the booking date; estimated = no historical source existed (VND/TWD/AED).';

-- A booking charged in USD needs no conversion; seed those so the backfill only
-- has to reach for a rate where one is genuinely required.
UPDATE unified_bookings SET usd_amount = total_price, fx_rate = 1, fx_captured_at = created_at, fx_source = 'identity'
    WHERE currency = 'USD' AND usd_amount IS NULL;
UPDATE bookings SET usd_amount = total_price, fx_rate = 1, fx_captured_at = created_at, fx_source = 'identity'
    WHERE currency = 'USD' AND usd_amount IS NULL;
UPDATE flight_bookings SET usd_amount = COALESCE(charged_price, total_price), fx_rate = 1, fx_captured_at = created_at, fx_source = 'identity'
    WHERE COALESCE(currency, 'USD') = 'USD' AND usd_amount IS NULL;

-- migrate:down
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['unified_bookings', 'bookings', 'flight_bookings'] LOOP
        EXECUTE format('DROP INDEX IF EXISTS %I', t || '_usd_amount_created_idx');
        EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS usd_amount', t);
        EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS fx_rate', t);
        EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS fx_captured_at', t);
        EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS fx_source', t);
    END LOOP;
END $$;
