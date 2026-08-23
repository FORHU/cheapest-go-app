-- Claim-then-commit for Stripe webhook deduplication.
--
-- The handler inserted a row into stripe_processed_events BEFORE doing the work
-- the event describes. That prevents concurrent duplicate deliveries, but it
-- also means a delivery that dies part-way — a platform timeout mid-booking —
-- leaves the event marked processed forever, so Stripe's retry is discarded as
-- a duplicate and nobody ever finishes the booking.
--
-- `completed_at` splits the two meanings apart: the row is the claim, and the
-- timestamp is the receipt. A retry of an event that was claimed but never
-- completed is now allowed to proceed.
ALTER TABLE public.stripe_processed_events
    ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

-- Everything already in the table predates this column and did complete —
-- backfill from processed_at so old events stay deduplicated.
UPDATE public.stripe_processed_events
SET completed_at = processed_at
WHERE completed_at IS NULL;
