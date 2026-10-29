-- migrate:up
-- Pay-first: at most one paying or paid attempt per traveller per Duffel offer.
--
-- /api/flights/book refuses a second attempt while an earlier one is paid or paying, but it
-- checks first and creates afterwards, so two near-simultaneous edited submits can both get a
-- payable hold. This makes the invariant hold at the moment an attempt starts paying: the
-- webhook's authorise step and createBooking's lock (-> 'processing') hit 23505 for the second
-- one, and createBooking releases that hold instead of buying a second ticket.
--
-- quote_hash is set only by the pay-first flow, so legacy sessions are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS booking_sessions_one_paid_attempt_per_offer
    ON public.booking_sessions (user_id, ((flight->'_rawOffer'->>'id')))
    WHERE quote_hash IS NOT NULL
      AND status IN ('payment_authorized', 'processing');

-- migrate:down
DROP INDEX IF EXISTS public.booking_sessions_one_paid_attempt_per_offer;
