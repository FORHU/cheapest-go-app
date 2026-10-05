-- migrate:up
-- Golf extras (CONTEXT.md, "Golf Booking"): club rental, caddie and cart, priced per item by the
-- course. A hold copies the priced lines onto the booking, so a later price change never
-- changes what a customer was quoted.

CREATE TABLE IF NOT EXISTS public.golf_course_extras (
    course_id  uuid NOT NULL REFERENCES public.golf_courses(id) ON DELETE CASCADE,
    -- Open vocabulary (CONTEXT.md, "Enum field"): a CHECK swap is cheaper than a native enum.
    code       text NOT NULL,
    price      numeric(10,2) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, code),
    CONSTRAINT golf_course_extras_code_check CHECK (code IN ('club_rental', 'caddie', 'cart')),
    CONSTRAINT golf_course_extras_price_check CHECK (price >= 0)
);

CREATE TABLE IF NOT EXISTS public.golf_booking_extras (
    booking_id uuid NOT NULL REFERENCES public.golf_bookings(id) ON DELETE CASCADE,
    code       text NOT NULL,
    quantity   integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total      numeric(10,2) NOT NULL,
    PRIMARY KEY (booking_id, code),
    CONSTRAINT golf_booking_extras_code_check CHECK (code IN ('club_rental', 'caddie', 'cart')),
    CONSTRAINT golf_booking_extras_quantity_check CHECK (quantity BETWEEN 1 AND 4)
);

ALTER TABLE public.golf_bookings ADD COLUMN IF NOT EXISTS extras_total numeric(10,2) NOT NULL DEFAULT 0;

-- migrate:down
ALTER TABLE public.golf_bookings DROP COLUMN IF EXISTS extras_total;
DROP TABLE IF EXISTS public.golf_booking_extras;
DROP TABLE IF EXISTS public.golf_course_extras;
