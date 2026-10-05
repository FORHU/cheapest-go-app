-- migrate:up
-- Tee-time booking for Golf Courses (CONTEXT.md, "Tee Time", "Golf Booking"). Our tee times
-- are not the course's own tee sheet, so a booking is a request until the team confirms it
-- with the course: the card is authorised at checkout and captured on confirmation.

ALTER TABLE public.golf_courses
    ADD COLUMN IF NOT EXISTS timezone text,
    ADD COLUMN IF NOT EXISTS free_cancel_hours integer NOT NULL DEFAULT 48;

ALTER TABLE public.golf_courses
    ADD CONSTRAINT golf_courses_free_cancel_hours_check CHECK (free_cancel_hours BETWEEN 0 AND 720);

CREATE TABLE IF NOT EXISTS public.golf_tee_time_schedules (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
    name             text NOT NULL,
    -- 0 = Sunday … 6 = Saturday, on the course's clock.
    days_of_week     smallint[] NOT NULL,
    first_tee        time NOT NULL,
    last_tee         time NOT NULL,
    interval_minutes integer NOT NULL,
    spots            integer NOT NULL DEFAULT 4,
    price_per_player numeric(10,2) NOT NULL,
    created_at       timestamp with time zone NOT NULL DEFAULT now(),
    updated_at       timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT golf_schedules_days_check
        CHECK (cardinality(days_of_week) > 0 AND days_of_week <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
    CONSTRAINT golf_schedules_tee_range_check CHECK (last_tee >= first_tee),
    CONSTRAINT golf_schedules_interval_check CHECK (interval_minutes BETWEEN 5 AND 60),
    CONSTRAINT golf_schedules_spots_check CHECK (spots BETWEEN 1 AND 4),
    CONSTRAINT golf_schedules_price_check CHECK (price_per_player >= 0)
);

CREATE INDEX IF NOT EXISTS idx_golf_schedules_course ON public.golf_tee_time_schedules (course_id);

CREATE TABLE IF NOT EXISTS public.golf_tee_times (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id        uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
    schedule_id      uuid REFERENCES public.golf_tee_time_schedules(id) ON DELETE SET NULL,
    starts_at        timestamp with time zone NOT NULL,
    spots            integer NOT NULL,
    -- Moved only by the conditional decrement in lib/server/golf/bookings and the releases
    -- beside it, always in the same transaction as the booking status that explains it.
    spots_left       integer NOT NULL,
    price_per_player numeric(10,2) NOT NULL,
    currency         char(3) NOT NULL,
    status           text NOT NULL DEFAULT 'open',
    created_at       timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT golf_tee_times_course_start_key UNIQUE (course_id, starts_at),
    CONSTRAINT golf_tee_times_spots_check CHECK (spots BETWEEN 1 AND 4),
    CONSTRAINT golf_tee_times_spots_left_check CHECK (spots_left BETWEEN 0 AND spots),
    CONSTRAINT golf_tee_times_price_check CHECK (price_per_player >= 0),
    CONSTRAINT golf_tee_times_status_check CHECK (status IN ('open', 'closed'))
);

CREATE TABLE IF NOT EXISTS public.golf_bookings (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference         text NOT NULL,
    user_id           uuid NOT NULL REFERENCES public.users(id),
    course_id         uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE RESTRICT,
    tee_time_id       uuid NOT NULL REFERENCES public.golf_tee_times(id) ON DELETE RESTRICT,
    players           integer NOT NULL,
    lead_name         text NOT NULL,
    contact_email     text NOT NULL,
    price_per_player  numeric(10,2) NOT NULL,
    green_fee_total   numeric(10,2) NOT NULL,
    service_fee       numeric(10,2) NOT NULL,
    total             numeric(10,2) NOT NULL,
    currency          char(3) NOT NULL,
    payment_intent_id text,
    status            text NOT NULL DEFAULT 'held',
    hold_expires_at   timestamp with time zone NOT NULL,
    requested_at      timestamp with time zone,
    decide_by         timestamp with time zone,
    confirmed_at      timestamp with time zone,
    closed_at         timestamp with time zone,
    close_reason      text,
    refund_amount     numeric(10,2) NOT NULL DEFAULT 0,
    -- Recorded when the booking is made, so a later change to the course's rule never
    -- changes what this customer was promised (ADR-0023).
    free_cancel_until timestamp with time zone NOT NULL,
    created_at        timestamp with time zone NOT NULL DEFAULT now(),
    updated_at        timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT golf_bookings_reference_key UNIQUE (reference),
    CONSTRAINT golf_bookings_payment_intent_key UNIQUE (payment_intent_id),
    CONSTRAINT golf_bookings_players_check CHECK (players BETWEEN 1 AND 4),
    CONSTRAINT golf_bookings_status_check
        CHECK (status IN ('held', 'requested', 'confirmed', 'expired', 'declined', 'cancelled')),
    CONSTRAINT golf_bookings_close_reason_check
        CHECK (close_reason IS NULL OR close_reason IN (
            'hold_expired', 'declined_by_team', 'not_confirmed_in_time',
            'cancelled_by_customer', 'cancelled_by_team'))
);

-- One live hold per customer per tee time: a repeated request finds the hold it already has.
CREATE UNIQUE INDEX IF NOT EXISTS uq_golf_bookings_live_hold
    ON public.golf_bookings (user_id, tee_time_id) WHERE status = 'held';
CREATE INDEX IF NOT EXISTS idx_golf_bookings_status_decide_by ON public.golf_bookings (status, decide_by);
CREATE INDEX IF NOT EXISTS idx_golf_bookings_user ON public.golf_bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_golf_bookings_tee_time ON public.golf_bookings (tee_time_id);

ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_email_type_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_email_type_check CHECK (email_type = ANY (ARRAY[
    'confirmation', 'ticketed', 'refund', 'cancellation', 'awaiting_ticket', 'price_alert',
    'support_escalation', 'golf_requested', 'golf_confirmed', 'golf_declined', 'golf_cancelled']));

-- migrate:down
DELETE FROM public.email_logs WHERE email_type LIKE 'golf\_%';
ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_email_type_check;
ALTER TABLE public.email_logs ADD CONSTRAINT email_logs_email_type_check CHECK (email_type = ANY (ARRAY[
    'confirmation', 'ticketed', 'refund', 'cancellation', 'awaiting_ticket', 'price_alert',
    'support_escalation']));
DROP TABLE IF EXISTS public.golf_bookings;
DROP TABLE IF EXISTS public.golf_tee_times;
DROP TABLE IF EXISTS public.golf_tee_time_schedules;
ALTER TABLE public.golf_courses DROP CONSTRAINT IF EXISTS golf_courses_free_cancel_hours_check;
ALTER TABLE public.golf_courses DROP COLUMN IF EXISTS free_cancel_hours, DROP COLUMN IF EXISTS timezone;
