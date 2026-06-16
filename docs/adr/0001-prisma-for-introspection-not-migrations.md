# Use Prisma only for schema introspection, not migrations

We wanted a way to browse the database schema and data visually. dbmate (the existing migration tool) has no GUI or generated client. We considered switching the migration tool itself to Prisma, but rejected it: the schema relies on 5 plpgsql functions, 4 triggers, a `pg_trgm` GIN index, and CHECK-constrained status columns that have already been altered twice to add new values — none of which Prisma's migration engine can represent or manage. Replacing dbmate would mean re-implementing all of that as hand-written SQL inside Prisma's migration folder anyway, with none of the benefit.

Instead, Prisma is used purely as a read-only introspection layer: `prisma db pull` generates `schema.prisma` from the live database, and Prisma Studio provides a GUI for browsing data. dbmate remains the sole owner of `db/migrations/` and the schema source of truth. `schema.prisma` is a generated artifact, regenerated after each dbmate migration, never hand-edited.

As a follow-up, a small set of permanently-fixed CHECK-constrained columns (`passengers.type`, `saved_trips.type`, `unified_bookings.type`, `device_push_tokens.platform`, `vouchers.discount_type`) were converted to native Postgres enums so they introspect as proper enums in Prisma/Studio. The actively-extended status columns (`booking_sessions.status`, `flight_bookings.status`, `unified_bookings.status`) were deliberately left as `text` + `CHECK`, since native enums make adding a new status value more expensive than a CHECK constraint swap — and that operation has already happened twice in this schema's history.

## Considered Options

- **Switch migrations to Prisma entirely** — rejected; Prisma can't manage functions/triggers/partial indexes already in use, so dbmate would still be needed underneath.
- **Convert all CHECK-constrained columns to native enums** — rejected for status columns specifically; their value sets are known to grow, and native enum evolution is more ceremony than a CHECK constraint edit.

## Consequences

- `schema.prisma` must be regenerated (`prisma db pull`) after every dbmate migration or it will drift from the real schema.
- Status fields will continue to render as plain strings (not enums) in Prisma Studio — this is intentional, not a gap.
