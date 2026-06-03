# CheapestGo — Domain Glossary

## Deployment

**Coolify** — self-hosted deployment platform running the Next.js app as a persistent Docker container. Not serverless. Connection pools are shared across requests within one process.

**Dev environment** — Docker Compose with PostgreSQL 17 + pgAdmin 4. Local only. pgAdmin available at `http://localhost:5050` (admin@cheapestgo.local / cheapestgo).

**Production database** — AWS RDS PostgreSQL (provisioning in progress). Connect via `DATABASE_URL` env var.

**Migration tool** — dbmate. Reads `DATABASE_URL`, runs `.sql` files from `db/migrations/` in timestamp order. Run `npx dbmate up` to apply.

## Database

**PostgreSQL** — the only database. Both dev (Docker) and prod (AWS RDS) are standard PostgreSQL. No Supabase infrastructure.

**DATABASE_URL** — the single connection string used by the app and dbmate. Format: `postgresql://user:password@host:5432/database`.

**No RLS** — Row Level Security is not used. Security is enforced at the API layer (every route validates the session before querying). The database is not publicly accessible.

**Schema** — fully defined in `db/migrations/`. Two migrations:
- `20260601000001_schema.sql` — all application tables, indexes, functions, triggers.
- `20260601000002_auth.sql` — `users`, `sessions`, `password_reset_tokens`, FKs to users.

## Auth

**Session** — a Lucia-managed row in the `sessions` table. Stored as a cookie (`cg-session`). Replaces Supabase Auth JWTs.

**User** — a row in `public.users`. Replaces `auth.users`. Password hashed with argon2id.

**Profile** — a row in `public.profiles` auto-created by the `on_user_created` trigger on `public.users`. Replaces the Supabase `on_auth_user_created` trigger on `auth.users`.

## Booking

**Edge Function** → **API Route** — all 47 Deno functions formerly hosted on Supabase Edge Functions have been converted or deleted. All active endpoints are Next.js API routes.

**Cron jobs** — 8 HTTP cron routes under `/api/cron/*`. Must be called on a schedule by an external scheduler (e.g. Coolify cron, system cron, or pg_cron on RDS). Secured by `CRON_SECRET` header.

**Flight Provider** — Duffel (primary, active) or Mystifly (onboarding). Mystifly bookings currently disabled in the booking endpoint.

**Hotel Provider** — TravelGateX OTV (active). LiteAPI deprecated.
