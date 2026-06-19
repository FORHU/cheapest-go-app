# CheapestGo — Domain Glossary

## Deployment

**Coolify** — self-hosted deployment platform running the Next.js app as a persistent Docker container. Not serverless. Connection pools are shared across requests within one process.

**Dev environment** — Docker Compose with PostgreSQL 17 + pgAdmin 4. Local only. pgAdmin available at `http://localhost:5050` (admin@cheapestgo.local / cheapestgo).

**Production database** — AWS RDS PostgreSQL (provisioning in progress). Connect via `DATABASE_URL` env var.

**Migration tool** — dbmate. Reads `DATABASE_URL`, runs `.sql` files from `db/migrations/` in timestamp order. Run `npx dbmate up` to apply. dbmate is the schema source of truth — see **Prisma** below for why a second migration tool was deliberately rejected.

**Prisma** — used only as a read-only introspection layer (`prisma db pull` + Prisma Studio) for browsing the schema and data. Not a migration tool here: dbmate owns `db/migrations/`, and `schema.prisma` is a generated, re-derivable artifact, never hand-edited.
_Avoid_: running `prisma migrate`, treating `schema.prisma` as authoritative.

## Database

**PostgreSQL** — the only database. Both dev (Docker) and prod (AWS RDS) are standard PostgreSQL. No Supabase infrastructure.

**DATABASE_URL** — the single connection string used by the app and dbmate. Format: `postgresql://user:password@host:5432/database`.

**No RLS** — Row Level Security is not used. Security is enforced at the API layer (every route validates the session before querying). The database is not publicly accessible. This was *not* true until `20260616000002_disable_legacy_rls.sql`: 41 tables had leftover Supabase RLS enabled (default-deny, plus 2 always-deny policies on `device_push_tokens`/`search_results_cache`), masked only because the app's DB role had `BYPASSRLS`. It was inert in every environment that existed, but would have silently broken core booking flows the moment a least-privilege production role was provisioned. See [ADR-0002](docs/adr/0002-remove-legacy-rls.md).

**Schema** — fully defined in `db/migrations/` (13 migration files as of 2026-06-16). Verified to bootstrap an identical 51-table schema from a genuinely empty database via `dbmate up` alone — this was *not* true before: 6 files were missing dbmate's `-- migrate:up` marker (they were written to be run by hand via psql/pgAdmin), and `hotel_deals`, `hotel_search_cache`, `tgx_destination_cache` existed in the live database but were never created by any migration. Both gaps are fixed (`20260601000003_hotel_deals.sql`, `20260601000004_hotel_search_caches.sql`, and markers added to the 6 files).

**Enum field** — a column with a fixed value set. Two mechanisms coexist by design, not by accident:
- *Closed vocabulary* (native Postgres `CREATE TYPE ... AS ENUM`) — used where the value set is permanently fixed: `passengers.type`, `saved_trips.type`, `unified_bookings.type`, `device_push_tokens.platform`, `vouchers.discount_type`.
- *Open vocabulary* (`text` + `CHECK` constraint) — used where the value set is actively extended: `booking_sessions.status`, `flight_bookings.status`, `unified_bookings.status`. These have already had values added twice via migration (`cancelled_provider_missing`, `payment_initiated`); a CHECK swap is cheaper than recreating a native enum type.
_Avoid_: assuming every enum-like column uses the same mechanism, or converting status columns to native enums for cosmetic reasons.

## Auth

**Session** — a Lucia-managed row in the `sessions` table. Stored as a cookie (`cg-session`). Replaces Supabase Auth JWTs.

**User** — a row in `public.users`. Replaces `auth.users`. Password hashed with argon2id. `users.role` is the authoritative source for authorization — all role checks read from this column via the Lucia session. See [ADR-0003](docs/adr/0003-users-role-is-authoritative.md).

**Profile** — a row in `public.profiles` auto-created by the `on_user_created` trigger on `public.users`. Replaces the Supabase `on_auth_user_created` trigger on `auth.users`. Does not carry `role` — use `users.role` for all authorization checks.

## Booking

**Edge Function** → **API Route** — all 47 Deno functions formerly hosted on Supabase Edge Functions have been converted or deleted. All active endpoints are Next.js API routes.

**Cron jobs** — 8 HTTP cron routes under `/api/cron/*`. Must be called on a schedule by an external scheduler (e.g. Coolify cron, system cron, or pg_cron on RDS). Secured by `CRON_SECRET` header.

**Flight Provider** — Duffel (primary, active) or Mystifly (onboarding). Mystifly bookings currently disabled in the booking endpoint.

**Hotel Provider** — TravelGateX OTV (active). LiteAPI deprecated.
