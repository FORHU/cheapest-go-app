-- migrate:up
-- Duffel flights: authorise the card first, then buy the ticket (ADR-0050).
--
-- confirmed_price: the bare fare the traveller last accepted. Kept on the session so the order
--   can be placed after authorisation under the same tolerance rule /book applies.
-- failure: why a session ended without a booking, as the traveller should be told it:
--   { "errorCode": "...", "priceChange": { "oldPrice": n, "newPrice": n, "currency": "..." } }.
--   NULL for every session that predates this column.
-- 'ordering': the session is claimed by the path that is placing the Duffel order.
ALTER TABLE public.booking_sessions
    ADD COLUMN IF NOT EXISTS confirmed_price numeric,
    ADD COLUMN IF NOT EXISTS failure jsonb;

ALTER TABLE public.booking_sessions DROP CONSTRAINT IF EXISTS booking_sessions_status_check;
ALTER TABLE public.booking_sessions ADD CONSTRAINT booking_sessions_status_check CHECK ((status = ANY (ARRAY[
    'pending'::text, 'initiated'::text, 'payment_initiated'::text, 'payment_authorized'::text,
    'ordering'::text, 'processing'::text, 'booked'::text, 'failed'::text, 'expired'::text
])));

-- migrate:down
UPDATE public.booking_sessions SET status = 'processing' WHERE status = 'ordering';
ALTER TABLE public.booking_sessions DROP CONSTRAINT IF EXISTS booking_sessions_status_check;
ALTER TABLE public.booking_sessions ADD CONSTRAINT booking_sessions_status_check CHECK ((status = ANY (ARRAY[
    'pending'::text, 'initiated'::text, 'payment_initiated'::text, 'payment_authorized'::text,
    'processing'::text, 'booked'::text, 'failed'::text, 'expired'::text
])));
ALTER TABLE public.booking_sessions
    DROP COLUMN IF EXISTS failure,
    DROP COLUMN IF EXISTS confirmed_price;
