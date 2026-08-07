-- migrate:up
-- flight_bookings.ticket_numbers is written by /api/internal/create-booking and
-- /api/internal/issue-ticket, but no migration ever created it.
--
-- This failed LATER in the flow than the payment_currency gap, and cost more.
-- By the time create-booking runs, the Duffel order is already placed and paid
-- from our balance and Stripe has already captured. Postgres rejects the whole
-- INSERT over the unknown column, create-booking throws, and the Stripe webhook's
-- catch auto-refunds the customer — but nothing cancels the Duffel order.
--
-- Neither sweep catches the remains: cleanup-orphaned-duffel-orders filters on
-- status IN ('payment_initiated','initiated') and the session is 'failed' by then,
-- and isOrphanedSession() bails when the PaymentIntent succeeded — which it did.
-- So each failure left a real, paid, unowned ticket at the airline.
--
-- text[] rather than jsonb to match booking_sessions.duffel_pre_order_tickets,
-- which already holds exactly this data one step earlier in the same flow. Two
-- representations of one concept is how the code and schema drifted apart in the
-- first place.
ALTER TABLE public.flight_bookings
    ADD COLUMN IF NOT EXISTS ticket_numbers text[];

COMMENT ON COLUMN public.flight_bookings.ticket_numbers IS
    'E-ticket numbers issued for this booking, from the supplier order documents. '
    'Booking-level copy of passengers.ticket_number: passenger rows are inserted '
    'best-effort and can be partially written, so this is the complete record.';

-- migrate:down
ALTER TABLE public.flight_bookings DROP COLUMN IF EXISTS ticket_numbers;
