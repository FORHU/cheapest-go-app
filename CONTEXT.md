# CheapestGo — Domain Glossary

## Architecture

**v1 (Monolith)** — the active, deployable system. Next.js app in `cheapest-go-app`. Owns both the frontend and all API routes. This is what is live and being deployed to EC2 + RDS.

**v2 (Separate FE/BE)** — in active development in parallel. Express API in `cheapestgo-api-v2`, Next.js 15 frontend in `cheapestgo-app-v2`. Not code-complete: v2 trails v1, and the gap is closed by the **Feature Port** below. v1 stays live until v2 is deployed and traffic is cut over.
_Avoid_: describing v2 as "code-complete" — it was not true as of 2026-08-24, when v2's last commit was five days and 68 v1 commits behind.

**Feature Port** — the work of bringing v2 to **Functional Parity** with v1: every capability v1 has, behaving the same way, regardless of when v1 built it. Proceeds one **Slice** at a time, each re-implemented in v2's own idioms and tested before the next starts. Design does not cross — v2 owns its own ([ADR-0016](docs/adr/0016-parity-is-functional-not-visual.md)) — so v1's components are read as specifications of behaviour, never copied as markup.
_Avoid_: "cherry-pick", "merge v1 into v2", "sync" — the two repos have incompatible file structures and no commit crosses between them. _Avoid_: "UI migration" — it is not one. Progress, the capability map and each slice's watermark live in [docs/port-status.md](docs/port-status.md).

**Slice** — one capability in the Feature Port, spanning whatever parts of api-v2 and app-v2 it needs, including its own locale keys. A slice is **done** when both repos typecheck, their tests pass, its **Watermark** delta is empty, and it has survived a **Side-by-side Check**. Only then does the next slice begin.
_Avoid_: cutting slices along v1's file paths — they describe v1's design, which is not being ported. _Avoid_: calling a slice done on a green test run alone.

**Watermark** — the v1 commit a slice is level with, recorded per slice. v1 is not frozen during the port, so the delta (`git log <watermark>..HEAD -- <slice paths>`) is re-run before a slice is called done and the watermark advances only when it passes.
_Avoid_: a single global baseline — v1 moves under some slices and not others.

**Side-by-side Check** — the acceptance test for a slice, in two parts. **Responses:** the same request is issued to v1's route (on 5433) and to api-v2's endpoint (on 5434, freshly rebuilt from 5433 so the rows match), and the JSON is diffed — ids, prices, ordering, fields. v1 is the reference implementation, so a difference here is a porting defect, not a matter of judgement. **Walkthrough:** one human pass through the v2 UI asking whether the task can be completed.
_Avoid_: comparing rendered pages — v2 owns its design, so screen differences are expected and tell you nothing. _Avoid_: comparing v2 against a description of what v1 does — compare against v1 actually running.

**API base URL (v2)** — `NEXT_PUBLIC_API_URL` must include the `/api/v2` suffix (e.g. `http://localhost:4000/api/v2`). All `http.*` calls in app-v2 use paths relative to this base with no `/api/` prefix (e.g. `/auth/me`, `/flights/book`).
_Avoid_: adding `/api/` prefix to paths in app-v2 — it creates a double-prefix (`/api/v2/api/...`) that 404s. _Avoid_: `fetch('/api/...')` against app-v2's own route handlers — api-v2 owns all domain logic ([ADR-0017](docs/adr/0017-api-v2-owns-all-domain-logic.md)), and app-v2's server code is limited to SSR fetches, key-hiding proxies and cookie forwarding.

**Google OAuth flow (v2)** — server-side. `GET /api/auth/google` redirects to Google with `redirect_uri = API_URL/api/auth/google/callback`. Google calls the API directly. The API exchanges the code, sets a JWT cookie, and redirects the browser to `SITE_URL`. No frontend callback page needed.
_Avoid_: setting `redirect_uri` to the frontend URL — Google would land on a page with no handler.

**Cutover** — the moment traffic switches from v1 to v2. Has not happened yet. Until it does, v2 runs on its own database and never writes a migration — dbmate in v1 stays the sole author of schema, and v2's database is rebuilt from v1's. See [ADR-0018](docs/adr/0018-v2-has-its-own-database.md).

**GeomeeGo** — a white-label deployment of CheapestGo targeting Korean users, served at `geomeego.com`. It is the same codebase, same database, and same feature set as CheapestGo — not a separate product. It differs only in brand name, logo, favicon, email sender, and locale (locked to Korean, no language switcher). Runs as a second EC2 instance pointing at the same repo and the same `DATABASE_URL`. See [ADR-0005](docs/adr/0005-geomeego-white-label-deployment.md).
_Avoid_: treating GeomeeGo as a separate product or separate codebase — it shares all suppliers, inventory, users, and admin with CheapestGo. _Avoid_: adding Korean-specific features or business logic to the codebase without making them brand-configurable.

**White-label Deployment** — a Coolify service running the same `cheapest-go-app` repo with a different set of brand env vars (`NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_BRAND_LOGO_URL`, `NEXT_PUBLIC_BRAND_FAVICON`, `NEXT_PUBLIC_BRAND_EMAIL`, `NEXT_PUBLIC_LOCALE`, `NEXT_PUBLIC_SITE_URL`). The brand env vars are the single source of truth for which site is being served. No runtime domain detection.
_Avoid_: reading `req.headers.host` to decide which brand to render — all brand config comes from env vars baked in at build/start time.

## Deployment

**AWS EC2** — the Next.js app runs as a persistent Node.js process on EC2. Not serverless. Connection pools are shared across requests within one process. Each brand deployment (CheapestGo, GeomeeGo) is a separate EC2 instance with its own env vars pointing at the same RDS database.

**Dev environment** — Docker Compose with PostgreSQL 17 + pgAdmin 4. One port means one thing: v1 dev on **3000**, the v1 container (live RDS) on **3001**, app-v2 on **3002**, api-v2 on **4000**. v1's Postgres is **5433**; v2's is **5434** ([ADR-0018](docs/adr/0018-v2-has-its-own-database.md)), with Redis on 6380. Local only. pgAdmin available at `http://localhost:5050` (admin@cheapestgo.local / cheapestgo).

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

**Booking Reference** — the identifier CheapestGo puts on a **sale**, `CG-XXXXXX` for CheapestGo and `GG-XXXXXX` for GeomeeGo. Minted before the charge and written onto the PaymentIntent, so it exists even where a booking was never confirmed — a payment that took money and then failed still has to be attributable. The prefix is derived from **Source Brand** at mint time rather than stored beside it, so the two cannot disagree.
_Avoid_: calling a **PNR** a reference, and reading a `CG` prefix as ours without the hyphen — `CG2MTN` is an airline PNR that begins with those letters by coincidence. The retired `FORHU-` prefix named FORHU Inc, the company every project shares, and so identified nothing.

**PNR** — the airline's own record locator for a booking, six characters, assigned by the carrier. The traveller needs it at the airport and the airline will not recognise anything else, so it is displayed alongside the **Booking Reference**, never in place of it. Not unique to this platform and not ours to change.

**Source Brand** — which storefront made the sale: `CheapestGo` or `GeomeeGo`. Stored on every booking table and the authority on brand; the **Booking Reference** prefix is a second representation of it, never an independent one.
_Avoid_: treating brand as the same thing as project — FORHU Inc runs products beyond this platform, and they share one Stripe account and one pooled payout.

**Edge Function** → **API Route** — all 47 Deno functions formerly hosted on Supabase Edge Functions have been converted or deleted. All active endpoints are Next.js API routes.

**Cron Job** — an HTTP route under `/api/cron/*` (15 of them) or `/api/internal/*` that does nothing on its own: it runs only when a **Scheduler** calls it, and is secured by a `CRON_SECRET` bearer header. A route with no scheduler pointing at it is dead code that still looks alive.
_Avoid_: assuming a route runs because it exists — `geocode-hotels` has never been scheduled anywhere.

**Scheduler** — the thing that actually calls a Cron Job. Two exist, and which one owns a job is a real distinction, not an accident:
- **Cron Sidecar** — a container defined alongside the app that curls the app over the internal network. Owns the operational jobs: ticket polling, order cleanup, email retries, session and cache expiry, deal refreshes. It reaches routes that must not be public.
- **Workflow Cron** — a GitHub Actions schedule that either curls the public site or connects straight to the database. Owns the long-running content jobs, because they need more time and more memory than a request should hold.
_Avoid_: treating the Cron Sidecar as part of the deployment — the production deploy starts the app container alone, so the sidecar survives only as state someone created on the box by hand. _Avoid_: pointing a schedule at a route that does not exist: `curl -sf` prints nothing and discards its output, so a 404 is indistinguishable from a job that ran.

**Flight Provider** — Duffel (primary, active) or Mystifly (onboarding). Mystifly bookings currently disabled in the booking endpoint.

**Home-Market Fare** — discounted inventory an airline sells only through the distribution channels of its own country (airline direct, plus local OTAs and consolidators), never releasing it to global distribution. Duffel reaches global distribution only, so on a sector priced this way it returns the airline's *published* fare and CheapestGo lands multiples above a local OTA — while the same carrier prices at parity on its international sectors. Measured 2026-08-17 on Korean Air: GMP–CJU round-trip ₩335,318 vs Trip.com ₩100,700 (+233%), ICN–NRT ₩405,740 vs ₩409,800 (−1%).
_Avoid_: reading a domestic-sector gap as a CheapestGo markup or an FX fault — markup is applied at booking only, never in search, and the international sectors price at parity. _Avoid_: generalising from one carrier's international competitiveness to its domestic sectors, or the reverse.

**Pre-Order** — a real airline order placed with the provider before the customer has paid, created so that the amount charged is the amount the airline actually quoted rather than an estimate that can expire mid-checkout. Despite the name it is not provisional: for an instant-ticketing carrier it is already an issued ticket, and undoing one is a refund rather than a cancellation. See [ADR-0009](docs/adr/0009-airline-order-placed-before-payment.md).
_Avoid_: hold, reservation, provisional booking — each implies something reversible at no cost, which a Pre-Order is not.

**Duplicate Departure** — a traveller holding two active bookings that depart on the same calendar day, whatever their routes. Nobody can be on two aircraft at once, so the second is a clash wherever it is going — but it is a clash the traveller is told about and may accept, not one the platform refuses on their behalf. See [ADR-0011](docs/adr/0011-duplicate-departures-are-warned-not-refused.md).
_Avoid_: treating it as fraud or error — a positioning flight on a separate ticket, a booking made for a family member on a shared account, and a deliberate backup on a volatile fare are all ordinary reasons to hold two.

**Settlement Currency** — the **Supplier Currency** of the specific offer being bought, and the denomination of every figure derived from the supplier order. The currency a charge is converted *from*.
_Avoid_: converting from the currency in the client’s booking payload — that is a **Display Currency** value and a display artefact, never the basis for an amount charged.

**Orphaned Order** — a **Pre-Order** whose customer never completed payment, leaving airline inventory held against no sale. Reclaimed automatically only if the booking session recorded it; one that was created but never recorded is invisible to the platform and survives until the airline's own hold expires.
_Avoid_: calling it a failed booking — the order succeeded, it is the payment that did not.

**Hotel Provider** — hotel availability is sourced from RateHawk, reached through two API paths:
- **OTV** — RateHawk's name within the TravelGateX marketplace. Accessed via TGX GraphQL hub (Access `38327`). Primary search path.
- **ETG** — the same RateHawk inventory accessed directly via `api.worldota.net`. Used as a reliability fallback when OTV/TGX returns no results, and for the nightly hotel-reviews sync. LiteAPI deprecated.
OTV and ETG are the **same underlying supplier** (RateHawk) through two different API doors — not two suppliers with different hotel sets. Running both simultaneously yields duplicate results, not broader coverage. The ETG fallback is a reliability hedge, not a coverage expansion.
_Avoid_: assuming OTV and ETG cover different hotels; treating ETG as a separate supplier with distinct inventory; calling ETG "RateHawk" in code (codebase name is `ETG`/`_etg`).

**LiteAPI** — a retired hotel supplier. The *integration* is gone: no client, no credentials, nothing calls it, and it supplies no inventory. Its *vocabulary* is not gone, and the difference matters when reading the code. `raw_liteapi_response` is a live column in the schema, LiteAPI's room-and-offer shape is still what v1's room types are modelled on, and v1's rate builder reads that shape before it reads the one OTV actually sends. api-v2 carries a smaller residue that nothing calls at all.
_Avoid_: reading a LiteAPI name as evidence of a live supplier — every occurrence is either a column name, a type shape, or dead code. _Avoid_: the reverse error of assuming the names are cosmetic and safe to strip — the column is `NOT NULL` and a stored function reads it. _Avoid_: adding new code in LiteAPI's shape because the surrounding code is written that way.

**TGX Static Data** — a bulk hotel registry downloaded from TravelGateX, stored in `tgx_hotel_static`. Contains each hotel's TGX code, name, address, coordinates, and FastX mapping. Downloaded as part of TGX onboarding. Cross-supplier dedup via FastX has no active use case today (OTV is the only TGX supplier); the table is dormant until a second TGX supplier with distinct inventory is added.
_Avoid_: using `tgx_hotel_static` as a geo-to-code lookup or as the primary source of display content.

**FastX Code** — TravelGateX's unified hotel identifier that maps the same physical hotel across multiple TGX suppliers. Returned in the `mappings` node of the TGX Hotels Content query alongside the supplier's native `hotelCode` and `hotelCodeSupplier`. The FastX code is the dedup key for cross-supplier merging within the TGX marketplace.
_Avoid_: confusing FastX with a hotel's native supplier code; applying FastX dedup to ETG (direct worldota) — ETG does not go through the TGX hub and has no FastX mapping.

**Hotel Content Cache** — the `hotel_content` DB table. A persistent, incrementally-built registry of hotel metadata (name, coordinates, images, address, stars) accumulated from prior TGX searches. Hotels in this table for a given city are served to the user **immediately** in Phase 1 of a search while the live TGX availability query runs in Phase 2. Hotels not yet in `hotel_content` only appear if TGX returns them in Phase 2. Content rows are populated (and images updated) by the TGX Hotels Content API after each search.
_Avoid_: treating `hotel_content` as a canonical hotel master — it is a cache, not a source of truth. Rows grow over time as cities are searched.

**TGX Hotels Content API** — the `hotelX.hotels` GraphQL query on TravelGateX. Returns static descriptive content for a list of hotel codes: names, coordinates, media (images), and the FastX `mappings` node. Distinct from the availability search (`hotelX.search`). Takes 20–50 s for batches of 200–300 hotels; results are persisted to `hotel_content` so subsequent searches read from the DB rather than calling the API again.
_Avoid_: calling this the "search API" (it is a content/metadata API, not availability); expecting real-time response times.

**TGX Access** — a credential set in the TGX hub that identifies a supplier connection. Access `38327` is the active OTV (RateHawk) connection. Standard timeouts enforced by TGX: search 12 s, prebook 55 s, book 180 s.

**TGX Supplier Context** — a search context bound to a single supplier via its Access code. `hotelX.search` in Supplier Context supports the Search by Destination plugin. Distinct from FastX Context (multi-supplier aggregation), which requires a separate FastX Access and is not yet active.
_Avoid_: assuming Search by Destination works in FastX or Buyer Context — it does not.

**Search by Destination** — a TGX plugin that converts a destination code (e.g. Seoul → `3124`) into OTV hotel codes internally before sending the request to the supplier. The conversion may yield a broader hotel set than what is in `hotel_content`, because TGX's internal mapping can include OTV hotels the app has never seen. Supplier Context only.
_Avoid_: using Search by Destination on requests that already carry explicit hotel codes — TGX merges the two lists, which expands scope unpredictably.

**Hotel-Code Fallback** — the secondary OTV search path used when Search by Destination returns empty or fails. Pulls up to 300 OTV hotel codes from `hotel_content` and sends them as a single `hotelX.search` request with explicit hotel codes (no destination plugin). Coverage is limited to what `hotel_content` already has for that city.
_Avoid_: treating Hotel-Code Fallback as equivalent in coverage to Search by Destination — it is a bounded subset.

**No-Availability Hotel** — TGX's term for a hotel in the Seller's portfolio for which `hotelX.search` returns zero options for the searched criteria (dates, occupancy, market). Distinct from a hotel not in the portfolio at all. Caused by date restrictions, occupancy constraints, or no inventory for that window. TGX's own tooling (Traffic Optimizer, Hotel Portfolio Report) suppresses these from search traffic. Our "prune unpriced hotels on done" logic implements the same rule: catalog hotels that reach `type:done` without receiving a TGX price are no-availability hotels for those dates and are removed from the displayed results.
_Avoid_: showing no-availability hotels to users — TGX explicitly recommends against it. _Avoid_: permanently blacklisting a hotel solely on one no-availability response — it may have inventory on different dates.

**NONE Sentinel** — a row in `tgx_destination_cache` whose `destination_code` is the literal `NONE`, meaning TGX's destinationSearcher has no destination code for that city. A city carrying one skips **Search by Destination** entirely and is served by **Hotel-Code Fallback**, at roughly half the inventory (measured: Seoul, 89 hotels via fallback against 185 via destination code `3124`).
_Avoid_: treating a NONE Sentinel as a statement about supplier coverage — it records only that one destinationSearcher call failed, and it is written on any TGX `5xx`, including a transient one. _Avoid_: assuming a city recovers on its own once TGX is healthy — nothing expires or overwrites the sentinel, unlike the 7-day window on `tgx_failed_dest_codes`.

**Unanswered Search** — a hotel search that ended without the supplier ever giving a usable answer: a TGX timeout, a `513` handler overload, a destination code that never resolved, or an empty catalog to fall back on. Distinct from a **No-Availability Hotel**, where the supplier *did* answer and reported no inventory. Only the latter justifies pruning the Phase 1 catalog — an Unanswered Search has learned nothing about availability, so the catalog stays on screen and the user is told prices could not be loaded.
_Avoid_: rendering an Unanswered Search as "no hotels found" or as the destination lacking supplier coverage — the destination was never actually asked. _Avoid_: caching an Unanswered Search's empty result, or recording its destination code as an OTV miss.

**ALL_PROCESSES_FAILED** — a TGX error returned when every request to the supplier's system failed to produce a response. Not inherently a permanent mapping gap — can be date-dependent (e.g. supplier minimum release days, no inventory for that window) or a transient overload. Accompanying `warnings` in the TGX response contain the root cause code. A `206` warning indicates a date restriction; a mapping or credentials warning indicates a permanent gap for those credentials.
_Avoid_: blacklisting a destination code solely on ALL_PROCESSES_FAILED without inspecting the accompanying warnings — the same code may succeed on different date ranges.

**RTX** — alias for ETG/RateHawk used in legacy notes. Never appears in code. Prefer **ETG** everywhere.

**Refundable Tag** — whether a rate can be cancelled for free, written as **`RFN`** or **`NRFN`** and nothing else. Suppliers say it their own way; the conversion happens where their data enters, so only these two values are ever stored, streamed or rendered.
_Avoid_: `REFUNDABLE` / `NON_REFUNDABLE` / `NON-REFUNDABLE` — all three reached the browser at one point, and because the search UI tests `RFN` alone, "Free cancellation only" silently filtered every hotel away and the free-cancellation badge never appeared. Checkout, the policy formatter and the cancellation engine each grew a `||` chain to cope; those stay as belt-and-braces for rows written before the conversion, but nothing new should rely on them. _Avoid_: reading a Refundable Tag off a Phase 1 catalog card — a catalogued hotel has no rate yet, so it has no refundability to report until prices arrive.

**Cancellation Policy** — per-rate cancellation terms sourced from OTV during the booking flow. Two-stage resolution: the **Quote** step (`hotelX.quote`) is authoritative; if its `cancelPenalties` array is empty (common for cheap OTV rates), the prebook falls back to the `cancelPenalties` returned by the fresh **Search** step run earlier in the same prebook request. If neither has data, the policy is genuinely unavailable from the supplier and the user is told to confirm with the property. The property page shows "Check at checkout" when `refundable` is null — this is intentional and accurate: we do try at checkout, and the checkout page either shows the full timeline or an honest "not provided" message. No contact-the-property channel exists in the platform.
_Avoid_: treating an empty Quote `cancelPenalties` as definitive — always check the Search fallback first. _Avoid_: adding a "contact property" CTA without a real contact channel wired up.

**Planned Suppliers** — ONDA and Rakuten are the next hotel providers in the pipeline, added for **coverage expansion** (genuinely different hotel inventory from OTV/RateHawk, not price competition on the same hotels). Neither is active yet. When added, dedup against OTV results will be required.

**Destination granularity** — a searched place resolves at one of five levels (the *granularity ladder*): **Country → Province/State → City → District → Specific** (a landmark/POI or address). The ladder has two resolution modes:
- **Area rungs** (**Country**, **Province/State**, **City**) resolve to an **ETG region identifier** and are searched as a whole area. **City** *additionally* resolves on **OTV/TravelGateX** (destination or hotel codes); Country and Province do not.
- **Point rungs** (**District**, **Specific**) have no area code — they resolve to a **coordinate + radius** and are searched as a circle around that point (a **point/geo search**). A District (e.g. "Gangnam") sizes its circle from the place's map bounding box; a landmark/address starts small and widens until hotels are found.

So four of the five rungs — everything except **City** — are served by **ETG alone**: ETG is the geographic search engine, and OTV/TravelGateX contributes only at the City rung. See [ADR-0006](docs/adr/0006-granularity-ladder-is-etg-driven.md). A whole-**Country** search is a real ETG country-region search — it no longer silently collapses to a single default city.
_Avoid_: assuming OTV can service anything below City (province, district, landmark) — it cannot. _Avoid_: assuming a place the picker offers resolves identically on every channel. _Avoid_: calling a District or landmark search a "city search" — it is a point/geo search with its own radius. _Avoid_: reviving an OTV+ETG union to cover the sub-city rungs — that dedup problem was rejected in [ADR-0004](docs/adr/0004-province-search-is-etg-only.md) and stays rejected.

## Flight Itinerary

**Slice** — one directed journey within an offer (e.g. CRK→PUS), containing one or more **Segments**. Duffel's own word, adopted verbatim. A one-way offer has one slice; a round trip has two.
_Avoid_: leg, itinerary, journey — and note that the `segmentIndex` field on a segment carries the *slice* index, not the segment's own position, which is what makes `?? idx` fallbacks split a connecting slice into two. It persists under the same misleading name as `flight_segments.segment_index`; the neighbouring `itinerary_index` is legacy and permanently 0, so ordering or grouping by it does nothing.

**Segment** — a single flight number between two airports inside a **Slice**. A slice with two segments has one connection.

**Local Airport Time** — the wall-clock time at the airport a segment departs from or arrives at. Every departure and arrival shown to a traveller is in Local Airport Time; none is ever restated in the viewer’s own timezone, which is why a 12:00 departure and an 18:45 arrival can be 5h 45m apart.
_Avoid_: converting a flight time to the viewer’s timezone, or reading one as UTC — providers quote these with no offset attached, so both readings silently shift the clock.

**Slice Duration** — the elapsed time of a **Slice**, first departure to last arrival, connection time included. Quoted by the provider, never derived from the departure and arrival timestamps: those carry no UTC offset, so subtracting them is wrong by exactly the timezone gap (PUS→CRK reads 2h44m on the clock and is really 3h44m).
_Avoid_: "trip duration" or a single duration for an offer — no provider quotes one, and a round trip has two Slice Durations. Under **Slice Selection** a traveller is never shown two slices at once, so there is no occasion to add them.

**Segment Duration** — the air time of one **Segment**, connections excluded. Always less than the **Slice Duration** of a slice that has a connection.

**Slice Selection** — the shopping model: a traveller chooses one **Slice** at a time, and the price is final only once every slice has been chosen. Follows from CheapestGo being the seller rather than a referrer. See [ADR-0010](docs/adr/0010-flights-are-shopped-one-slice-at-a-time.md).
_Avoid_: presenting a round trip as a single choice with one price — that is the metasearch pattern, and it forces figures onto the screen that no provider quotes.

**Layover** — the ground time between two consecutive **Segments** of a **Slice**, always spent at one airport. The figure that separates two slices with the same airline, endpoints and price: 1h 15m at TPE and 17h 30m at TPE are a 5h 45m journey and a 22h one.
_Avoid_: "stopover" (a deliberate multi-day break — a different product), and "connection" when the airport is meant rather than the time spent there.

**Terminal** — the departure or arrival terminal of a **Segment**, as published by the airline through the provider. Availability is a property of the carrier, not of the airport or of our integration: measured on live Duffel 2026-09-02, Lufthansa-group carriers returned one on 31 of 31 LHR–JFK segments, while no Asian carrier returned one on any of 45 segments across ICN–NRT, MNL–HKG and CRK–ICN. On CheapestGo's current routes a terminal is therefore normally absent, and that is the airline's silence rather than a fault. Frequently one-sided — departure known, arrival not, or the reverse — so the two are shown independently and the line appears whenever either exists.
_Avoid_: taking a terminal seen in test mode as evidence the field is populated. Duffel's test content returns a constant `2`/`1` on every segment, including American at LHR where the real terminal is 3, so any coverage figure measured on a test key says nothing about live — and `2`/`1` appearing in a fixture is where the belief that terminals "work" came from.

**Marketing Carrier** — the airline whose code and flight number a seat is sold under, and the brand the traveller thinks they are flying. **Operating Carrier** — the airline that actually flies the aircraft. They differ on a codeshare, and it is the Operating Carrier the traveller meets at the gate.
_Avoid_: collapsing the two into one "airline" — a seat sold as Cathay Pacific and flown by Hong Kong Express is something the traveller is owed before booking, not at the airport.

## Money

**Reporting Currency** — US dollars. The one currency every blended revenue, profit, and markup figure is expressed in, whatever the customer actually paid. Chosen because FORHU Inc is the booking entity and suppliers quote predominantly in USD.
_Avoid_: "base currency" (ambiguous — suppliers, Stripe, and the admin UI each have their own "base"). _Avoid_: assuming PHP is the reporting currency because column defaults and admin code say `'PHP'` — that is legacy, not intent.

**Charge Currency** — the currency Stripe actually bills the customer in, chosen by the customer at checkout. One booking has exactly one Charge Currency, and refunds must be issued in it so the customer sees no FX drift. Deliberately limited to **KRW, USD and PHP** — the markets actually served. Holding an exchange rate for a currency does not make it chargeable.
_Avoid_: conflating with **Supplier Currency** — the two differ on most bookings. _Avoid_: inferring the charge surface from the rate table, the admin currency picker, or the payment route's accepted list — none of those is the customer-facing set.

**Supplier Currency** — the currency the provider (Duffel, OTV/TGX) quotes and settles in. This is the only price the platform can treat as authoritative; everything the browser computes is a display artefact.
_Avoid_: treating a converted display price as a quote.

**Display Currency** — what a price is *shown* in across the storefront. Converted server-side, so the figure on screen is the same one that will be charged; the browser renders prices, it does not compute them.
_Avoid_: converting prices in the browser — two independent conversions drift apart and put the customer in front of a price-changed prompt. _Avoid_: using the admin's own currency selector (a per-viewer display preference) as if it were the **Reporting Currency**.

**Nightly Rate** — a room's price for one night. What the storefront advertises and what a guest compares between hotels, so it is the figure on a search card and on a room card. Always derived, never quoted: suppliers price stays, not nights.
_Avoid_: showing a **Stay Total** with a "per night" label — the same number means something different to a supplier and to a guest, and the guest reads it as the cheaper of the two.

**Stay Total** — what a room costs for the whole date range asked about. This is what OTV/TGX actually quotes and what prebook confirms, so it is the only hotel price the platform receives directly and the basis of every charge.
_Avoid_: passing one as a bare number. A price and the stay it covers travel together; a figure that has lost its night count cannot be restated per night by whoever renders it next, only guessed at.

**Booked Amount** — a payment restated into the **Reporting Currency** using the rate in force at the moment it was taken. Fixed permanently at that instant, so a report for a past period returns the same figure however long afterwards it is run.
_Avoid_: recomputing a past period at today's rate — a closed month never moves.

**Locked Rate** — the exchange rate captured alongside a payment, and the evidence for its **Booked Amount**. Stored with the booking rather than looked up later, because a rate that was not recorded at the time cannot be recovered.

**Gross Booking Value** — the total customer-facing value of bookings taken, including the supplier's share. A volume measure: it says how much money moved through the platform, not how much the platform earned.
_Avoid_: calling this "revenue" — most of it belongs to the airline or hotel.

**Net Revenue** — what CheapestGo keeps: **Gross Booking Value** less supplier cost. Equal to the markup, which is deliberately sized to cover Stripe fees rather than to earn a margin.
_Avoid_: "profit" — the markup is a cost-recovery buffer, and labelling it profit implies a margin the pricing model does not intend to make.

**Reversal** — the accounting undo of a refunded booking, carried out at that booking's own **Locked Rate** so the sale and the refund cancel to nothing. The customer is returned exactly what they paid in their **Charge Currency**, so no gain or loss arises to report.
_Avoid_: revaluing a refund at the current rate — that manufactures an FX movement out of a transaction that had none.

## Landing Page

**Flight Deal** — an evergreen route + "from" price card shown in the "Exclusive Deals & Offers" section. No departure date is pinned to the card. The cron finds the lowest available price across a rolling window and stores it. The stored price is what's displayed; users pick their own dates when they search.
_Avoid_: pinning a specific departure date to a Flight Deal card. Date-specific deals are only appropriate for genuine flash sales with a seat-count limit and countdown timer.

**Popular Destination** — a static, editorially curated destination card shown in the "Popular Destinations" section on the landing page. Contains a destination photo, city/country name, and a CTA that pre-fills the search bar with the destination (user still picks dates). No live API call triggered by the card or the click. Global mix of destinations, not Philippines-first. Content is a hardcoded static list in the component — no DB table.
_Avoid_: showing a "from" price on these cards (requires a live availability call, which violates supplier pre-fetch prohibitions). _Avoid_: auto-filling dates on click and navigating directly to search results — dates must be chosen by the user, not synthesised.

**How It Works** — a 3-step explainer strip on the landing page (Search → Compare → Book). Static content, no data dependency. Replaces social proof that a new brand doesn't yet have.

**Refresh cadence** — only Flight Deals have a cron refresh (`sync-flight-deals` via Duffel). Hotel sections (Top Hotel Deals, Guest Favorites) were dropped in v1 because populating them required synthetic availability calls, which violate TravelGateX and RTX supplier terms (pre-fetch prohibition, clause 3.5 in the RTX agreement).
_Avoid_: re-introducing any cron that calls a hotel availability API without a real user request behind it.
