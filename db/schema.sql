\restrict dbmate

-- Dumped from database version 17.10
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: booking_policy_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_policy_type AS ENUM (
    'free_cancellation',
    'non_refundable',
    'partial_refund',
    'tiered'
);


--
-- Name: passenger_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.passenger_type AS ENUM (
    'ADT',
    'CHD',
    'INF'
);


--
-- Name: push_platform; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.push_platform AS ENUM (
    'ios',
    'android',
    'web'
);


--
-- Name: refund_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.refund_status AS ENUM (
    'pending',
    'approved',
    'processed',
    'rejected',
    'failed'
);


--
-- Name: trip_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.trip_type AS ENUM (
    'flight',
    'hotel'
);


--
-- Name: voucher_discount_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.voucher_discount_type AS ENUM (
    'percent',
    'fixed'
);


--
-- Name: create_booking_with_policy(jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_booking_with_policy(p_booking jsonb, p_snapshot jsonb, p_tiers jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_booking_id TEXT;
  v_snapshot_id UUID;
  v_tier JSONB;
  v_tier_order INT := 0;
BEGIN
  v_booking_id := p_booking->>'booking_id';
  INSERT INTO bookings (
    booking_id, user_id, property_name, property_image, room_name,
    check_in, check_out, guests_adults, guests_children, total_price, currency,
    holder_first_name, holder_last_name, holder_email, status, special_requests,
    voucher_code, discount_amount, policy_type, cancellation_policy
  ) VALUES (
    v_booking_id, (p_booking->>'user_id')::UUID, p_booking->>'property_name',
    p_booking->>'property_image', p_booking->>'room_name',
    (p_booking->>'check_in')::DATE, (p_booking->>'check_out')::DATE,
    COALESCE((p_booking->>'guests_adults')::INTEGER, 1),
    COALESCE((p_booking->>'guests_children')::INTEGER, 0),
    (p_booking->>'total_price')::DECIMAL, COALESCE(p_booking->>'currency', 'PHP'),
    p_booking->>'holder_first_name', p_booking->>'holder_last_name', p_booking->>'holder_email',
    COALESCE(p_booking->>'status', 'confirmed'), p_booking->>'special_requests',
    p_booking->>'voucher_code', COALESCE((p_booking->>'discount_amount')::DECIMAL, 0),
    COALESCE(p_booking->>'policy_type', 'non_refundable'),
    p_snapshot->'raw_liteapi_response'
  );
  INSERT INTO booking_policy_snapshots (
    booking_id, policy_type, summary, refundable_tag, hotel_remarks,
    no_show_penalty, early_departure_fee, free_cancel_deadline, raw_liteapi_response, captured_at
  ) VALUES (
    v_booking_id, (p_snapshot->>'policy_type')::booking_policy_type,
    p_snapshot->>'summary', p_snapshot->>'refundable_tag',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'hotel_remarks')), '{}'::TEXT[]),
    COALESCE((p_snapshot->>'no_show_penalty')::DECIMAL, 0),
    COALESCE((p_snapshot->>'early_departure_fee')::DECIMAL, 0),
    CASE WHEN p_snapshot->>'free_cancel_deadline' IS NOT NULL THEN (p_snapshot->>'free_cancel_deadline')::TIMESTAMPTZ ELSE NULL END,
    COALESCE(p_snapshot->'raw_liteapi_response', '{}'::JSONB), NOW()
  ) RETURNING id INTO v_snapshot_id;
  UPDATE bookings SET policy_snapshot_id = v_snapshot_id WHERE booking_id = v_booking_id;
  FOR v_tier IN SELECT * FROM jsonb_array_elements(p_tiers) LOOP
    INSERT INTO policy_tiers (snapshot_id, cancel_deadline, penalty_amount, penalty_type, currency, tier_order)
    VALUES (v_snapshot_id, (v_tier->>'cancel_deadline')::TIMESTAMPTZ, (v_tier->>'penalty_amount')::DECIMAL,
            COALESCE(v_tier->>'penalty_type', 'fixed'), COALESCE(v_tier->>'currency', 'PHP'), v_tier_order);
    v_tier_order := v_tier_order + 1;
  END LOOP;
  RETURN jsonb_build_object('booking_id', v_booking_id, 'snapshot_id', v_snapshot_id, 'tier_count', v_tier_order);
END;
$$;


--
-- Name: get_revenue_stats(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_revenue_stats(php_rate numeric DEFAULT 55.556) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'totalRevenue', COALESCE(SUM(CASE WHEN currency = 'USD' THEN total_price * php_rate ELSE total_price END), 0),
        'confirmedCount', COUNT(*),
        'totalMarkup', COALESCE(SUM(CASE WHEN currency = 'USD' THEN markup_amount * php_rate ELSE markup_amount END), 0),
        'totalProfit', COALESCE(SUM(CASE WHEN currency = 'USD' THEN profit * php_rate ELSE profit END), 0),
        'dailyRevenue', COALESCE(SUM(CASE WHEN created_at::date = CURRENT_DATE AND currency = 'USD' THEN total_price * php_rate WHEN created_at::date = CURRENT_DATE THEN total_price ELSE 0 END), 0),
        'monthlyRevenue', COALESCE(SUM(CASE WHEN created_at >= DATE_TRUNC('month', NOW()) AND currency = 'USD' THEN total_price * php_rate WHEN created_at >= DATE_TRUNC('month', NOW()) THEN total_price ELSE 0 END), 0),
        'revenueByCurrency', (SELECT json_object_agg(currency, total) FROM (SELECT currency, SUM(total_price) AS total FROM (SELECT currency, total_price FROM unified_bookings WHERE status IN ('confirmed','ticketed','awaiting_ticket','booked') UNION ALL SELECT currency, total_price FROM bookings WHERE status IN ('confirmed','ticketed','awaiting_ticket') UNION ALL SELECT COALESCE(currency,'USD'), COALESCE(charged_price, total_price) FROM flight_bookings WHERE status IN ('booked','ticketed','awaiting_ticket')) all_bookings GROUP BY currency) grouped)
    ) INTO result
    FROM (
        SELECT total_price, COALESCE(markup_amount, 0) AS markup_amount, COALESCE(profit, 0) AS profit, COALESCE(currency, 'PHP') AS currency, created_at FROM unified_bookings WHERE status IN ('confirmed','ticketed','awaiting_ticket','booked')
        UNION ALL
        SELECT total_price, 0, 0, COALESCE(currency,'USD'), created_at FROM bookings WHERE status IN ('confirmed','ticketed','awaiting_ticket')
        UNION ALL
        SELECT COALESCE(charged_price, total_price), COALESCE(charged_price, total_price) - COALESCE(supplier_cost, total_price), 0, COALESCE(currency,'USD'), created_at FROM flight_bookings WHERE status IN ('booked','ticketed','awaiting_ticket')
    ) combined;
    RETURN result;
END;
$$;


--
-- Name: get_revenue_stats(numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_revenue_stats(php_rate numeric DEFAULT 55.556, p_brand text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE result JSON;
BEGIN
    SELECT json_build_object(
        'totalRevenue',   COALESCE(SUM(CASE WHEN currency = 'USD' THEN total_price * php_rate ELSE total_price END), 0),
        'confirmedCount', COUNT(*),
        'totalMarkup',    COALESCE(SUM(CASE WHEN currency = 'USD' THEN markup_amount * php_rate ELSE markup_amount END), 0),
        'totalProfit',    COALESCE(SUM(CASE WHEN currency = 'USD' THEN profit * php_rate ELSE profit END), 0),
        'dailyRevenue',   COALESCE(SUM(CASE
            WHEN created_at::date = CURRENT_DATE AND currency = 'USD' THEN total_price * php_rate
            WHEN created_at::date = CURRENT_DATE THEN total_price
            ELSE 0 END), 0),
        'monthlyRevenue', COALESCE(SUM(CASE
            WHEN created_at >= DATE_TRUNC('month', NOW()) AND currency = 'USD' THEN total_price * php_rate
            WHEN created_at >= DATE_TRUNC('month', NOW()) THEN total_price
            ELSE 0 END), 0),
        'revenueByCurrency', (
            SELECT json_object_agg(currency, total)
            FROM (
                SELECT currency, SUM(total_price) AS total
                FROM (
                    SELECT currency, total_price FROM unified_bookings
                    WHERE status IN ('confirmed','ticketed','awaiting_ticket','booked')
                      AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
                    UNION ALL
                    SELECT currency, total_price FROM bookings
                    WHERE status IN ('confirmed','ticketed','awaiting_ticket')
                      AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
                    UNION ALL
                    SELECT COALESCE(currency,'USD'), COALESCE(charged_price, total_price) FROM flight_bookings
                    WHERE status IN ('booked','ticketed','awaiting_ticket')
                      AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
                ) all_bookings
                GROUP BY currency
            ) grouped
        )
    ) INTO result
    FROM (
        SELECT total_price, COALESCE(markup_amount, 0) AS markup_amount, COALESCE(profit, 0) AS profit,
               COALESCE(currency, 'PHP') AS currency, created_at
        FROM unified_bookings
        WHERE status IN ('confirmed','ticketed','awaiting_ticket','booked')
          AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
        UNION ALL
        SELECT total_price, 0, 0, COALESCE(currency,'USD'), created_at
        FROM bookings
        WHERE status IN ('confirmed','ticketed','awaiting_ticket')
          AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
        UNION ALL
        SELECT COALESCE(charged_price, total_price),
               COALESCE(charged_price, total_price) - COALESCE(supplier_cost, total_price),
               0, COALESCE(currency,'USD'), created_at
        FROM flight_bookings
        WHERE status IN ('booked','ticketed','awaiting_ticket')
          AND (p_brand IS NULL OR source_brand = p_brand OR (p_brand = 'CheapestGo' AND source_brand IS NULL))
    ) combined;
    RETURN result;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;


--
-- Name: increment_rate_limit(text, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_rate_limit(p_key text, p_window_ms bigint) RETURNS TABLE(current_count integer, reset_at timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_now      TIMESTAMPTZ := NOW();
    v_reset_at TIMESTAMPTZ := v_now + (p_window_ms || ' milliseconds')::INTERVAL;
BEGIN
    RETURN QUERY
    INSERT INTO rate_limit_counters (key, count, reset_at)
    VALUES (p_key, 1, v_reset_at)
    ON CONFLICT (key) DO UPDATE SET
        count    = CASE WHEN rate_limit_counters.reset_at < v_now THEN 1 ELSE rate_limit_counters.count + 1 END,
        reset_at = CASE WHEN rate_limit_counters.reset_at < v_now THEN v_reset_at ELSE rate_limit_counters.reset_at END
    RETURNING rate_limit_counters.count::INT, rate_limit_counters.reset_at;
END;
$$;


--
-- Name: increment_search_stats(text, text, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_search_stats(p_origin text, p_destination text, p_min_price numeric, p_avg_price numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO public.flight_search_stats (origin, destination, min_price, avg_price, search_count, last_searched_at)
    VALUES (p_origin, p_destination, p_min_price, p_avg_price, 1, NOW())
    ON CONFLICT (origin, destination) DO UPDATE SET
        search_count     = public.flight_search_stats.search_count + 1,
        min_price        = LEAST(public.flight_search_stats.min_price, EXCLUDED.min_price),
        avg_price        = (public.flight_search_stats.avg_price + EXCLUDED.avg_price) / 2,
        last_searched_at = NOW();
END;
$$;


--
-- Name: save_booking_transaction(jsonb, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_booking_transaction(p_booking jsonb, p_snapshot jsonb, p_tiers jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_booking_id   UUID;
  v_snapshot_id  UUID;
BEGIN
  INSERT INTO bookings (
    booking_id, user_id, hotel_id, property_name, property_image, room_name,
    check_in, check_out, guests_adults, guests_children, total_price, currency,
    holder_first_name, holder_last_name, holder_email, special_requests,
    voucher_code, discount_amount, status, cancellation_policy
  ) VALUES (
    COALESCE((p_booking->>'booking_id')::UUID, gen_random_uuid()),
    (p_booking->>'user_id')::UUID, p_booking->>'hotel_id',
    p_booking->>'property_name', p_booking->>'property_image', p_booking->>'room_name',
    (p_booking->>'check_in')::DATE, (p_booking->>'check_out')::DATE,
    COALESCE((p_booking->>'guests_adults')::INTEGER, 1),
    COALESCE((p_booking->>'guests_children')::INTEGER, 0),
    (p_booking->>'total_price')::DECIMAL, p_booking->>'currency',
    p_booking->>'holder_first_name', p_booking->>'holder_last_name', p_booking->>'holder_email',
    p_booking->>'special_requests', p_booking->>'voucher_code',
    COALESCE((p_booking->>'discount_amount')::DECIMAL, 0),
    COALESCE(p_booking->>'status', 'confirmed'),
    p_snapshot->'raw_provider_response'
  ) RETURNING booking_id INTO v_booking_id;
  INSERT INTO booking_policy_snapshots (
    booking_id, policy_type, summary, refundable_tag, hotel_remarks,
    no_show_penalty, early_departure_fee, free_cancel_deadline, raw_provider_response, captured_at
  ) VALUES (
    v_booking_id, (p_snapshot->>'policy_type')::booking_policy_type,
    p_snapshot->>'summary', p_snapshot->>'refundable_tag',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'hotel_remarks')), '{}'::TEXT[]),
    COALESCE((p_snapshot->>'no_show_penalty')::DECIMAL, 0),
    COALESCE((p_snapshot->>'early_departure_fee')::DECIMAL, 0),
    CASE WHEN p_snapshot->>'free_cancel_deadline' IS NOT NULL THEN (p_snapshot->>'free_cancel_deadline')::TIMESTAMPTZ ELSE NULL END,
    COALESCE(p_snapshot->'raw_provider_response', '{}'::JSONB), NOW()
  ) RETURNING id INTO v_snapshot_id;
  UPDATE bookings SET policy_snapshot_id = v_snapshot_id WHERE booking_id = v_booking_id;
  IF jsonb_array_length(p_tiers) > 0 THEN
    INSERT INTO policy_tiers (snapshot_id, cancel_deadline, penalty_amount, penalty_type, currency, tier_order)
    SELECT v_snapshot_id, (tier->>'cancel_deadline')::TIMESTAMPTZ, (tier->>'penalty_amount')::DECIMAL,
           tier->>'penalty_type', tier->>'currency', (tier->>'tier_order')::INTEGER
    FROM jsonb_array_elements(p_tiers) AS tier;
  END IF;
  RETURN jsonb_build_object('booking_id', v_booking_id, 'snapshot_id', v_snapshot_id);
EXCEPTION WHEN OTHERS THEN RAISE;
END;
$$;


--
-- Name: update_admin_settings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_admin_settings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


--
-- Name: update_booking_sessions_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_booking_sessions_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


--
-- Name: update_notifications_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_notifications_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


--
-- Name: update_unified_bookings_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_unified_bookings_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    admin_id uuid,
    admin_email text,
    target_id text,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_settings (
    key text NOT NULL,
    value jsonb DEFAULT '""'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: api_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    endpoint text NOT NULL,
    method text DEFAULT 'POST'::text,
    request_params jsonb,
    response_status integer,
    response_summary jsonb,
    duration_ms integer DEFAULT 0 NOT NULL,
    error_message text,
    user_id uuid,
    search_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: booking_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text NOT NULL,
    recipient_email text NOT NULL,
    guest_name text,
    hotel_name text,
    room_name text,
    check_in text,
    check_out text,
    total_price numeric,
    currency text DEFAULT 'PHP'::text,
    email_html text,
    sent_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'queued'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: booking_financial_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_financial_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    event_type text NOT NULL,
    amount numeric(12,2) NOT NULL,
    currency text NOT NULL,
    provider text NOT NULL,
    transaction_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_financial_events_event_type_check CHECK ((event_type = ANY (ARRAY['payment'::text, 'refund'::text, 'supplier_reconciliation'::text])))
);


--
-- Name: booking_policy_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_policy_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text NOT NULL,
    policy_type public.booking_policy_type DEFAULT 'non_refundable'::public.booking_policy_type NOT NULL,
    summary text,
    refundable_tag text,
    hotel_remarks text[] DEFAULT '{}'::text[],
    no_show_penalty numeric(10,2) DEFAULT 0,
    early_departure_fee numeric(10,2) DEFAULT 0,
    free_cancel_deadline timestamp with time zone,
    raw_provider_response jsonb DEFAULT '{}'::jsonb NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    api_version text,
    raw_liteapi_response jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: booking_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider text NOT NULL,
    flight jsonb DEFAULT '{}'::jsonb NOT NULL,
    passengers jsonb DEFAULT '[]'::jsonb NOT NULL,
    contact jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    idempotency_key text,
    payment_intent_id text,
    capture_method text DEFAULT 'automatic'::text,
    is_refundable boolean,
    is_changeable boolean,
    refund_penalty_amount numeric(10,2),
    refund_penalty_currency text,
    change_penalty_amount numeric(10,2),
    change_penalty_currency text,
    policy_source text,
    policy_version text,
    policy_locked boolean DEFAULT false NOT NULL,
    fare_policy jsonb,
    seat_service_ids text[],
    seat_total numeric DEFAULT 0,
    duffel_pre_order_id text,
    duffel_pre_order_pnr text,
    duffel_pre_order_tickets text[],
    duffel_pre_order_ticketed boolean,
    original_price numeric,
    charged_price numeric,
    markup_pct numeric,
    currency text,
    bag_service_ids text[],
    bag_total numeric DEFAULT 0,
    payment_currency text,
    CONSTRAINT booking_sessions_policy_version_check CHECK ((policy_version = ANY (ARRAY['search'::text, 'revalidated'::text]))),
    CONSTRAINT booking_sessions_provider_check CHECK ((provider = ANY (ARRAY['mystifly'::text, 'mystifly_v2'::text, 'duffel'::text, 'legacy_amadeus'::text]))),
    CONSTRAINT booking_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'initiated'::text, 'payment_initiated'::text, 'payment_authorized'::text, 'processing'::text, 'booked'::text, 'failed'::text, 'expired'::text])))
);


--
-- Name: COLUMN booking_sessions.policy_version; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_sessions.policy_version IS '''search'' = indicative, ''revalidated'' = locked pre-payment.';


--
-- Name: COLUMN booking_sessions.policy_locked; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_sessions.policy_locked IS 'TRUE after revalidation confirms policy. Payment must be blocked until TRUE.';


--
-- Name: COLUMN booking_sessions.payment_currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.booking_sessions.payment_currency IS 'ISO currency the customer was actually charged in (may differ from the offer currency).';


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text NOT NULL,
    user_id uuid NOT NULL,
    property_name text NOT NULL,
    property_image text,
    room_name text NOT NULL,
    check_in date NOT NULL,
    check_out date NOT NULL,
    guests_adults integer DEFAULT 1,
    guests_children integer DEFAULT 0,
    total_price numeric(10,2) NOT NULL,
    currency text DEFAULT 'PHP'::text,
    holder_first_name text NOT NULL,
    holder_last_name text NOT NULL,
    holder_email text NOT NULL,
    status text DEFAULT 'confirmed'::text,
    special_requests text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cancellation_policy jsonb,
    voucher_code text,
    discount_amount numeric(10,2) DEFAULT 0,
    policy_type text DEFAULT 'non_refundable'::text,
    policy_snapshot_id uuid,
    bundled_with_flight_id text,
    payment_intent_id text,
    provider text DEFAULT 'liteapi'::text NOT NULL,
    provider_metadata jsonb,
    supplier_cost numeric(12,2) DEFAULT NULL::numeric,
    charged_price numeric(12,2) DEFAULT NULL::numeric,
    markup_pct numeric(6,4) DEFAULT NULL::numeric,
    hotel_id text,
    property_lat double precision DEFAULT 0 NOT NULL,
    property_lng double precision DEFAULT 0 NOT NULL,
    source_brand text
);


--
-- Name: dest_code_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dest_code_cache (
    city_key text NOT NULL,
    dest_codes text[] DEFAULT '{}'::text[] NOT NULL,
    hotel_codes text[] DEFAULT '{}'::text[] NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: device_push_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    expo_push_token text NOT NULL,
    platform public.push_platform DEFAULT 'ios'::public.push_platform,
    app_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text,
    recipient text NOT NULL,
    subject text NOT NULL,
    email_type text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    CONSTRAINT email_logs_email_type_check CHECK ((email_type = ANY (ARRAY['confirmation'::text, 'ticketed'::text, 'refund'::text, 'cancellation'::text, 'awaiting_ticket'::text, 'price_alert'::text]))),
    CONSTRAINT email_logs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text])))
);


--
-- Name: etg_hotel_index; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etg_hotel_index (
    hid bigint NOT NULL,
    name text NOT NULL,
    name_normalized text NOT NULL,
    lat double precision DEFAULT 0,
    lng double precision DEFAULT 0,
    country_code character(2) NOT NULL,
    region_id bigint,
    star_rating smallint DEFAULT 0,
    indexed_at timestamp with time zone DEFAULT now()
);


--
-- Name: etg_index_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.etg_index_status (
    country_code character(2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    hotel_count integer DEFAULT 0,
    last_seeded_at timestamp with time zone,
    last_error text
);


--
-- Name: flight_booking_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flight_booking_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: flight_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flight_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    pnr text NOT NULL,
    provider text NOT NULL,
    total_price numeric(12,2) NOT NULL,
    status text DEFAULT 'booked'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    currency text DEFAULT 'USD'::text,
    provider_order_id text,
    session_id uuid,
    trip_type text,
    payment_intent_id text,
    ticket_time_limit timestamp with time zone,
    cancellation_requested_at timestamp with time zone,
    cancellation_completed_at timestamp with time zone,
    refund_amount numeric(12,2),
    refund_penalty_amount numeric(12,2),
    refund_currency text,
    cancellation_log jsonb DEFAULT '[]'::jsonb NOT NULL,
    fare_policy jsonb,
    policy_snapshot_at timestamp with time zone DEFAULT now(),
    supplier_cancellation_id text,
    payment_currency text,
    supplier_currency text,
    fx_rate_snapshot numeric,
    supplier_cost numeric(12,2) DEFAULT NULL::numeric,
    charged_price numeric(12,2) DEFAULT NULL::numeric,
    markup_pct numeric(6,4) DEFAULT NULL::numeric,
    bundled_with_hotel_id text,
    duffel_order_id text,
    confirmed_price numeric(12,2),
    confirmed_currency text,
    source_brand text,
    ticket_numbers text[],
    CONSTRAINT flight_bookings_provider_check CHECK ((provider = ANY (ARRAY['amadeus'::text, 'legacy_amadeus'::text, 'mystifly'::text, 'mystifly_v2'::text, 'duffel'::text]))),
    CONSTRAINT flight_bookings_status_check CHECK ((status = ANY (ARRAY['booked'::text, 'pnr_created'::text, 'awaiting_ticket'::text, 'ticketing'::text, 'ticketed'::text, 'failed'::text, 'cancel_requested'::text, 'cancel_failed'::text, 'cancelled'::text, 'cancelled_provider_missing'::text, 'refund_pending'::text, 'refunded'::text, 'refund_failed'::text]))),
    CONSTRAINT flight_bookings_trip_type_check CHECK ((trip_type = ANY (ARRAY['one-way'::text, 'round-trip'::text, 'multi-city'::text]))),
    CONSTRAINT refund_amount_required CHECK (((status <> 'refunded'::text) OR (refund_amount IS NOT NULL)))
);


--
-- Name: COLUMN flight_bookings.currency; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.flight_bookings.currency IS 'ISO 4217 currency code';


--
-- Name: COLUMN flight_bookings.cancellation_requested_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.flight_bookings.cancellation_requested_at IS 'Set immediately on cancel request ??? prevents duplicate supplier calls.';


--
-- Name: COLUMN flight_bookings.cancellation_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.flight_bookings.cancellation_log IS 'Append-only log of each state transition: [{at,oldStatus,newStatus,supplierResponse}]';


--
-- Name: COLUMN flight_bookings.supplier_cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.flight_bookings.supplier_cost IS 'Confirmed fare charged by the provider (Duffel balance / Mystifly deduction)';


--
-- Name: COLUMN flight_bookings.charged_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.flight_bookings.charged_price IS 'Amount the customer was charged (Stripe capture amount)';


--
-- Name: COLUMN flight_bookings.markup_pct; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.flight_bookings.markup_pct IS 'Decimal markup rate applied at booking time';


--
-- Name: COLUMN flight_bookings.ticket_numbers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.flight_bookings.ticket_numbers IS 'E-ticket numbers issued for this booking, from the supplier order documents. Booking-level copy of passengers.ticket_number: passenger rows are inserted best-effort and can be partially written, so this is the complete record.';


--
-- Name: flight_deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flight_deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    origin text NOT NULL,
    destination text NOT NULL,
    price numeric(10,2) NOT NULL,
    currency text DEFAULT 'USD'::text,
    airline text,
    image_url text,
    departure_date date,
    return_date date,
    discount_tag text,
    updated_at timestamp with time zone DEFAULT now(),
    baseline_price numeric(10,2),
    last_refreshed_at timestamp with time zone,
    original_price numeric(10,2),
    ends_in text,
    cabin_class text DEFAULT 'economy'::text NOT NULL,
    CONSTRAINT flight_deals_cabin_class_check CHECK ((cabin_class = ANY (ARRAY['economy'::text, 'premium_economy'::text, 'business'::text, 'first'::text]))),
    CONSTRAINT flight_deals_destination_iata CHECK ((destination ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT flight_deals_origin_iata CHECK ((origin ~ '^[A-Z]{3}$'::text))
);


--
-- Name: flight_results_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flight_results_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    search_id uuid NOT NULL,
    provider text NOT NULL,
    offer_id text NOT NULL,
    price numeric(12,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    airline text NOT NULL,
    departure_time timestamp with time zone NOT NULL,
    arrival_time timestamp with time zone NOT NULL,
    duration integer NOT NULL,
    raw jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    stops integer DEFAULT 0 NOT NULL,
    remaining_seats integer,
    refundable boolean DEFAULT false NOT NULL
);


--
-- Name: flight_search_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flight_search_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    origin text NOT NULL,
    destination text NOT NULL,
    min_price numeric(12,2),
    avg_price numeric(12,2),
    search_count integer DEFAULT 1,
    last_searched_at timestamp with time zone DEFAULT now()
);


--
-- Name: flight_searches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flight_searches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    origin text NOT NULL,
    destination text NOT NULL,
    departure_date date NOT NULL,
    return_date date,
    adults integer DEFAULT 1 NOT NULL,
    children integer DEFAULT 0 NOT NULL,
    infants integer DEFAULT 0 NOT NULL,
    cabin_class text DEFAULT 'economy'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: flight_segments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.flight_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    airline text NOT NULL,
    flight_number text NOT NULL,
    origin text NOT NULL,
    destination text NOT NULL,
    departure timestamp with time zone NOT NULL,
    arrival timestamp with time zone NOT NULL,
    itinerary_index integer DEFAULT 0 NOT NULL,
    cabin_class text DEFAULT 'economy'::text NOT NULL,
    segment_index integer DEFAULT 0 NOT NULL
);


--
-- Name: hotel_content; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotel_content (
    hotel_id text NOT NULL,
    name text,
    images text[] DEFAULT '{}'::text[] NOT NULL,
    star_rating smallint DEFAULT 0 NOT NULL,
    lat double precision DEFAULT 0 NOT NULL,
    lng double precision DEFAULT 0 NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    address text,
    city text,
    country text,
    description text,
    amenities jsonb DEFAULT '[]'::jsonb NOT NULL,
    ratehawk_hid text,
    content_source text,
    last_attempt_at timestamp with time zone,
    check_in_time text,
    check_out_time text,
    review_rating numeric(4,2),
    review_count integer,
    amenity_groups jsonb DEFAULT '[]'::jsonb NOT NULL,
    important_information text,
    room_groups jsonb DEFAULT '[]'::jsonb,
    google_place_id text,
    google_enriched_at timestamp with time zone,
    contact_info jsonb,
    chain_code text,
    giata_id text,
    metapolicy_struct jsonb,
    metapolicy_extra_info text
);


--
-- Name: hotel_deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotel_deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    location text NOT NULL,
    destination text NOT NULL,
    country_code text DEFAULT ''::text,
    rating numeric(3,1) DEFAULT 0,
    stars integer DEFAULT 0,
    image_url text DEFAULT ''::text,
    price numeric(10,2) DEFAULT 0 NOT NULL,
    original_price numeric(10,2) DEFAULT 0,
    currency text DEFAULT 'PHP'::text,
    discount_tag text DEFAULT ''::text,
    discount_pct integer DEFAULT 0,
    check_in date,
    check_out date,
    badge text,
    hotel_code text DEFAULT ''::text,
    updated_at timestamp with time zone DEFAULT now(),
    city_key text,
    lat numeric(9,6),
    lng numeric(9,6),
    board_code text,
    refundable boolean,
    baseline_price numeric(10,2),
    last_refreshed_at timestamp with time zone,
    guests integer DEFAULT 2,
    bedrooms integer DEFAULT 1,
    bathrooms integer DEFAULT 1
);


--
-- Name: hotel_review_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotel_review_items (
    id bigint NOT NULL,
    hotel_id text NOT NULL,
    source_id text NOT NULL,
    reviewer_name text,
    review_date text,
    score numeric(4,2),
    pros text,
    cons text,
    traveler_type text,
    language text,
    headline text,
    country text,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hotel_review_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.hotel_review_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.hotel_review_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: hotel_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotel_reviews (
    hotel_id text NOT NULL,
    rating numeric(4,2),
    reviews_count integer DEFAULT 0 NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: hotel_search_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotel_search_cache (
    cache_key text NOT NULL,
    result jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: hotel_search_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotel_search_stats (
    city_key text NOT NULL,
    country_code text DEFAULT ''::text NOT NULL,
    search_count integer DEFAULT 1 NOT NULL,
    last_searched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text NOT NULL,
    description text,
    type text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['booking'::text, 'system'::text, 'alert'::text])))
);


--
-- Name: onda_properties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onda_properties (
    id text NOT NULL,
    name text NOT NULL,
    address text,
    latitude double precision,
    longitude double precision,
    star_rating integer,
    thumbnail_url text,
    images text[] DEFAULT '{}'::text[],
    amenities text[] DEFAULT '{}'::text[],
    description text,
    status text,
    last_synced_at timestamp with time zone DEFAULT now()
);


--
-- Name: passengers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passengers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    type public.passenger_type NOT NULL,
    passport text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ticket_number text,
    seat_number text
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    user_id uuid NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: place_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.place_cache (
    place_id text NOT NULL,
    data jsonb NOT NULL,
    cached_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: policy_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.policy_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    snapshot_id uuid NOT NULL,
    cancel_deadline timestamp with time zone NOT NULL,
    penalty_amount numeric(10,2) DEFAULT 0 NOT NULL,
    penalty_type text DEFAULT 'fixed'::text NOT NULL,
    currency text DEFAULT 'PHP'::text,
    tier_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT policy_tiers_penalty_type_check CHECK ((penalty_type = ANY (ARRAY['fixed'::text, 'percent'::text, 'nights'::text])))
);


--
-- Name: popular_destinations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.popular_destinations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    city text NOT NULL,
    country text NOT NULL,
    image_url text,
    average_price numeric(10,2),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: price_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.price_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email text NOT NULL,
    origin text NOT NULL,
    destination text NOT NULL,
    cabin_class text DEFAULT 'economy'::text NOT NULL,
    adults integer DEFAULT 1 NOT NULL,
    current_price numeric(12,2),
    currency text DEFAULT 'USD'::text NOT NULL,
    target_price numeric(12,2),
    is_active boolean DEFAULT true NOT NULL,
    last_checked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT price_alerts_adults_check CHECK (((adults >= 1) AND (adults <= 9))),
    CONSTRAINT price_alerts_cabin_class_check CHECK ((cabin_class = ANY (ARRAY['economy'::text, 'premium_economy'::text, 'business'::text, 'first'::text]))),
    CONSTRAINT price_alerts_destination_check CHECK ((destination ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT price_alerts_origin_check CHECK ((origin ~ '^[A-Z]{3}$'::text))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    phone text,
    avatar_url text,
    nationality text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    banned_at timestamp with time zone,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: rate_limit_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limit_counters (
    key text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    reset_at timestamp with time zone NOT NULL
);


--
-- Name: refund_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refund_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id text NOT NULL,
    policy_snapshot_id uuid,
    user_id uuid NOT NULL,
    refund_type text NOT NULL,
    requested_amount numeric(10,2) NOT NULL,
    approved_amount numeric(10,2),
    currency text DEFAULT 'PHP'::text,
    penalty_amount numeric(10,2) DEFAULT 0,
    applied_tier_id uuid,
    status public.refund_status DEFAULT 'pending'::public.refund_status NOT NULL,
    status_reason text,
    external_ref text,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    processed_at timestamp with time zone,
    processed_by text,
    CONSTRAINT refund_logs_refund_type_check CHECK ((refund_type = ANY (ARRAY['full_refund'::text, 'partial_refund'::text, 'no_show_charge'::text, 'early_departure_charge'::text, 'policy_override'::text])))
);


--
-- Name: saved_trips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saved_trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.trip_type NOT NULL,
    title text NOT NULL,
    subtitle text,
    price numeric(12,2),
    currency text DEFAULT 'USD'::text NOT NULL,
    image_url text,
    deep_link text NOT NULL,
    snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying(128) NOT NULL
);


--
-- Name: search_results_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_results_cache (
    cache_key text NOT NULL,
    city_name text NOT NULL,
    region_id integer DEFAULT 0 NOT NULL,
    checkin date NOT NULL,
    checkout date NOT NULL,
    adults integer DEFAULT 2 NOT NULL,
    children integer DEFAULT 0 NOT NULL,
    rooms integer DEFAULT 1 NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    nationality text DEFAULT 'KR'::text NOT NULL,
    hotels jsonb DEFAULT '[]'::jsonb NOT NULL,
    total_count integer DEFAULT 0 NOT NULL,
    cached_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id text NOT NULL,
    user_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: stripe_processed_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_processed_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    event_type text,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: tgx_destination_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tgx_destination_cache (
    city_key text NOT NULL,
    destination_code text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    dest_type text DEFAULT 'CITY'::text,
    parent_code text
);


--
-- Name: tgx_failed_dest_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tgx_failed_dest_codes (
    dest_code text NOT NULL,
    city_key text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: travel_styles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.travel_styles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    location text NOT NULL,
    price numeric(10,2) NOT NULL,
    image_url text,
    category text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: unified_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unified_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type public.trip_type NOT NULL,
    provider text NOT NULL,
    external_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    total_price numeric(12,2) NOT NULL,
    currency text DEFAULT 'USD'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    supplier_cost numeric(12,2) DEFAULT 0,
    markup_amount numeric(12,2) DEFAULT 0,
    profit numeric(12,2) DEFAULT 0,
    source_brand text,
    CONSTRAINT unified_bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'ticketed'::text, 'cancelled'::text, 'refunded'::text, 'failed'::text, 'expired'::text, 'awaiting_ticket'::text, 'booked'::text])))
);


--
-- Name: unique_stays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.unique_stays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    location text NOT NULL,
    rating numeric(2,1),
    price numeric(10,2) NOT NULL,
    image_url text,
    badge text,
    category text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    password_hash text,
    role text DEFAULT 'user'::text NOT NULL,
    first_name text,
    last_name text,
    avatar_url text,
    banned_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    birth_date date,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['user'::text, 'admin'::text])))
);


--
-- Name: COLUMN users.birth_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.users.birth_date IS 'Date of birth of the account holder. Required at signup (18+); NULL for accounts created before that rule.';


--
-- Name: voucher_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voucher_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    voucher_id uuid NOT NULL,
    user_id uuid NOT NULL,
    booking_id text,
    original_price numeric(10,2) NOT NULL,
    discount_applied numeric(10,2) NOT NULL,
    final_price numeric(10,2) NOT NULL,
    currency text DEFAULT 'PHP'::text,
    used_at timestamp with time zone DEFAULT now()
);


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vouchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    discount_type public.voucher_discount_type NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    min_booking_amount numeric(10,2),
    max_discount_amount numeric(10,2),
    category text DEFAULT 'general'::text NOT NULL,
    hotel_ids text[],
    location_codes text[],
    valid_from timestamp with time zone DEFAULT now() NOT NULL,
    valid_until timestamp with time zone NOT NULL,
    usage_limit integer,
    times_used integer DEFAULT 0,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT vouchers_category_check CHECK ((category = ANY (ARRAY['general'::text, 'first_time'::text, 'location_based'::text, 'hotel_specific'::text, 'seasonal'::text]))),
    CONSTRAINT vouchers_discount_value_check CHECK ((discount_value > (0)::numeric))
);


--
-- Name: weekend_flight_deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.weekend_flight_deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    location text NOT NULL,
    rating numeric(2,1),
    reviews integer DEFAULT 0,
    original_price numeric(10,2),
    sale_price numeric(10,2) NOT NULL,
    image_url text,
    badge text,
    created_at timestamp with time zone DEFAULT now(),
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    guests integer DEFAULT 2,
    bedrooms integer DEFAULT 1,
    bathrooms integer DEFAULT 1
);


--
-- Name: admin_audit_log admin_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_log
    ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);


--
-- Name: admin_settings admin_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_settings
    ADD CONSTRAINT admin_settings_pkey PRIMARY KEY (key);


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: api_logs api_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_logs
    ADD CONSTRAINT api_logs_pkey PRIMARY KEY (id);


--
-- Name: booking_emails booking_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_emails
    ADD CONSTRAINT booking_emails_pkey PRIMARY KEY (id);


--
-- Name: booking_financial_events booking_financial_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_financial_events
    ADD CONSTRAINT booking_financial_events_pkey PRIMARY KEY (id);


--
-- Name: booking_policy_snapshots booking_policy_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_policy_snapshots
    ADD CONSTRAINT booking_policy_snapshots_pkey PRIMARY KEY (id);


--
-- Name: booking_sessions booking_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_sessions
    ADD CONSTRAINT booking_sessions_pkey PRIMARY KEY (id);


--
-- Name: bookings bookings_booking_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_booking_id_key UNIQUE (booking_id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: dest_code_cache dest_code_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dest_code_cache
    ADD CONSTRAINT dest_code_cache_pkey PRIMARY KEY (city_key);


--
-- Name: device_push_tokens device_push_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_push_tokens
    ADD CONSTRAINT device_push_tokens_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: etg_hotel_index etg_hotel_index_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etg_hotel_index
    ADD CONSTRAINT etg_hotel_index_pkey PRIMARY KEY (hid);


--
-- Name: etg_index_status etg_index_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.etg_index_status
    ADD CONSTRAINT etg_index_status_pkey PRIMARY KEY (country_code);


--
-- Name: flight_booking_notes flight_booking_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_booking_notes
    ADD CONSTRAINT flight_booking_notes_pkey PRIMARY KEY (id);


--
-- Name: flight_bookings flight_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_bookings
    ADD CONSTRAINT flight_bookings_pkey PRIMARY KEY (id);


--
-- Name: flight_deals flight_deals_origin_destination_cabin_class_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_deals
    ADD CONSTRAINT flight_deals_origin_destination_cabin_class_key UNIQUE (origin, destination, cabin_class);


--
-- Name: flight_deals flight_deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_deals
    ADD CONSTRAINT flight_deals_pkey PRIMARY KEY (id);


--
-- Name: flight_results_cache flight_results_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_results_cache
    ADD CONSTRAINT flight_results_cache_pkey PRIMARY KEY (id);


--
-- Name: flight_search_stats flight_search_stats_origin_destination_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_search_stats
    ADD CONSTRAINT flight_search_stats_origin_destination_key UNIQUE (origin, destination);


--
-- Name: flight_search_stats flight_search_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_search_stats
    ADD CONSTRAINT flight_search_stats_pkey PRIMARY KEY (id);


--
-- Name: flight_searches flight_searches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_searches
    ADD CONSTRAINT flight_searches_pkey PRIMARY KEY (id);


--
-- Name: flight_segments flight_segments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_segments
    ADD CONSTRAINT flight_segments_pkey PRIMARY KEY (id);


--
-- Name: hotel_content hotel_content_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_content
    ADD CONSTRAINT hotel_content_pkey PRIMARY KEY (hotel_id);


--
-- Name: hotel_deals hotel_deals_hotel_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_deals
    ADD CONSTRAINT hotel_deals_hotel_code_key UNIQUE (hotel_code);


--
-- Name: hotel_deals hotel_deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_deals
    ADD CONSTRAINT hotel_deals_pkey PRIMARY KEY (id);


--
-- Name: hotel_review_items hotel_review_items_hotel_id_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_review_items
    ADD CONSTRAINT hotel_review_items_hotel_id_source_id_key UNIQUE (hotel_id, source_id);


--
-- Name: hotel_review_items hotel_review_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_review_items
    ADD CONSTRAINT hotel_review_items_pkey PRIMARY KEY (id);


--
-- Name: hotel_reviews hotel_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_reviews
    ADD CONSTRAINT hotel_reviews_pkey PRIMARY KEY (hotel_id);


--
-- Name: hotel_search_cache hotel_search_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_search_cache
    ADD CONSTRAINT hotel_search_cache_pkey PRIMARY KEY (cache_key);


--
-- Name: hotel_search_stats hotel_search_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotel_search_stats
    ADD CONSTRAINT hotel_search_stats_pkey PRIMARY KEY (city_key);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: onda_properties onda_properties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onda_properties
    ADD CONSTRAINT onda_properties_pkey PRIMARY KEY (id);


--
-- Name: passengers passengers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passengers
    ADD CONSTRAINT passengers_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (user_id);


--
-- Name: place_cache place_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.place_cache
    ADD CONSTRAINT place_cache_pkey PRIMARY KEY (place_id);


--
-- Name: policy_tiers policy_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_tiers
    ADD CONSTRAINT policy_tiers_pkey PRIMARY KEY (id);


--
-- Name: popular_destinations popular_destinations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.popular_destinations
    ADD CONSTRAINT popular_destinations_pkey PRIMARY KEY (id);


--
-- Name: price_alerts price_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_alerts
    ADD CONSTRAINT price_alerts_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: rate_limit_counters rate_limit_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limit_counters
    ADD CONSTRAINT rate_limit_counters_pkey PRIMARY KEY (key);


--
-- Name: refund_logs refund_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_logs
    ADD CONSTRAINT refund_logs_pkey PRIMARY KEY (id);


--
-- Name: saved_trips saved_trips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_trips
    ADD CONSTRAINT saved_trips_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: search_results_cache search_results_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_results_cache
    ADD CONSTRAINT search_results_cache_pkey PRIMARY KEY (cache_key);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: stripe_processed_events stripe_processed_events_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_processed_events
    ADD CONSTRAINT stripe_processed_events_event_id_key UNIQUE (event_id);


--
-- Name: stripe_processed_events stripe_processed_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_processed_events
    ADD CONSTRAINT stripe_processed_events_pkey PRIMARY KEY (id);


--
-- Name: tgx_destination_cache tgx_destination_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tgx_destination_cache
    ADD CONSTRAINT tgx_destination_cache_pkey PRIMARY KEY (city_key);


--
-- Name: tgx_failed_dest_codes tgx_failed_dest_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tgx_failed_dest_codes
    ADD CONSTRAINT tgx_failed_dest_codes_pkey PRIMARY KEY (dest_code);


--
-- Name: travel_styles travel_styles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.travel_styles
    ADD CONSTRAINT travel_styles_pkey PRIMARY KEY (id);


--
-- Name: unified_bookings unified_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unified_bookings
    ADD CONSTRAINT unified_bookings_pkey PRIMARY KEY (id);


--
-- Name: unique_stays unique_stays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.unique_stays
    ADD CONSTRAINT unique_stays_pkey PRIMARY KEY (id);


--
-- Name: booking_policy_snapshots uq_policy_per_booking; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_policy_snapshots
    ADD CONSTRAINT uq_policy_per_booking UNIQUE (booking_id);


--
-- Name: policy_tiers uq_tier_order; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_tiers
    ADD CONSTRAINT uq_tier_order UNIQUE (snapshot_id, tier_order);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: voucher_usage voucher_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_usage
    ADD CONSTRAINT voucher_usage_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_code_key UNIQUE (code);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: weekend_flight_deals weekend_flight_deals_name_location_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekend_flight_deals
    ADD CONSTRAINT weekend_flight_deals_name_location_key UNIQUE (name, location);


--
-- Name: weekend_flight_deals weekend_flight_deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.weekend_flight_deals
    ADD CONSTRAINT weekend_flight_deals_pkey PRIMARY KEY (id);


--
-- Name: api_keys_key_hash_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_keys_key_hash_idx ON public.api_keys USING btree (key_hash) WHERE (is_active = true);


--
-- Name: api_keys_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_keys_user_id_idx ON public.api_keys USING btree (user_id);


--
-- Name: dest_code_cache_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX dest_code_cache_expires_at_idx ON public.dest_code_cache USING btree (expires_at);


--
-- Name: device_push_tokens_token_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX device_push_tokens_token_idx ON public.device_push_tokens USING btree (expo_push_token);


--
-- Name: device_push_tokens_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX device_push_tokens_user_idx ON public.device_push_tokens USING btree (user_id);


--
-- Name: etg_hotel_index_country_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX etg_hotel_index_country_name ON public.etg_hotel_index USING btree (country_code, name_normalized);


--
-- Name: etg_hotel_index_name_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX etg_hotel_index_name_trgm ON public.etg_hotel_index USING gin (name_normalized public.gin_trgm_ops);


--
-- Name: hotel_content_fetched_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hotel_content_fetched_at_idx ON public.hotel_content USING btree (fetched_at);


--
-- Name: hotel_content_google_enriched_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hotel_content_google_enriched_idx ON public.hotel_content USING btree (google_enriched_at) WHERE ((lat <> (0)::double precision) AND (lng <> (0)::double precision));


--
-- Name: hotel_content_ratehawk_hid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hotel_content_ratehawk_hid_idx ON public.hotel_content USING btree (ratehawk_hid) WHERE (ratehawk_hid IS NOT NULL);


--
-- Name: hotel_review_items_hotel_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hotel_review_items_hotel_id_idx ON public.hotel_review_items USING btree (hotel_id);


--
-- Name: hotel_review_items_score_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hotel_review_items_score_idx ON public.hotel_review_items USING btree (hotel_id, score DESC);


--
-- Name: hotel_reviews_synced_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hotel_reviews_synced_at_idx ON public.hotel_reviews USING btree (synced_at);


--
-- Name: idx_api_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_logs_created_at ON public.api_logs USING btree (created_at DESC);


--
-- Name: idx_api_logs_errors; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_logs_errors ON public.api_logs USING btree (created_at DESC) WHERE (error_message IS NOT NULL);


--
-- Name: idx_api_logs_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_logs_provider ON public.api_logs USING btree (provider);


--
-- Name: idx_booking_emails_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_emails_booking_id ON public.booking_emails USING btree (booking_id);


--
-- Name: idx_booking_emails_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_emails_status ON public.booking_emails USING btree (status);


--
-- Name: idx_booking_financial_events_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_financial_events_booking_id ON public.booking_financial_events USING btree (booking_id);


--
-- Name: idx_booking_financial_events_transaction_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_financial_events_transaction_id ON public.booking_financial_events USING btree (transaction_id);


--
-- Name: idx_booking_sessions_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_sessions_expires_at ON public.booking_sessions USING btree (expires_at);


--
-- Name: idx_booking_sessions_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_sessions_idempotency ON public.booking_sessions USING btree (idempotency_key, user_id);


--
-- Name: idx_booking_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_sessions_status ON public.booking_sessions USING btree (status);


--
-- Name: idx_booking_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_sessions_user_id ON public.booking_sessions USING btree (user_id);


--
-- Name: idx_bookings_bundle_flight; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_bundle_flight ON public.bookings USING btree (bundled_with_flight_id) WHERE (bundled_with_flight_id IS NOT NULL);


--
-- Name: idx_bookings_payment_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_payment_intent ON public.bookings USING btree (payment_intent_id) WHERE (payment_intent_id IS NOT NULL);


--
-- Name: idx_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);


--
-- Name: idx_bookings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bookings_user_id ON public.bookings USING btree (user_id);


--
-- Name: idx_email_logs_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_booking_id ON public.email_logs USING btree (booking_id);


--
-- Name: idx_email_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_created_at ON public.email_logs USING btree (created_at DESC);


--
-- Name: idx_email_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_status ON public.email_logs USING btree (status);


--
-- Name: idx_flight_booking_notes_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_booking_notes_booking_id ON public.flight_booking_notes USING btree (booking_id);


--
-- Name: idx_flight_bookings_awaiting_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_bookings_awaiting_ticket ON public.flight_bookings USING btree (status, ticket_time_limit) WHERE (status = 'awaiting_ticket'::text);


--
-- Name: idx_flight_bookings_bundle_hotel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_bookings_bundle_hotel ON public.flight_bookings USING btree (bundled_with_hotel_id) WHERE (bundled_with_hotel_id IS NOT NULL);


--
-- Name: idx_flight_bookings_payment_intent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_bookings_payment_intent ON public.flight_bookings USING btree (payment_intent_id) WHERE (payment_intent_id IS NOT NULL);


--
-- Name: idx_flight_bookings_pnr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_bookings_pnr ON public.flight_bookings USING btree (pnr);


--
-- Name: idx_flight_bookings_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_bookings_session_id ON public.flight_bookings USING btree (session_id) WHERE (session_id IS NOT NULL);


--
-- Name: idx_flight_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_bookings_status ON public.flight_bookings USING btree (status);


--
-- Name: idx_flight_bookings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_bookings_user_id ON public.flight_bookings USING btree (user_id);


--
-- Name: idx_flight_results_airline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_results_airline ON public.flight_results_cache USING btree (airline);


--
-- Name: idx_flight_results_price; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_results_price ON public.flight_results_cache USING btree (price);


--
-- Name: idx_flight_results_search_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_results_search_id ON public.flight_results_cache USING btree (search_id);


--
-- Name: idx_flight_search_stats_popularity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_search_stats_popularity ON public.flight_search_stats USING btree (search_count DESC);


--
-- Name: idx_flight_search_stats_route; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_search_stats_route ON public.flight_search_stats USING btree (origin, destination);


--
-- Name: idx_flight_searches_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_searches_date ON public.flight_searches USING btree (departure_date);


--
-- Name: idx_flight_searches_route; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_searches_route ON public.flight_searches USING btree (origin, destination);


--
-- Name: idx_flight_searches_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_searches_user_id ON public.flight_searches USING btree (user_id);


--
-- Name: idx_flight_segments_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flight_segments_booking_id ON public.flight_segments USING btree (booking_id);


--
-- Name: idx_hotel_search_cache_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hotel_search_cache_expires ON public.hotel_search_cache USING btree (expires_at);


--
-- Name: idx_passengers_booking_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passengers_booking_id ON public.passengers USING btree (booking_id);


--
-- Name: idx_policy_snapshot_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_policy_snapshot_booking ON public.booking_policy_snapshots USING btree (booking_id);


--
-- Name: idx_policy_tiers_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_policy_tiers_snapshot ON public.policy_tiers USING btree (snapshot_id, tier_order);


--
-- Name: idx_price_alerts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_alerts_active ON public.price_alerts USING btree (is_active) WHERE is_active;


--
-- Name: idx_price_alerts_route; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_alerts_route ON public.price_alerts USING btree (origin, destination);


--
-- Name: idx_price_alerts_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_price_alerts_user ON public.price_alerts USING btree (user_id);


--
-- Name: idx_profiles_banned_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_banned_at ON public.profiles USING btree (banned_at) WHERE (banned_at IS NOT NULL);


--
-- Name: idx_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);


--
-- Name: idx_refund_logs_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refund_logs_booking ON public.refund_logs USING btree (booking_id);


--
-- Name: idx_refund_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refund_logs_status ON public.refund_logs USING btree (status);


--
-- Name: idx_refund_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refund_logs_user ON public.refund_logs USING btree (user_id);


--
-- Name: idx_saved_trips_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_trips_type ON public.saved_trips USING btree (user_id, type);


--
-- Name: idx_saved_trips_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_saved_trips_user ON public.saved_trips USING btree (user_id);


--
-- Name: idx_sessions_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_expires_at ON public.sessions USING btree (expires_at);


--
-- Name: idx_sessions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user_id ON public.sessions USING btree (user_id);


--
-- Name: idx_src_city_checkin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_src_city_checkin ON public.search_results_cache USING btree (city_name, checkin);


--
-- Name: idx_src_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_src_expires_at ON public.search_results_cache USING btree (expires_at);


--
-- Name: idx_unified_bookings_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_bookings_created ON public.unified_bookings USING btree (created_at DESC);


--
-- Name: idx_unified_bookings_metadata; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_bookings_metadata ON public.unified_bookings USING gin (metadata);


--
-- Name: idx_unified_bookings_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_bookings_provider ON public.unified_bookings USING btree (provider);


--
-- Name: idx_unified_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_bookings_status ON public.unified_bookings USING btree (status);


--
-- Name: idx_unified_bookings_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_bookings_type ON public.unified_bookings USING btree (type);


--
-- Name: idx_unified_bookings_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_bookings_user_id ON public.unified_bookings USING btree (user_id);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role) WHERE (role = 'admin'::text);


--
-- Name: idx_voucher_usage_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voucher_usage_user ON public.voucher_usage USING btree (user_id);


--
-- Name: idx_voucher_usage_voucher; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voucher_usage_voucher ON public.voucher_usage USING btree (voucher_id);


--
-- Name: idx_vouchers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vouchers_active ON public.vouchers USING btree (active, valid_from, valid_until);


--
-- Name: idx_vouchers_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vouchers_code ON public.vouchers USING btree (code);


--
-- Name: idx_weekend_flight_deals_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_weekend_flight_deals_updated_at ON public.weekend_flight_deals USING btree (updated_at DESC);


--
-- Name: rate_limit_counters_reset_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rate_limit_counters_reset_at_idx ON public.rate_limit_counters USING btree (reset_at);


--
-- Name: users on_user_created; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_user_created AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


--
-- Name: admin_settings trg_admin_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_admin_settings_updated_at BEFORE UPDATE ON public.admin_settings FOR EACH ROW EXECUTE FUNCTION public.update_admin_settings_updated_at();


--
-- Name: booking_sessions trg_booking_sessions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_booking_sessions_updated_at BEFORE UPDATE ON public.booking_sessions FOR EACH ROW EXECUTE FUNCTION public.update_booking_sessions_updated_at();


--
-- Name: notifications trg_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.update_notifications_updated_at();


--
-- Name: unified_bookings trg_unified_bookings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_unified_bookings_updated_at BEFORE UPDATE ON public.unified_bookings FOR EACH ROW EXECUTE FUNCTION public.update_unified_bookings_updated_at();


--
-- Name: api_keys api_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: booking_financial_events booking_financial_events_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_financial_events
    ADD CONSTRAINT booking_financial_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.flight_bookings(id) ON DELETE CASCADE;


--
-- Name: booking_policy_snapshots booking_policy_snapshots_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_policy_snapshots
    ADD CONSTRAINT booking_policy_snapshots_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(booking_id) ON DELETE CASCADE;


--
-- Name: bookings bookings_policy_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_policy_snapshot_id_fkey FOREIGN KEY (policy_snapshot_id) REFERENCES public.booking_policy_snapshots(id);


--
-- Name: device_push_tokens device_push_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_push_tokens
    ADD CONSTRAINT device_push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: flight_booking_notes flight_booking_notes_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_booking_notes
    ADD CONSTRAINT flight_booking_notes_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.flight_bookings(id) ON DELETE CASCADE;


--
-- Name: flight_booking_notes flight_booking_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_booking_notes
    ADD CONSTRAINT flight_booking_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: flight_bookings flight_bookings_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_bookings
    ADD CONSTRAINT flight_bookings_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.booking_sessions(id) ON DELETE SET NULL;


--
-- Name: flight_results_cache flight_results_cache_search_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_results_cache
    ADD CONSTRAINT flight_results_cache_search_id_fkey FOREIGN KEY (search_id) REFERENCES public.flight_searches(id) ON DELETE CASCADE;


--
-- Name: flight_searches flight_searches_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_searches
    ADD CONSTRAINT flight_searches_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: flight_segments flight_segments_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.flight_segments
    ADD CONSTRAINT flight_segments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.flight_bookings(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: passengers passengers_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passengers
    ADD CONSTRAINT passengers_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.flight_bookings(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: policy_tiers policy_tiers_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.policy_tiers
    ADD CONSTRAINT policy_tiers_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.booking_policy_snapshots(id) ON DELETE CASCADE;


--
-- Name: price_alerts price_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.price_alerts
    ADD CONSTRAINT price_alerts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refund_logs refund_logs_applied_tier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_logs
    ADD CONSTRAINT refund_logs_applied_tier_id_fkey FOREIGN KEY (applied_tier_id) REFERENCES public.policy_tiers(id);


--
-- Name: refund_logs refund_logs_policy_snapshot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refund_logs
    ADD CONSTRAINT refund_logs_policy_snapshot_id_fkey FOREIGN KEY (policy_snapshot_id) REFERENCES public.booking_policy_snapshots(id);


--
-- Name: saved_trips saved_trips_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saved_trips
    ADD CONSTRAINT saved_trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: voucher_usage voucher_usage_voucher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_usage
    ADD CONSTRAINT voucher_usage_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict dbmate


--
-- Dbmate schema migrations
--

INSERT INTO public.schema_migrations (version) VALUES
    ('20260601000001'),
    ('20260601000002'),
    ('20260601000003'),
    ('20260601000004'),
    ('20260602000001'),
    ('20260602000002'),
    ('20260603000001'),
    ('20260604000001'),
    ('20260605000001'),
    ('20260605000002'),
    ('20260616000001'),
    ('20260616000002'),
    ('20260619000001'),
    ('20260622000001'),
    ('20260626000001'),
    ('20260703000001'),
    ('20260703000002'),
    ('20260717000001'),
    ('20260718000002'),
    ('20260718000003'),
    ('20260728000001'),
    ('20260803000001'),
    ('20260803000002'),
    ('20260805000001'),
    ('20260806000001');
