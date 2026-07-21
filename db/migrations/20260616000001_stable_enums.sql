-- migrate:up
-- Convert permanently-fixed CHECK-constrained columns to native Postgres
-- enums for clean Prisma introspection (see docs/adr/0001-prisma-for-introspection-not-migrations.md
-- and CONTEXT.md → "Enum field").
--
-- Deliberately excludes booking_sessions.status, flight_bookings.status,
-- and unified_bookings.status — those value sets are actively extended
-- (already happened twice: 'cancelled_provider_missing', 'payment_initiated')
-- and stay as text + CHECK on purpose.

-- ── passengers.type ─────────────────────────────────────────────────────
CREATE TYPE public.passenger_type AS ENUM ('ADT', 'CHD', 'INF');

ALTER TABLE public.passengers DROP CONSTRAINT IF EXISTS passengers_type_check;
ALTER TABLE public.passengers
    ALTER COLUMN type TYPE public.passenger_type USING type::public.passenger_type;

-- ── saved_trips.type / unified_bookings.type ───────────────────────────
CREATE TYPE public.trip_type AS ENUM ('flight', 'hotel');

ALTER TABLE public.saved_trips DROP CONSTRAINT IF EXISTS saved_trips_type_check;
ALTER TABLE public.saved_trips
    ALTER COLUMN type TYPE public.trip_type USING type::public.trip_type;

ALTER TABLE public.unified_bookings DROP CONSTRAINT IF EXISTS unified_bookings_type_check;
ALTER TABLE public.unified_bookings
    ALTER COLUMN type TYPE public.trip_type USING type::public.trip_type;

-- ── device_push_tokens.platform ─────────────────────────────────────────
CREATE TYPE public.push_platform AS ENUM ('ios', 'android', 'web');

ALTER TABLE public.device_push_tokens ALTER COLUMN platform DROP DEFAULT;
ALTER TABLE public.device_push_tokens DROP CONSTRAINT IF EXISTS device_push_tokens_platform_check;
ALTER TABLE public.device_push_tokens
    ALTER COLUMN platform TYPE public.push_platform USING platform::public.push_platform;
ALTER TABLE public.device_push_tokens ALTER COLUMN platform SET DEFAULT 'ios'::public.push_platform;

-- ── vouchers.discount_type ──────────────────────────────────────────────
CREATE TYPE public.voucher_discount_type AS ENUM ('percent', 'fixed');

ALTER TABLE public.vouchers DROP CONSTRAINT IF EXISTS vouchers_discount_type_check;
ALTER TABLE public.vouchers
    ALTER COLUMN discount_type TYPE public.voucher_discount_type USING discount_type::public.voucher_discount_type;

-- migrate:down

ALTER TABLE public.vouchers ALTER COLUMN discount_type TYPE text;
DROP TYPE IF EXISTS public.voucher_discount_type;

ALTER TABLE public.device_push_tokens ALTER COLUMN platform DROP DEFAULT;
ALTER TABLE public.device_push_tokens ALTER COLUMN platform TYPE text;
ALTER TABLE public.device_push_tokens ALTER COLUMN platform SET DEFAULT 'ios'::text;
DROP TYPE IF EXISTS public.push_platform;

ALTER TABLE public.unified_bookings ALTER COLUMN type TYPE text;
ALTER TABLE public.saved_trips ALTER COLUMN type TYPE text;
DROP TYPE IF EXISTS public.trip_type;

ALTER TABLE public.passengers ALTER COLUMN type TYPE text;
DROP TYPE IF EXISTS public.passenger_type;

-- Note: the original CHECK constraints are not restored by migrate:down.
-- Re-add them manually if a full rollback to the pre-enum schema is needed.
