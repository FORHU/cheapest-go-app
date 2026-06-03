-- Flight schema fixes: add missing columns and update status constraint

-- flight_segments: add cabin_class and segment_index
ALTER TABLE public.flight_segments
    ADD COLUMN IF NOT EXISTS cabin_class text DEFAULT 'economy' NOT NULL,
    ADD COLUMN IF NOT EXISTS segment_index integer DEFAULT 0 NOT NULL;

-- flight_bookings: add duffel_order_id, confirmed_price, confirmed_currency
ALTER TABLE public.flight_bookings
    ADD COLUMN IF NOT EXISTS duffel_order_id text,
    ADD COLUMN IF NOT EXISTS confirmed_price numeric(12,2),
    ADD COLUMN IF NOT EXISTS confirmed_currency text;

-- flight_bookings: add cancelled_provider_missing to status constraint
ALTER TABLE public.flight_bookings
    DROP CONSTRAINT IF EXISTS flight_bookings_status_check;

ALTER TABLE public.flight_bookings
    ADD CONSTRAINT flight_bookings_status_check CHECK ((status = ANY (ARRAY[
        'booked'::text,
        'pnr_created'::text,
        'awaiting_ticket'::text,
        'ticketing'::text,
        'ticketed'::text,
        'failed'::text,
        'cancel_requested'::text,
        'cancel_failed'::text,
        'cancelled'::text,
        'cancelled_provider_missing'::text,
        'refund_pending'::text,
        'refunded'::text,
        'refund_failed'::text
    ])));
