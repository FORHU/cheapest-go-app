-- migrate:up
-- Remove leftover Supabase-era Row Level Security. The app's actual security
-- model is API-layer session validation (every route checks the session
-- before querying) — RLS was never part of the design here, and 41 tables
-- still had it ENABLEd with mostly no policies (default-deny) plus 2 tables
-- with explicit always-deny policies (device_push_tokens, search_results_cache).
-- This was masked only because the app's DB role has BYPASSRLS; a future
-- least-privilege production role would not.

-- ── Drop legacy policies first (some exist on tables without RLS enabled,
--    e.g. hotel_deals — drop them too for cleanliness) ──────────────────
DROP POLICY IF EXISTS "Service role full access" ON public.admin_settings;
DROP POLICY IF EXISTS "Service role can insert api_logs" ON public.api_logs;
DROP POLICY IF EXISTS "Service role can read api_logs" ON public.api_logs;
DROP POLICY IF EXISTS "dest_code_cache_public_read" ON public.dest_code_cache;
DROP POLICY IF EXISTS "service role only" ON public.device_push_tokens;
DROP POLICY IF EXISTS "Anyone can insert search results" ON public.flight_results_cache;
DROP POLICY IF EXISTS "Allow public read of stats" ON public.flight_search_stats;
DROP POLICY IF EXISTS "hotel_content_public_read" ON public.hotel_content;
DROP POLICY IF EXISTS "hotel_deals_public_read" ON public.hotel_deals;
DROP POLICY IF EXISTS "hotel_review_items_public_read" ON public.hotel_review_items;
DROP POLICY IF EXISTS "hotel_reviews_public_read" ON public.hotel_reviews;
DROP POLICY IF EXISTS "Allow service role full access to onda_properties" ON public.onda_properties;
DROP POLICY IF EXISTS "Allow public read access to onda_properties" ON public.onda_properties;
DROP POLICY IF EXISTS "no public access" ON public.search_results_cache;

-- ── Disable RLS on every table that still had it enabled ────────────────
ALTER TABLE public.admin_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_emails DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_financial_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_policy_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.dest_code_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_push_tokens DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.etg_hotel_index DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.etg_index_status DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_booking_notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_deals DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_results_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_search_stats DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_searches DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_segments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_content DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_review_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_reviews DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.onda_properties DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.passengers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_tiers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.popular_destinations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_alerts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_counters DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_results_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_styles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_bookings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.unique_stays DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_usage DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekend_flight_deals DISABLE ROW LEVEL SECURITY;

-- migrate:down

ALTER TABLE public.weekend_flight_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unique_stays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_results_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.popular_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.policy_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onda_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_search_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_results_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flight_booking_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etg_index_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etg_hotel_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dest_code_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_policy_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON public.admin_settings FOR ALL USING (true);
CREATE POLICY "Service role can insert api_logs" ON public.api_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can read api_logs" ON public.api_logs FOR SELECT USING (true);
CREATE POLICY "dest_code_cache_public_read" ON public.dest_code_cache FOR SELECT USING (true);
CREATE POLICY "service role only" ON public.device_push_tokens FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "Anyone can insert search results" ON public.flight_results_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public read of stats" ON public.flight_search_stats FOR SELECT USING (true);
CREATE POLICY "hotel_content_public_read" ON public.hotel_content FOR SELECT USING (true);
CREATE POLICY "hotel_deals_public_read" ON public.hotel_deals FOR SELECT USING (true);
CREATE POLICY "hotel_review_items_public_read" ON public.hotel_review_items FOR SELECT USING (true);
CREATE POLICY "hotel_reviews_public_read" ON public.hotel_reviews FOR SELECT USING (true);
CREATE POLICY "Allow service role full access to onda_properties" ON public.onda_properties FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read access to onda_properties" ON public.onda_properties FOR SELECT USING (true);
CREATE POLICY "no public access" ON public.search_results_cache FOR ALL USING (false) WITH CHECK (false);
