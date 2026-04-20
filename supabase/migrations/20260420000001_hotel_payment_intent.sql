-- Add payment_intent_id to hotel bookings so cancellations can issue Stripe refunds.
ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_payment_intent
    ON public.bookings(payment_intent_id)
    WHERE payment_intent_id IS NOT NULL;
