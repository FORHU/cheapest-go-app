-- Add bag_service_ids and bag_total to booking_sessions so that
-- selected bag ancillaries can be replayed when a webhook is delayed
-- or the fallback confirm path is used (mirrors seat_service_ids pattern).

ALTER TABLE public.booking_sessions
    ADD COLUMN IF NOT EXISTS bag_service_ids text[],
    ADD COLUMN IF NOT EXISTS bag_total       numeric DEFAULT 0;
