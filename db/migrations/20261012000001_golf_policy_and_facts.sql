-- migrate:up
-- Per-course rules and facts (CONTEXT.md, "Booking window", "Golf Course"): a course sets how far
-- ahead its tee times open and what happens in bad weather, and carries the facts a golfer
-- compares courses by. The weather rule is copied onto each booking at the hold, like the
-- cancellation cutoff, so a customer keeps the rule they agreed to.

ALTER TABLE public.golf_courses
    ADD COLUMN IF NOT EXISTS booking_window_days integer NOT NULL DEFAULT 60,
    ADD COLUMN IF NOT EXISTS weather_policy text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS yardage integer,
    ADD COLUMN IF NOT EXISTS year_opened integer,
    ADD COLUMN IF NOT EXISTS designer text,
    ADD COLUMN IF NOT EXISTS grass text;

ALTER TABLE public.golf_courses
    ADD CONSTRAINT golf_courses_booking_window_check CHECK (booking_window_days BETWEEN 1 AND 90),
    ADD CONSTRAINT golf_courses_weather_policy_check CHECK (char_length(weather_policy) <= 500),
    ADD CONSTRAINT golf_courses_yardage_check CHECK (yardage IS NULL OR yardage BETWEEN 1000 AND 12000),
    ADD CONSTRAINT golf_courses_year_opened_check CHECK (year_opened IS NULL OR year_opened BETWEEN 1800 AND 2100);

ALTER TABLE public.golf_bookings
    ADD COLUMN IF NOT EXISTS weather_policy text NOT NULL DEFAULT '';

-- migrate:down
ALTER TABLE public.golf_bookings DROP COLUMN IF EXISTS weather_policy;
ALTER TABLE public.golf_courses
    DROP CONSTRAINT IF EXISTS golf_courses_booking_window_check,
    DROP CONSTRAINT IF EXISTS golf_courses_weather_policy_check,
    DROP CONSTRAINT IF EXISTS golf_courses_yardage_check,
    DROP CONSTRAINT IF EXISTS golf_courses_year_opened_check;
ALTER TABLE public.golf_courses
    DROP COLUMN IF EXISTS booking_window_days, DROP COLUMN IF EXISTS weather_policy,
    DROP COLUMN IF EXISTS yardage, DROP COLUMN IF EXISTS year_opened,
    DROP COLUMN IF EXISTS designer, DROP COLUMN IF EXISTS grass;
