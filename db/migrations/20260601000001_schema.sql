-- migrate:up

-- ── Extensions ────────────────────────────────────────────────────────────────
-- pg_trgm: required for fuzzy hotel name search index (etg_hotel_index_name_trgm)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Custom types ──────────────────────────────────────────────────────────────

CREATE TYPE public.booking_policy_type AS ENUM (
    'free_cancellation',
    'non_refundable',
    'partial_refund',
    'tiered'
);

CREATE TYPE public.refund_status AS ENUM (
    'pending',
    'approved',
    'processed',
    'rejected',
    'failed'
);

-- ── Tables ────────────────────────────────────────────────────────────────────

CREATE TABLE public.admin_settings (
    key text NOT NULL,
    value jsonb DEFAULT '""'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

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
    CONSTRAINT booking_sessions_policy_version_check CHECK ((policy_version = ANY (ARRAY['search'::text, 'revalidated'::text]))),
    CONSTRAINT booking_sessions_provider_check CHECK ((provider = ANY (ARRAY['mystifly'::text, 'mystifly_v2'::text, 'duffel'::text, 'legacy_amadeus'::text]))),
    CONSTRAINT booking_sessions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'initiated'::text, 'payment_authorized'::text, 'processing'::text, 'booked'::text, 'failed'::text, 'expired'::text])))
);

COMMENT ON COLUMN public.booking_sessions.policy_version IS '''search'' = indicative, ''revalidated'' = locked pre-payment.';
COMMENT ON COLUMN public.booking_sessions.policy_locked IS 'TRUE after revalidation confirms policy. Payment must be blocked until TRUE.';

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
    hotel_id text
);

CREATE TABLE public.dest_code_cache (
    city_key text NOT NULL,
    dest_codes text[] DEFAULT '{}'::text[] NOT NULL,
    hotel_codes text[] DEFAULT '{}'::text[] NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

CREATE TABLE public.device_push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    expo_push_token text NOT NULL,
    platform text DEFAULT 'ios'::text,
    app_version text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT device_push_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])))
);

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

CREATE TABLE public.etg_index_status (
    country_code character(2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    hotel_count integer DEFAULT 0,
    last_seeded_at timestamp with time zone,
    last_error text
);

CREATE TABLE public.flight_booking_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    note text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid
);

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
    CONSTRAINT flight_bookings_status_check CHECK ((status = ANY (ARRAY['booked'::text, 'pnr_created'::text, 'awaiting_ticket'::text, 'ticketing'::text, 'ticketed'::text, 'failed'::text, 'cancel_requested'::text, 'cancel_failed'::text, 'cancelled'::text, 'refund_pending'::text, 'refunded'::text, 'refund_failed'::text]))),
    CONSTRAINT flight_bookings_trip_type_check CHECK ((trip_type = ANY (ARRAY['one-way'::text, 'round-trip'::text, 'multi-city'::text]))),
    CONSTRAINT flight_bookings_provider_check CHECK ((provider = ANY (ARRAY['amadeus'::text, 'legacy_amadeus'::text, 'mystifly'::text, 'mystifly_v2'::text, 'duffel'::text]))),
    CONSTRAINT refund_amount_required CHECK (((status <> 'refunded'::text) OR (refund_amount IS NOT NULL)))
);

COMMENT ON COLUMN public.flight_bookings.currency IS 'ISO 4217 currency code';
COMMENT ON COLUMN public.flight_bookings.cancellation_requested_at IS 'Set immediately on cancel request — prevents duplicate supplier calls.';
COMMENT ON COLUMN public.flight_bookings.cancellation_log IS 'Append-only log of each state transition: [{at,oldStatus,newStatus,supplierResponse}]';
COMMENT ON COLUMN public.flight_bookings.supplier_cost IS 'Confirmed fare charged by the provider (Duffel balance / Mystifly deduction)';
COMMENT ON COLUMN public.flight_bookings.charged_price IS 'Amount the customer was charged (Stripe capture amount)';
COMMENT ON COLUMN public.flight_bookings.markup_pct IS 'Decimal markup rate applied at booking time';

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

CREATE TABLE public.flight_search_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    origin text NOT NULL,
    destination text NOT NULL,
    min_price numeric(12,2),
    avg_price numeric(12,2),
    search_count integer DEFAULT 1,
    last_searched_at timestamp with time zone DEFAULT now()
);

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

CREATE TABLE public.flight_segments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    airline text NOT NULL,
    flight_number text NOT NULL,
    origin text NOT NULL,
    destination text NOT NULL,
    departure timestamp with time zone NOT NULL,
    arrival timestamp with time zone NOT NULL,
    itinerary_index integer DEFAULT 0 NOT NULL
);

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
    google_enriched_at timestamp with time zone
);

CREATE TABLE public.hotel_review_items (
    id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
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

CREATE TABLE public.hotel_reviews (
    hotel_id text NOT NULL,
    rating numeric(4,2),
    reviews_count integer DEFAULT 0 NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);

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

CREATE TABLE public.passengers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    type text NOT NULL,
    passport text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ticket_number text,
    seat_number text,
    CONSTRAINT passengers_type_check CHECK ((type = ANY (ARRAY['ADT'::text, 'CHD'::text, 'INF'::text])))
);

CREATE TABLE public.place_cache (
    place_id text NOT NULL,
    data jsonb NOT NULL,
    cached_at timestamp with time zone DEFAULT now() NOT NULL
);

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

CREATE TABLE public.popular_destinations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    city text NOT NULL,
    country text NOT NULL,
    image_url text,
    average_price numeric(10,2),
    created_at timestamp with time zone DEFAULT now()
);

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

-- profiles.id FK to users is added in migration 002 after users table is created
CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    phone text,
    avatar_url text,
    nationality text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    role text DEFAULT 'user'::text,
    banned_at timestamp with time zone,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE public.rate_limit_counters (
    key text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    reset_at timestamp with time zone NOT NULL
);

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

CREATE TABLE public.saved_trips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    subtitle text,
    price numeric(12,2),
    currency text DEFAULT 'USD'::text NOT NULL,
    image_url text,
    deep_link text NOT NULL,
    snapshot jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT saved_trips_type_check CHECK ((type = ANY (ARRAY['flight'::text, 'hotel'::text])))
);

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

CREATE TABLE public.travel_styles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    location text NOT NULL,
    price numeric(10,2) NOT NULL,
    image_url text,
    category text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.unified_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
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
    CONSTRAINT unified_bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'ticketed'::text, 'cancelled'::text, 'refunded'::text, 'failed'::text, 'expired'::text, 'awaiting_ticket'::text, 'booked'::text]))),
    CONSTRAINT unified_bookings_type_check CHECK ((type = ANY (ARRAY['flight'::text, 'hotel'::text])))
);

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

CREATE TABLE public.vouchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    discount_type text NOT NULL,
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
    CONSTRAINT vouchers_discount_type_check CHECK ((discount_type = ANY (ARRAY['percent'::text, 'fixed'::text]))),
    CONSTRAINT vouchers_discount_value_check CHECK ((discount_value > (0)::numeric))
);

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
    created_at timestamp with time zone DEFAULT now()
);

-- Tables referenced in app code but not in Supabase migrations
CREATE TABLE public.stripe_processed_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    event_type text,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.admin_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action text NOT NULL,
    admin_id uuid,
    admin_email text,
    target_id text,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ── Primary keys ──────────────────────────────────────────────────────────────

ALTER TABLE ONLY public.admin_settings         ADD CONSTRAINT admin_settings_pkey PRIMARY KEY (key);
ALTER TABLE ONLY public.api_keys               ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.api_keys               ADD CONSTRAINT api_keys_key_hash_key UNIQUE (key_hash);
ALTER TABLE ONLY public.api_logs               ADD CONSTRAINT api_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.booking_emails         ADD CONSTRAINT booking_emails_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.booking_financial_events ADD CONSTRAINT booking_financial_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.booking_policy_snapshots ADD CONSTRAINT booking_policy_snapshots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.booking_policy_snapshots ADD CONSTRAINT uq_policy_per_booking UNIQUE (booking_id);
ALTER TABLE ONLY public.booking_sessions       ADD CONSTRAINT booking_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bookings               ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.bookings               ADD CONSTRAINT bookings_booking_id_key UNIQUE (booking_id);
ALTER TABLE ONLY public.dest_code_cache        ADD CONSTRAINT dest_code_cache_pkey PRIMARY KEY (city_key);
ALTER TABLE ONLY public.device_push_tokens     ADD CONSTRAINT device_push_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_logs             ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.etg_hotel_index        ADD CONSTRAINT etg_hotel_index_pkey PRIMARY KEY (hid);
ALTER TABLE ONLY public.etg_index_status       ADD CONSTRAINT etg_index_status_pkey PRIMARY KEY (country_code);
ALTER TABLE ONLY public.flight_booking_notes   ADD CONSTRAINT flight_booking_notes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.flight_bookings        ADD CONSTRAINT flight_bookings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.flight_deals           ADD CONSTRAINT flight_deals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.flight_results_cache   ADD CONSTRAINT flight_results_cache_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.flight_search_stats    ADD CONSTRAINT flight_search_stats_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.flight_search_stats    ADD CONSTRAINT flight_search_stats_origin_destination_key UNIQUE (origin, destination);
ALTER TABLE ONLY public.flight_searches        ADD CONSTRAINT flight_searches_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.flight_segments        ADD CONSTRAINT flight_segments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.hotel_content          ADD CONSTRAINT hotel_content_pkey PRIMARY KEY (hotel_id);
ALTER TABLE ONLY public.hotel_review_items     ADD CONSTRAINT hotel_review_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.hotel_review_items     ADD CONSTRAINT hotel_review_items_hotel_id_source_id_key UNIQUE (hotel_id, source_id);
ALTER TABLE ONLY public.hotel_reviews          ADD CONSTRAINT hotel_reviews_pkey PRIMARY KEY (hotel_id);
ALTER TABLE ONLY public.notifications          ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.onda_properties        ADD CONSTRAINT onda_properties_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.passengers             ADD CONSTRAINT passengers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.place_cache            ADD CONSTRAINT place_cache_pkey PRIMARY KEY (place_id);
ALTER TABLE ONLY public.policy_tiers           ADD CONSTRAINT policy_tiers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.policy_tiers           ADD CONSTRAINT uq_tier_order UNIQUE (snapshot_id, tier_order);
ALTER TABLE ONLY public.popular_destinations   ADD CONSTRAINT popular_destinations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.price_alerts           ADD CONSTRAINT price_alerts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles               ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.rate_limit_counters    ADD CONSTRAINT rate_limit_counters_pkey PRIMARY KEY (key);
ALTER TABLE ONLY public.refund_logs            ADD CONSTRAINT refund_logs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.saved_trips            ADD CONSTRAINT saved_trips_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.search_results_cache   ADD CONSTRAINT search_results_cache_pkey PRIMARY KEY (cache_key);
ALTER TABLE ONLY public.stripe_processed_events ADD CONSTRAINT stripe_processed_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.stripe_processed_events ADD CONSTRAINT stripe_processed_events_event_id_key UNIQUE (event_id);
ALTER TABLE ONLY public.admin_audit_log        ADD CONSTRAINT admin_audit_log_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.travel_styles          ADD CONSTRAINT travel_styles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.unified_bookings       ADD CONSTRAINT unified_bookings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.unique_stays           ADD CONSTRAINT unique_stays_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.voucher_usage          ADD CONSTRAINT voucher_usage_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vouchers               ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.vouchers               ADD CONSTRAINT vouchers_code_key UNIQUE (code);
ALTER TABLE ONLY public.weekend_flight_deals   ADD CONSTRAINT weekend_flight_deals_pkey PRIMARY KEY (id);

-- ── Foreign keys (between public tables only) ─────────────────────────────────
-- FKs to public.users are added in migration 002 after users table is created.

ALTER TABLE ONLY public.booking_financial_events
    ADD CONSTRAINT booking_financial_events_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.flight_bookings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.booking_policy_snapshots
    ADD CONSTRAINT booking_policy_snapshots_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(booking_id) ON DELETE CASCADE;

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_policy_snapshot_id_fkey FOREIGN KEY (policy_snapshot_id) REFERENCES public.booking_policy_snapshots(id);

ALTER TABLE ONLY public.flight_booking_notes
    ADD CONSTRAINT flight_booking_notes_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.flight_bookings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flight_bookings
    ADD CONSTRAINT flight_bookings_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.booking_sessions(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.flight_results_cache
    ADD CONSTRAINT flight_results_cache_search_id_fkey FOREIGN KEY (search_id) REFERENCES public.flight_searches(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.flight_segments
    ADD CONSTRAINT flight_segments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.flight_bookings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.passengers
    ADD CONSTRAINT passengers_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.flight_bookings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.policy_tiers
    ADD CONSTRAINT policy_tiers_snapshot_id_fkey FOREIGN KEY (snapshot_id) REFERENCES public.booking_policy_snapshots(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.refund_logs
    ADD CONSTRAINT refund_logs_applied_tier_id_fkey FOREIGN KEY (applied_tier_id) REFERENCES public.policy_tiers(id);

ALTER TABLE ONLY public.refund_logs
    ADD CONSTRAINT refund_logs_policy_snapshot_id_fkey FOREIGN KEY (policy_snapshot_id) REFERENCES public.booking_policy_snapshots(id);

ALTER TABLE ONLY public.voucher_usage
    ADD CONSTRAINT voucher_usage_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id) ON DELETE CASCADE;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX api_keys_key_hash_idx ON public.api_keys USING btree (key_hash) WHERE (is_active = true);
CREATE INDEX api_keys_user_id_idx ON public.api_keys USING btree (user_id);
CREATE INDEX dest_code_cache_expires_at_idx ON public.dest_code_cache USING btree (expires_at);
CREATE UNIQUE INDEX device_push_tokens_token_idx ON public.device_push_tokens USING btree (expo_push_token);
CREATE INDEX device_push_tokens_user_idx ON public.device_push_tokens USING btree (user_id);
CREATE INDEX etg_hotel_index_country_name ON public.etg_hotel_index USING btree (country_code, name_normalized);
CREATE INDEX etg_hotel_index_name_trgm ON public.etg_hotel_index USING gin (name_normalized gin_trgm_ops);
CREATE INDEX hotel_content_fetched_at_idx ON public.hotel_content USING btree (fetched_at);
CREATE INDEX hotel_content_google_enriched_idx ON public.hotel_content USING btree (google_enriched_at) WHERE ((lat <> (0)::double precision) AND (lng <> (0)::double precision));
CREATE INDEX hotel_content_ratehawk_hid_idx ON public.hotel_content USING btree (ratehawk_hid) WHERE (ratehawk_hid IS NOT NULL);
CREATE INDEX hotel_review_items_hotel_id_idx ON public.hotel_review_items USING btree (hotel_id);
CREATE INDEX hotel_review_items_score_idx ON public.hotel_review_items USING btree (hotel_id, score DESC);
CREATE INDEX hotel_reviews_synced_at_idx ON public.hotel_reviews USING btree (synced_at);
CREATE INDEX idx_api_logs_created_at ON public.api_logs USING btree (created_at DESC);
CREATE INDEX idx_api_logs_errors ON public.api_logs USING btree (created_at DESC) WHERE (error_message IS NOT NULL);
CREATE INDEX idx_api_logs_provider ON public.api_logs USING btree (provider);
CREATE INDEX idx_booking_emails_booking_id ON public.booking_emails USING btree (booking_id);
CREATE INDEX idx_booking_emails_status ON public.booking_emails USING btree (status);
CREATE INDEX idx_booking_financial_events_booking_id ON public.booking_financial_events USING btree (booking_id);
CREATE INDEX idx_booking_financial_events_transaction_id ON public.booking_financial_events USING btree (transaction_id);
CREATE INDEX idx_booking_sessions_expires_at ON public.booking_sessions USING btree (expires_at);
CREATE INDEX idx_booking_sessions_idempotency ON public.booking_sessions USING btree (idempotency_key, user_id);
CREATE INDEX idx_booking_sessions_status ON public.booking_sessions USING btree (status);
CREATE INDEX idx_booking_sessions_user_id ON public.booking_sessions USING btree (user_id);
CREATE INDEX idx_bookings_bundle_flight ON public.bookings USING btree (bundled_with_flight_id) WHERE (bundled_with_flight_id IS NOT NULL);
CREATE INDEX idx_bookings_payment_intent ON public.bookings USING btree (payment_intent_id) WHERE (payment_intent_id IS NOT NULL);
CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);
CREATE INDEX idx_bookings_user_id ON public.bookings USING btree (user_id);
CREATE INDEX idx_email_logs_booking_id ON public.email_logs USING btree (booking_id);
CREATE INDEX idx_email_logs_created_at ON public.email_logs USING btree (created_at DESC);
CREATE INDEX idx_email_logs_status ON public.email_logs USING btree (status);
CREATE INDEX idx_flight_booking_notes_booking_id ON public.flight_booking_notes USING btree (booking_id);
CREATE INDEX idx_flight_bookings_awaiting_ticket ON public.flight_bookings USING btree (status, ticket_time_limit) WHERE (status = 'awaiting_ticket'::text);
CREATE INDEX idx_flight_bookings_bundle_hotel ON public.flight_bookings USING btree (bundled_with_hotel_id) WHERE (bundled_with_hotel_id IS NOT NULL);
CREATE INDEX idx_flight_bookings_payment_intent ON public.flight_bookings USING btree (payment_intent_id) WHERE (payment_intent_id IS NOT NULL);
CREATE INDEX idx_flight_bookings_pnr ON public.flight_bookings USING btree (pnr);
CREATE INDEX idx_flight_bookings_session_id ON public.flight_bookings USING btree (session_id) WHERE (session_id IS NOT NULL);
CREATE INDEX idx_flight_bookings_status ON public.flight_bookings USING btree (status);
CREATE INDEX idx_flight_bookings_user_id ON public.flight_bookings USING btree (user_id);
CREATE INDEX idx_flight_results_airline ON public.flight_results_cache USING btree (airline);
CREATE INDEX idx_flight_results_price ON public.flight_results_cache USING btree (price);
CREATE INDEX idx_flight_results_search_id ON public.flight_results_cache USING btree (search_id);
CREATE INDEX idx_flight_search_stats_popularity ON public.flight_search_stats USING btree (search_count DESC);
CREATE INDEX idx_flight_search_stats_route ON public.flight_search_stats USING btree (origin, destination);
CREATE INDEX idx_flight_searches_date ON public.flight_searches USING btree (departure_date);
CREATE INDEX idx_flight_searches_route ON public.flight_searches USING btree (origin, destination);
CREATE INDEX idx_flight_searches_user_id ON public.flight_searches USING btree (user_id);
CREATE INDEX idx_flight_segments_booking_id ON public.flight_segments USING btree (booking_id);
CREATE INDEX idx_passengers_booking_id ON public.passengers USING btree (booking_id);
CREATE INDEX idx_policy_snapshot_booking ON public.booking_policy_snapshots USING btree (booking_id);
CREATE INDEX idx_policy_tiers_snapshot ON public.policy_tiers USING btree (snapshot_id, tier_order);
CREATE INDEX idx_price_alerts_active ON public.price_alerts USING btree (is_active) WHERE is_active;
CREATE INDEX idx_price_alerts_route ON public.price_alerts USING btree (origin, destination);
CREATE INDEX idx_price_alerts_user ON public.price_alerts USING btree (user_id);
CREATE INDEX idx_profiles_banned_at ON public.profiles USING btree (banned_at) WHERE (banned_at IS NOT NULL);
CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);
CREATE INDEX idx_refund_logs_booking ON public.refund_logs USING btree (booking_id);
CREATE INDEX idx_refund_logs_status ON public.refund_logs USING btree (status);
CREATE INDEX idx_refund_logs_user ON public.refund_logs USING btree (user_id);
CREATE INDEX idx_saved_trips_type ON public.saved_trips USING btree (user_id, type);
CREATE INDEX idx_saved_trips_user ON public.saved_trips USING btree (user_id);
CREATE INDEX idx_src_city_checkin ON public.search_results_cache USING btree (city_name, checkin);
CREATE INDEX idx_src_expires_at ON public.search_results_cache USING btree (expires_at);
CREATE INDEX idx_unified_bookings_created ON public.unified_bookings USING btree (created_at DESC);
CREATE INDEX idx_unified_bookings_metadata ON public.unified_bookings USING gin (metadata);
CREATE INDEX idx_unified_bookings_provider ON public.unified_bookings USING btree (provider);
CREATE INDEX idx_unified_bookings_status ON public.unified_bookings USING btree (status);
CREATE INDEX idx_unified_bookings_type ON public.unified_bookings USING btree (type);
CREATE INDEX idx_unified_bookings_user_id ON public.unified_bookings USING btree (user_id);
CREATE INDEX idx_voucher_usage_user ON public.voucher_usage USING btree (user_id);
CREATE INDEX idx_voucher_usage_voucher ON public.voucher_usage USING btree (voucher_id);
CREATE INDEX idx_vouchers_active ON public.vouchers USING btree (active, valid_from, valid_until);
CREATE INDEX idx_vouchers_code ON public.vouchers USING btree (code);
CREATE INDEX rate_limit_counters_reset_at_idx ON public.rate_limit_counters USING btree (reset_at);

-- ── Functions ─────────────────────────────────────────────────────────────────

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

CREATE FUNCTION public.update_admin_settings_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE FUNCTION public.update_booking_sessions_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE FUNCTION public.update_notifications_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE FUNCTION public.update_unified_bookings_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

-- ── Triggers ──────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_admin_settings_updated_at
    BEFORE UPDATE ON public.admin_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_admin_settings_updated_at();

CREATE TRIGGER trg_booking_sessions_updated_at
    BEFORE UPDATE ON public.booking_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_booking_sessions_updated_at();

CREATE TRIGGER trg_notifications_updated_at
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.update_notifications_updated_at();

CREATE TRIGGER trg_unified_bookings_updated_at
    BEFORE UPDATE ON public.unified_bookings
    FOR EACH ROW EXECUTE FUNCTION public.update_unified_bookings_updated_at();

-- migrate:down
-- Run manually if needed: DROP SCHEMA public CASCADE; CREATE SCHEMA public;
