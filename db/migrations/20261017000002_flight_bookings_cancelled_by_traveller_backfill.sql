-- migrate:up
-- Completes the backfill of flight_bookings.cancelled_by (20261017000001), which marked only the
-- cancellations whose log said Duffel had already cancelled the order.
--
-- A booking that reached a cancelled state and whose log records the traveller pressing Cancel,
-- with no sign the order was already cancelled at Duffel (those were marked 'supplier' above and are
-- excluded by cancelled_by IS NULL), was ended by the traveller. Bookings with no log entry at all
-- stay NULL: their origin is not recorded anywhere, and the card says only "Refunded" for them.
UPDATE public.flight_bookings
   SET cancelled_by = 'traveller'
 WHERE cancelled_by IS NULL
   AND status IN ('cancelled', 'refund_pending', 'refunded', 'refund_failed')
   AND cancellation_log::text LIKE '%User initiated cancellation%';

-- migrate:down
-- Not reversible by value: after the first migration's backfill there is no way to tell which
-- 'traveller' rows this one set. Leaving the values is harmless (the column simply stays populated).
SELECT 1;
