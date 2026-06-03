-- Add payment_initiated to booking_sessions status constraint
ALTER TABLE public.booking_sessions DROP CONSTRAINT IF EXISTS booking_sessions_status_check;
ALTER TABLE public.booking_sessions ADD CONSTRAINT booking_sessions_status_check CHECK ((status = ANY (ARRAY[
    'pending'::text,
    'initiated'::text,
    'payment_initiated'::text,
    'payment_authorized'::text,
    'processing'::text,
    'booked'::text,
    'failed'::text,
    'expired'::text
])));
