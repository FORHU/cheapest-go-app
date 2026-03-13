-- ============================================================================
-- Enforce IATA code format on flight_deals
-- Prevents future cron jobs / inserts from storing city names instead of codes
-- ============================================================================

-- 1. Fix any existing non-IATA values (run this first if you have city names)
UPDATE flight_deals SET destination = 'NRT' WHERE destination ILIKE 'Tokyo';
UPDATE flight_deals SET destination = 'CDG' WHERE destination ILIKE 'Paris';
UPDATE flight_deals SET destination = 'DPS' WHERE destination ILIKE 'Bali';
UPDATE flight_deals SET origin = upper(origin);
UPDATE flight_deals SET destination = upper(destination);

-- 2. Add CHECK constraints so future inserts/updates MUST use IATA codes
ALTER TABLE flight_deals
    ADD CONSTRAINT flight_deals_origin_iata
        CHECK (origin ~ '^[A-Z]{3}$'),
    ADD CONSTRAINT flight_deals_destination_iata
        CHECK (destination ~ '^[A-Z]{3}$');

-- 3. Same guard on weekend_flight_deals if it stores flight routes in future
-- (currently it stores hotel/property data so no IATA constraint needed there)

-- Verify
SELECT id, origin, destination, airline FROM flight_deals;
