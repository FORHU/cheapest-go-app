-- migrate:up
-- A reference of ours on every sale, so money can be attributed to this platform.
--
-- FORHU Inc settles several products into one Stripe account, and Stripe pays out daily as
-- a single pooled deposit — the bank line cannot be split by any per-charge field. So
-- attribution has to happen inside Stripe, and that needs an identifier naming the platform.
--
-- What existed before this migration:
--
--   flight_bookings   pnr           the AIRLINE's record locator (CG2MTN) — not ours,
--                                   not unique to us, and unchangeable. Admin displayed
--                                   it under a column headed "REF / PNR".
--   bookings          booking_id    FORHU-<millis>-<rand>. Names the company that owns
--                                   the Stripe account — the one thing every project
--                                   shares — so it identified nothing.
--   unified_bookings  external_id   the SUPPLIER's id.
--
-- None of the three answered "which project did this money come from". The new column does:
-- CG-XXXXXX for CheapestGo, GG-XXXXXX for GeomeeGo, with the prefix derived from
-- source_brand at mint time so the two cannot disagree.
--
-- Nullable, because rows created before this exist and cannot be given a reference that
-- was never sent to Stripe. Backfilling one would invent an identifier that appears on no
-- charge, which is worse than an honest NULL.

ALTER TABLE bookings         ADD COLUMN IF NOT EXISTS booking_reference text;
ALTER TABLE flight_bookings  ADD COLUMN IF NOT EXISTS booking_reference text;
ALTER TABLE unified_bookings ADD COLUMN IF NOT EXISTS booking_reference text;

-- Partial, so the pre-existing NULL rows do not collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_booking_reference_key
    ON bookings (booking_reference) WHERE booking_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS flight_bookings_booking_reference_key
    ON flight_bookings (booking_reference) WHERE booking_reference IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS unified_bookings_booking_reference_key
    ON unified_bookings (booking_reference) WHERE booking_reference IS NOT NULL;

-- Carried on the session so the flight flow can mint before the charge and still have the
-- same value when the booking row is written after payment.
ALTER TABLE booking_sessions ADD COLUMN IF NOT EXISTS booking_reference text;

-- migrate:down
DROP INDEX IF EXISTS bookings_booking_reference_key;
DROP INDEX IF EXISTS flight_bookings_booking_reference_key;
DROP INDEX IF EXISTS unified_bookings_booking_reference_key;
ALTER TABLE bookings         DROP COLUMN IF EXISTS booking_reference;
ALTER TABLE flight_bookings  DROP COLUMN IF EXISTS booking_reference;
ALTER TABLE unified_bookings DROP COLUMN IF EXISTS booking_reference;
ALTER TABLE booking_sessions DROP COLUMN IF EXISTS booking_reference;
