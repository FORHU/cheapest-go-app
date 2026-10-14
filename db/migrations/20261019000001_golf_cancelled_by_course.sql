-- migrate:up
-- A course that blocks tee times can cancel the bookings sitting on them and refund the customers
-- in full (CONTEXT.md, "Block"). The booking records that the course, not the team, caused it, so
-- settlement with the course can see which refunds were its own doing.

ALTER TABLE public.golf_bookings DROP CONSTRAINT IF EXISTS golf_bookings_close_reason_check;
ALTER TABLE public.golf_bookings ADD CONSTRAINT golf_bookings_close_reason_check
    CHECK (close_reason IS NULL OR close_reason IN (
        'hold_expired', 'declined_by_team', 'not_confirmed_in_time',
        'cancelled_by_customer', 'cancelled_by_team', 'cancelled_by_course'));

-- migrate:down
UPDATE public.golf_bookings SET close_reason = 'cancelled_by_team' WHERE close_reason = 'cancelled_by_course';
ALTER TABLE public.golf_bookings DROP CONSTRAINT IF EXISTS golf_bookings_close_reason_check;
ALTER TABLE public.golf_bookings ADD CONSTRAINT golf_bookings_close_reason_check
    CHECK (close_reason IS NULL OR close_reason IN (
        'hold_expired', 'declined_by_team', 'not_confirmed_in_time',
        'cancelled_by_customer', 'cancelled_by_team'));
