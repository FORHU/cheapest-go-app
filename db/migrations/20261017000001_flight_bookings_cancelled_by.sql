-- migrate:up
-- Who ended a flight booking: the traveller (pressed Cancel in the app) or the supplier (the order
-- was already cancelled at Duffel, from its dashboard or by the airline, when we looked).
--
-- Kept as a column rather than read back out of cancellation_log's free-text notes: the Trips card
-- states "Cancelled by Duffel" from it, and wording in a log must be free to change.
-- NULL for every booking that was never cancelled, and for cancellations that predate this column
-- whose origin the log does not record.
ALTER TABLE public.flight_bookings
    ADD COLUMN IF NOT EXISTS cancelled_by text;

ALTER TABLE public.flight_bookings DROP CONSTRAINT IF EXISTS flight_bookings_cancelled_by_check;
ALTER TABLE public.flight_bookings ADD CONSTRAINT flight_bookings_cancelled_by_check
    CHECK (cancelled_by IS NULL OR cancelled_by = ANY (ARRAY['traveller'::text, 'supplier'::text]));

-- Cancellations the log already says were found cancelled at Duffel.
UPDATE public.flight_bookings
   SET cancelled_by = 'supplier'
 WHERE cancelled_by IS NULL
   AND cancellation_log::text LIKE '%already cancelled at Duffel%';

-- migrate:down
ALTER TABLE public.flight_bookings DROP CONSTRAINT IF EXISTS flight_bookings_cancelled_by_check;
ALTER TABLE public.flight_bookings DROP COLUMN IF EXISTS cancelled_by;
