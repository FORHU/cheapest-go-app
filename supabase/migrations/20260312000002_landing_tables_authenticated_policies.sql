-- ============================================================================
-- Add RLS policies for the `authenticated` role on all landing page tables.
-- The original policies only allowed `anon`, so logged-in users saw empty
-- sections because their Supabase client uses the `authenticated` role.
-- ============================================================================

DO $$ BEGIN
    -- flight_deals
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'flight_deals' AND policyname = 'Authenticated read access for flight_deals') THEN
        CREATE POLICY "Authenticated read access for flight_deals" ON flight_deals FOR SELECT TO authenticated USING (true);
    END IF;

    -- weekend_flight_deals
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'weekend_flight_deals' AND policyname = 'Authenticated read access for weekend_flight_deals') THEN
        CREATE POLICY "Authenticated read access for weekend_flight_deals" ON weekend_flight_deals FOR SELECT TO authenticated USING (true);
    END IF;

    -- popular_destinations
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'popular_destinations' AND policyname = 'Authenticated read access for popular_destinations') THEN
        CREATE POLICY "Authenticated read access for popular_destinations" ON popular_destinations FOR SELECT TO authenticated USING (true);
    END IF;

    -- unique_stays
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unique_stays' AND policyname = 'Authenticated read access for unique_stays') THEN
        CREATE POLICY "Authenticated read access for unique_stays" ON unique_stays FOR SELECT TO authenticated USING (true);
    END IF;

    -- travel_styles
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'travel_styles' AND policyname = 'Authenticated read access for travel_styles') THEN
        CREATE POLICY "Authenticated read access for travel_styles" ON travel_styles FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
