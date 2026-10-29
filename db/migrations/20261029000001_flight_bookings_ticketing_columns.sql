-- migrate:up
-- The two columns the ticketing step writes, which reached `prisma/schema.prisma` without a
-- migration — so every database built from this directory, production included, is missing them.
--
-- The blast radius is wider than the admin screen that surfaced it. `flight_bookings.findMany`
-- with no explicit `select` names every column in the model, so any read of a flight booking
-- through Prisma failed with P2022 — `/trips` among them, which is where a customer looks for
-- the flight they just paid for. The ticketing UPDATE in `internal.route.ts` sets both columns in
-- one statement, so issuing a ticket failed as well, after the card had already been authorised.
--
-- `IF NOT EXISTS` because a development database built with `prisma db push` already has them,
-- which is exactly why this went unnoticed locally.
ALTER TABLE public.flight_bookings
    ADD COLUMN IF NOT EXISTS ticket_numbers jsonb DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS ticketed_at    timestamptz(6);

-- migrate:down
ALTER TABLE public.flight_bookings
    DROP COLUMN IF EXISTS ticketed_at,
    DROP COLUMN IF EXISTS ticket_numbers;
