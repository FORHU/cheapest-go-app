# CheapestGo — Domain Glossary

## Architecture

**v1 (Monolith)** — the active, deployable system. Next.js app in `cheapest-go-app`. Owns both the frontend and all API routes. This is what is live and being deployed to EC2 + RDS.

**v2 (Separate FE/BE)** — in active development in parallel. Express API in `cheapestgo-api-v2`, Next.js 15 frontend in `cheapestgo-app-v2`. Code-complete but not yet deployed. v1 stays live until v2 is deployed and traffic is cut over.

**API base URL (v2)** — `NEXT_PUBLIC_API_URL` must include the `/api/v2` suffix (e.g. `http://localhost:4000/api/v2`). All `http.*` calls in app-v2 use paths relative to this base with no `/api/` prefix (e.g. `/auth/me`, `/flights/book`).
_Avoid_: adding `/api/` prefix to paths in app-v2 — it creates a double-prefix (`/api/v2/api/...`) that 404s.

**Google OAuth flow (v2)** — server-side. `GET /api/auth/google` redirects to Google with `redirect_uri = API_URL/api/auth/google/callback`. Google calls the API directly. The API exchanges the code, sets a JWT cookie, and redirects the browser to `SITE_URL`. No frontend callback page needed.
_Avoid_: setting `redirect_uri` to the frontend URL — Google would land on a page with no handler.

**Cutover** — the moment traffic switches from v1 to v2. Has not happened yet.

**GeomeeGo** — a white-label deployment of CheapestGo targeting Korean users, served at `geomeego.com`. It is the same codebase, same database, and same feature set as CheapestGo — not a separate product. It differs only in brand name, logo, favicon, email sender, and locale (locked to Korean, no language switcher). Runs as a second EC2 instance pointing at the same repo and the same `DATABASE_URL`. See [ADR-0005](docs/adr/0005-geomeego-white-label-deployment.md).
_Avoid_: treating GeomeeGo as a separate product or separate codebase — it shares all suppliers, inventory, users, and admin with CheapestGo. _Avoid_: adding Korean-specific features or business logic to the codebase without making them brand-configurable.

**White-label Deployment** — a Coolify service running the same `cheapest-go-app` repo with a different set of brand env vars (`NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_BRAND_LOGO_URL`, `NEXT_PUBLIC_BRAND_FAVICON`, `NEXT_PUBLIC_BRAND_EMAIL`, `NEXT_PUBLIC_LOCALE`, `NEXT_PUBLIC_SITE_URL`). The brand env vars are the single source of truth for which site is being served. No runtime domain detection.
_Avoid_: reading `req.headers.host` to decide which brand to render — all brand config comes from env vars baked in at build/start time.

## Deployment

**AWS EC2** — the Next.js app runs as a persistent Node.js process on EC2. Not serverless. Connection pools are shared across requests within one process. Each brand deployment (CheapestGo, GeomeeGo) is a separate EC2 instance with its own env vars pointing at the same RDS database.

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

**Hotel Provider** — hotel availability is sourced from two channels, tried in priority order:
- **OTV** — the active TravelGateX supplier (`TRAVELGATEX_SUPPLIER`/`TRAVELGATEX_CONTEXT`, default `OTV`), reached through the TravelGateX GraphQL hub. Primary path.
- **ETG** — Emerging Travel Group's B2B API (`api.worldota.net`), whose partner brand is **RateHawk**. Used as a direct fallback when OTV returns no results, and for the nightly hotel-reviews sync. LiteAPI deprecated.
_Avoid_: calling ETG "Ratehawk" in code (the codebase name is `ETG`/`_etg`); treating OTV and ETG as one supplier (OTV is via the TGX hub, ETG is direct worldota).

**RTX** — used in this document (refresh-cadence note) as a supplier name but never appears in code. Denotes the same supplier as **ETG/RateHawk**. Prefer **ETG** everywhere; RTX is a flagged alias, not a distinct provider.

**Destination granularity** — the two hotel channels resolve a searched place at different levels. **OTV/TravelGateX** resolves **City** or **Zone** only. **ETG** resolves a **City** *or* an area (**Province/Region/Multi-city**) via ETG's region endpoint. So a **Province/Region** query (e.g. "Palawan", offered by the autocomplete as a Mapbox `region`) is served by ETG across the whole province — matching Ratehawk — while OTV contributes nothing at province level.
_Avoid_: assuming OTV can service a province; assuming a place the picker offers resolves identically on every channel.

## Landing Page

**Flight Deal** — an evergreen route + "from" price card shown in the "Exclusive Deals & Offers" section. No departure date is pinned to the card. The cron finds the lowest available price across a rolling window and stores it. The stored price is what's displayed; users pick their own dates when they search.
_Avoid_: pinning a specific departure date to a Flight Deal card. Date-specific deals are only appropriate for genuine flash sales with a seat-count limit and countdown timer.

**Popular Destination** — a static, editorially curated destination card shown in the "Popular Destinations" section on the landing page. Contains a destination photo, city/country name, and a CTA that pre-fills the search bar with the destination (user still picks dates). No live API call triggered by the card or the click. Global mix of destinations, not Philippines-first. Content is a hardcoded static list in the component — no DB table.
_Avoid_: showing a "from" price on these cards (requires a live availability call, which violates supplier pre-fetch prohibitions). _Avoid_: auto-filling dates on click and navigating directly to search results — dates must be chosen by the user, not synthesised.

**How It Works** — a 3-step explainer strip on the landing page (Search → Compare → Book). Static content, no data dependency. Replaces social proof that a new brand doesn't yet have.

**Refresh cadence** — only Flight Deals have a cron refresh (`sync-flight-deals` via Duffel). Hotel sections (Top Hotel Deals, Guest Favorites) were dropped in v1 because populating them required synthetic availability calls, which violate TravelGateX and RTX supplier terms (pre-fetch prohibition, clause 3.5 in the RTX agreement).
_Avoid_: re-introducing any cron that calls a hotel availability API without a real user request behind it.
