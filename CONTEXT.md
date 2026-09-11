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

**AirangGo** — a white-label deployment of CheapestGo targeting Korean users, served at `airanggo.com`. It is the same codebase, same database, and same feature set as CheapestGo — not a separate product. It differs only in brand name, logo, favicon, email sender, and locale (locked to Korean, no language switcher). Runs as a second **container on the same EC2 instance** as CheapestGo — port 3001 beside 3000, one nginx routing both by hostname, one database. See [ADR-0005](docs/adr/0005-geomeego-white-label-deployment.md).
_Avoid_: looking for a second instance — there is one box, and stopping the container named `geomeego` takes airanggo.com down.
_Avoid_: treating AirangGo as a separate product or separate codebase — it shares all suppliers, inventory, users, and admin with CheapestGo. _Avoid_: adding Korean-specific features or business logic to the codebase without making them brand-configurable.

**GeomeeGo** — what **AirangGo** was called before the 2026-09 rebrand, and the second name this brand has had. Not a separate brand and never was. The name survives in running configuration rather than in intent: the Korean instance is still started with it until redeployed, `geomeego.com` still resolves until DNS moves, and admin cookies still hold it — so both names are accepted at once, on purpose. Infrastructure named after it (GitHub secrets, the EC2 container, `~/.env.geomeego`) is deliberately untouched, because those names live outside this repo.
_Avoid_: renaming an infrastructure identifier to match the brand as a tidy-up — a secret reference renamed on only one side resolves to empty and deploys a broken container. _Avoid_: reading a `GG-` **Booking Reference** as belonging to a defunct brand; the prefix was kept through the rename so one brand's references stay one series.

**White-label Deployment** — a second EC2 instance running the same `cheapest-go-app` repo with a different set of brand env vars (`NEXT_PUBLIC_BRAND_NAME`, `NEXT_PUBLIC_BRAND_LOGO_URL`, `NEXT_PUBLIC_BRAND_FAVICON`, `NEXT_PUBLIC_BRAND_EMAIL`, `NEXT_PUBLIC_LOCALE`, `NEXT_PUBLIC_SITE_URL`). The brand env vars are the single source of truth for which site is being served. No runtime domain detection.
_Avoid_: reading `req.headers.host` to decide which brand to render — all brand config comes from env vars baked in at build/start time.

## Deployment

**AWS EC2** — the Next.js app runs as a persistent Node.js process on EC2. Not serverless. Connection pools are shared across requests within one process. Both brands run as separate containers on **one** EC2 instance, each with its own env file and host port, behind a single nginx that routes on hostname. One RDS database serves both.

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

**Capability Link** — a URL whose *possession* is the authorization, used where a **Session** would be the wrong demand: the receipt links in confirmation emails, which guests forward to travel companions and expense departments. It is scoped to one thing, read-only, unguessable, and never accompanied by a weaker way of naming the same thing. A Capability Link and a Session are the only two ways to become an authorized actor. See [ADR-0027](docs/adr/0027-authorisation-belongs-to-the-resource-not-the-page.md).
_Avoid_: calling one "a public page" — it is credentialed, the credential just happens to be the URL. _Avoid_: adding a lookup by booking reference, PNR or supplier id beside it — the route is then only as strong as the weakest way in.

**Sensitive Page** — not a concept here, and requests phrased in terms of it should be re-asked. Pages are not authorization boundaries; routes are ([ADR-0027](docs/adr/0027-authorisation-belongs-to-the-resource-not-the-page.md)). The answerable questions are "which route exposes this data" and "does that route check the owner".
_Avoid_: "put this page behind auth" as a fix for an exposure report — it moves the login prompt without closing anything.

## Booking

**Booking** — CheapestGo's own record of a stay it sold. A cache of the **Reservation**, never the authority on it: a Booking can exist for a Reservation that was cancelled elsewhere, and a Reservation can exist with no Booking at all.
_Avoid_: using "booking" for the supplier's record — that is a **Reservation**, and conflating the two is why "the booking was cancelled" can be true and false at the same time.

**Reservation** — the supplier's record of the stay, held by RateHawk and identified by its order number. The authority on whether a stay exists and whether it is cancelled. Cancellable from the supplier's own dashboard, without CheapestGo being told.

**Unrecorded Reservation** — a **Reservation** the supplier confirmed and the customer paid for, with no **Booking** to match it. The customer holds a room the platform cannot see, cannot show them, and cannot cancel. Distinct from an **Orphaned Order**, where no sale completed and only inventory is held — here the money moved.
_Avoid_: refunding one on discovery. The stay is real, so the charge is owed; what is missing is the record, not the entitlement.

**Stale Booking** — a **Booking** still reading `confirmed` whose **Reservation** has been cancelled at the supplier. The opposite direction of drift from an **Unrecorded Reservation**, and the more common one, since any dashboard cancellation creates one.

**Booking Reference** — the identifier CheapestGo puts on a **sale**, `CG-XXXXXX` for CheapestGo and `GG-XXXXXX` for AirangGo. Minted before the charge and written onto the PaymentIntent, so it exists even where a booking was never confirmed — a payment that took money and then failed still has to be attributable. The prefix is derived from **Source Brand** at mint time rather than stored beside it, so the two cannot disagree.
_Avoid_: calling a **PNR** a reference, and reading a `CG` prefix as ours without the hyphen — `CG2MTN` is an airline PNR that begins with those letters by coincidence. The retired `FORHU-` prefix named FORHU Inc, the company every project shares, and so identified nothing.

**PNR** — the airline's own record locator for a booking, six characters, assigned by the carrier. The traveller needs it at the airport and the airline will not recognise anything else, so it is displayed alongside the **Booking Reference**, never in place of it. Not unique to this platform and not ours to change.

**Source Brand** — which storefront made the sale: `CheapestGo` or `AirangGo`. Stored on every booking table and the authority on brand; the **Booking Reference** prefix is a second representation of it, never an independent one.
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

**Supplier Attempt** — one call to a supplier's booking or cancellation API, recorded before it is made rather than after. Distinct from a **Booking Reference**, which records a *sale*: an attempt records that we *asked*, which is the fact that survives a timeout, a crash, or a caller that never intended to write a booking at all. An attempt with no completion means the supplier was asked and the answer was never heard — not that nothing happened.
_Avoid_: treating the `bookings` table as the record of what a supplier holds. On 2026-09-06 a live OTV reservation existed with no row here, and six of seven live Duffel orders had none either; the supplier's own list is the authority, and an attempt is our side of it. _Avoid_: logging a supplier call on success — the calls worth having are the ones that did not obviously succeed.

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

**Destination Code** — the supplier's identifier for a place, and what a hotel search is actually asked in terms of. A city name does not identify one: Paris, Rome, Bali, Cambridge and Valencia each name several places in different countries, so a code is only meaningful together with the country it belongs to. Resolved once and cached, because asking the supplier costs an 18-second round trip.
_Avoid_: keying a cached code on the city name alone. A single global row per name means the first country resolved wins forever, and every other country silently inherits it — on 2026-09-09 "Paris, France" searched Paris, Texas, "Bali, Indonesia" searched Bali in Crete, and "Rome, Italy" returned eight hotels in Rome, Georgia. _Avoid_: reading a zero from a wrong-country code as a **No-Availability Hotel** result; the supplier answered honestly about a place nobody asked for.

**Unanswered Search** — a hotel search that ended without the supplier ever giving a usable answer: a TGX timeout, a `513` handler overload, a destination code that never resolved, or an empty catalog to fall back on. Distinct from a **No-Availability Hotel**, where the supplier *did* answer and reported no inventory. Only the latter justifies pruning the Phase 1 catalog — an Unanswered Search has learned nothing about availability, so the catalog stays on screen and the user is told prices could not be loaded.
_Avoid_: rendering an Unanswered Search as "no hotels found" or as the destination lacking supplier coverage — the destination was never actually asked. _Avoid_: caching an Unanswered Search's empty result, or recording its destination code as an OTV miss. _Avoid_: letting a clean zero from the **Hotel-Code Fallback** cancel a destination that was never resolved — asking by hotel code is not the same question as asking by destination, and on 2026-09-02 a Phuket search where the fallback answered zero was followed seconds later by a destination-code search that returned real availability for the same city and dates.

**Cold City** — a destination with no cached TGX destination code, whose first search must therefore resolve one before it can ask about availability. That resolution is what makes the first search slow enough to fail and the second one succeed, because the first writes the code the second reads — the "search again and it works" report is almost always this. Not a rare state: on 2026-09-02, 22,635 cities holding five or more hotels had no cached code, against 103 that did.
_Avoid_: reading a Cold City's empty first search as the destination having no hotels, and treating the warm second search as proof the first was a fluke — the two searches asked the supplier different questions.

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
The guarantee is about **conversion**, not about the total: a displayed price is the supplier's price in the viewer's currency, and the markup is added at booking by deliberate choice, so the checkout total is knowingly higher than the search figure.
_Avoid_: converting prices in the browser — two independent conversions drift apart and put the customer in front of a price-changed prompt. _Avoid_: using the admin's own currency selector (a per-viewer display preference) as if it were the **Reporting Currency**. _Avoid_: reading the search figure as an all-in quote, or the gap at checkout as a fault — it is the markup, and it widens as the markup grows.

**Nightly Rate** — a room's price for one night. What the storefront advertises and what a guest compares between hotels, so it is the figure on a search card and on a room card. Always derived, never quoted: suppliers price stays, not nights.
_Avoid_: showing a **Stay Total** with a "per night" label — the same number means something different to a supplier and to a guest, and the guest reads it as the cheaper of the two.
_Note_: derived exactly once, and the search stream is where. A price that has already been divided looks no different from one that has not — both are numbers, and dividing a second time is silent — so a Nightly Rate arriving from a search is rendered and converted, never divided. On 2026-09-10 seven display surfaces divided again and the whole storefront advertised half: ₱1,587 on a map marker for a room the property page sold at ₱3,173. It showed on no one-night stay, which is why it survived.
_Avoid_: a helper named for the conversion rather than for what it takes. "To per night" reads as safe to apply to anything, including a figure that is already per night; the name is what invited the second division after the first had been fixed.

**Stay Total** — what a room costs for the whole date range asked about. This is what OTV/TGX actually quotes and what prebook confirms, so it is the only hotel price the platform receives directly and the basis of every charge.
_Avoid_: passing one as a bare number. A price and the stay it covers travel together; a figure that has lost its night count cannot be restated per night by whoever renders it next, only guessed at.

**Booked Amount** — a payment restated into the **Reporting Currency** using the rate in force at the moment it was taken. Fixed permanently at that instant, so a report for a past period returns the same figure however long afterwards it is run.
_Avoid_: recomputing a past period at today's rate — a closed month never moves.

**Locked Rate** — the exchange rate captured alongside a payment, and the evidence for its **Booked Amount**. Stored with the booking rather than looked up later, because a rate that was not recorded at the time cannot be recovered.

**Price Promise** — the competitive claim the brand name makes, and it is measured **against other online travel agencies** — Trip.com, Agoda, Expedia, Kiwi — never against an airline's or hotel's own website. Chosen because the fares Duffel and OTV expose carry no commission a direct channel has to pay, so beating direct is not a promise that can be kept; beating an OTA is.
_Avoid_: reading it as a promise to beat a **Home-Market Fare** — a local consolidator on domestic inventory sits outside the claim, and the glossary already records CheapestGo landing multiples above one. _Avoid_: treating a metasearch results row as the benchmark — those compare a raw number, which a per-booking flat fee will always lose on cheap fares.

**Gross Booking Value** — the total customer-facing value of bookings taken, including the supplier's share. A volume measure: it says how much money moved through the platform, not how much the platform earned.
_Avoid_: calling this "revenue" — most of it belongs to the airline or hotel.

**Platform Cost** — the third-party cost of operating a booking over and above what the airline or hotel is owed, and the closed set the markup exists to recover: payment processing (Stripe) plus a supplier platform's own fees. Deliberately excludes hosting, monitoring, mapping and every other running cost of the business — those scale with the product rather than with bookings, so recovering them through a fare would be a margin under another name.
_Avoid_: treating **Platform Cost** as equal to supplier cost — the fare or room rate owed to the provider is not a platform fee. _Avoid_: assuming every supplier carries one. It is presently a **flights-only** cost: Duffel bills FORHU monthly for order and content fees, whereas the OTV monthly invoice is the room cost itself drawn on a credit line, not a fee on top of it.
_Avoid_: reading it as a single percentage. It is **part flat and part proportional** — Duffel bills a fixed fee on each paid order plus a share of the order's value, and Stripe does the same shape again — so a recovery expressed only as a percentage is too thin on cheap fares and too fat on expensive ones.
_Avoid_: assuming a cancelled booking costs nothing. Both suppliers charge on the order as created; the customer's refund returns the markup in full, so a cancellation is a **Platform Cost** with no recovery attached to it.
_Avoid_: conflating the **estimated** and **recorded** figures. A booking has to be priced before it is charged, so the markup is set against an estimate; what each party actually took is only knowable afterwards, from Stripe's balance transaction and the supplier's monthly invoice. Both are **Platform Cost**, and the gap between them is the thing worth watching — a pricing model that is never compared against the recorded figure will keep charging a number that stopped being right without anyone learning of it.

**Net Revenue** — what CheapestGo keeps: **Gross Booking Value** less supplier cost. Equal to the markup, which is deliberately sized to recover **Platform Cost** rather than to earn a margin.
_Avoid_: "profit" — the markup is a cost-recovery buffer, and labelling it profit implies a margin the pricing model does not intend to make. _Avoid_: reading a positive **Net Revenue** as money kept — the monthly platform invoices are settled out of it and are not visible on any single booking.

**Price Hold** — the short window in which a supplier's quote stays chargeable, after which it lapses and the traveller re-quotes. It is a countdown, not a commitment: expiry is the designed behaviour, and nothing about it promises the price will still be available afterwards or that it is the lowest anywhere.
_Avoid_: "price guarantee", and its translations — `가격 보장` and `料金の保証` both read as a promise the product does not make, on a banner shown mid-checkout beside money. Chinese `价格保留` is the right shape. _Avoid_: conflating it with the **Price Promise**, which is a competitive claim about other agencies and has nothing to do with a quote's lifetime.

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

## Support

**Support Chat** — a conversation between one customer and CheapestGo about a trip they have or are trying to book, answered by an **Agent**. Opening one requires signing in, so every Support Chat has an account behind it and therefore a way to reach whoever started it.  A customer has at most one open Support Chat at a time; asking again resumes the one they have rather than starting a second.
_Avoid_: "ticket" — it is not closed by the customer, nothing about it is promised to be answered off-line, and it is not a unit of work that can be handed on while the customer waits somewhere else. A **Chat Reference** now names one, so "not numbered" is no longer the reason; being numbered is what lets a customer cite a conversation, not what turns it into a queue item. _Avoid_: calling it a "session" — it outlives the browser tab it was opened in.
_Note_: until 2026-09-07 a Support Chat was answered first by a model and reached an Agent only on hand-over. The model is gone and the vocabulary of hand-over went with it — a reader who finds `escalation_reason` or a `senderType` of `ai` in the schema is looking at residue, not at a capability.

**Support Widget** — the panel that hosts a Support Chat on the site. The widget is the surface; the Support Chat is the thing it shows. One can exist without the other: the chat continues when the widget is closed. It is never a box a stranger types into — a signed-out visitor is sent to the **Help Page** instead, and signs in from there if they want a person.
_Note_: there is no floating launcher any more. Support is entered from the account menu and from the footer, so no page carries a permanent button, and what the entry point does depends on who is asking.
_Avoid_: using "widget" for the conversation, or "chat" for the button.

**Help Page** — the public answers, at `/help`: what to do when a confirmation has not arrived, how refunds and cancellations work, why the checkout total is higher than the search figure. Readable by anyone, in the domain's language, and indexed.
_Why it exists_: a Support Chat requires an account, so before this page "Support" led a signed-out visitor to a sign-in form and stopped. Being reachable and being usable are different things, and only the first was true — which reads to a visitor as support being unavailable. It is also the ordinary shape for the industry: help articles are public everywhere, and a conversation about *your* booking needs to know whose booking it is.
_Note_: it is the destination of the support entry point for anyone not signed in, and it carries the way to a person at the bottom rather than the top — most of what support is asked is answered by the article above the button.
_Avoid_: confusing it with `/support/login`, which is the staff door and has no customer content on it. _Avoid_: treating it as policy — the **Refund Policy** and the terms are the documents, and this links to them rather than restating them, which is also why it carries no effective date.

**Waiting** — a Support Chat nobody has answered yet. Every Support Chat begins here, at any hour, from its first message. It is a state, not an event: nothing *happens* to put a chat in the queue, because the queue is where a chat starts.
_Avoid_: "escalated", "raised", "handed over" — all three imply a prior owner, and there is never one. _Avoid_: treating an out-of-hours chat as a different kind of thing; it is the same state, differently explained.

**Translation** — a machine rendering of one message into another language, stored beside that message and never in place of it. Which way it goes is decided by the language the message is written in, not by who wrote it: anything not in English is rendered in English for the inbox, and an Agent's English reply is rendered in the language the customer writes in. An Agent who answers a Korean customer in Korean is read by that customer exactly as typed; the English is for their colleagues. Every translation is shown marked as machine-made, to whichever reader it is for.
_Avoid_: calling a translation "the message" — the message is what its author wrote, and that text stays authoritative wherever the two disagree. _Avoid_: treating the two renderings as two messages; it is one message, read twice. _Avoid_: taking the customer's language from the storefront they arrived on — a Korean traveller on the English site writes Korean.
_Why the original is kept_: an Agent answers on the basis of a translation, so a later question about what was promised is really a question about what the Agent read. Re-translating afterwards cannot reproduce it.

**A malfunction never changes a conversation's state** — when translation is unavailable the message is delivered exactly as its author wrote it, marked untranslated, and nothing else moves: no hold, no queue change, no retry into silence.
_Why_: a fault on a shared service is never local. The first time this broke it was one dead API key, which is broken for every conversation on the site at once — so any rule of the form "when it fails, do something different" fires for every customer simultaneously, and the something-different is always worse than the plain truth. A customer can paste English into a translator; they can do nothing whatever with a reply that never arrived.
_Avoid_: a retry-then-hold path, or a "failed N times so hold" threshold — both re-introduce the site-wide surprise under a different name.

**Support Desk** — a second, narrower console for people whose whole job is answering Support Chats: the inbox and the Support Hours, and nothing else.
_Note_: it is now a permission boundary as well as a workspace. A **Support Agent** account can reach the Desk and nothing else; an admin reaches it and every other admin screen too. It was a workspace only, before the role existed.
_Avoid_: granting a Support Agent access by widening the back office — access is granted by building the screen inside the Support Desk, so anything not deliberately built for them stays out of reach.

**Support Hours** — the window in which a **Waiting** Support Chat is promised a same-day answer, kept as one schedule in one timezone for both brands. Outside it a customer can still open a chat and still write; what changes is what they are told — which morning someone will pick it up.
_Avoid_: "opening hours" — the site never closes and the widget never refuses a message. _Avoid_: describing Support Hours as gating the queue — they govern the promise, not the queue.

**Agent** — a CheapestGo staff member handling a customer, whether on a call or in a Support Chat. Already the word used throughout the admin screens.
_Avoid_: "travel agent" (suggests a third party) and "operator" or "bot" — an Agent is always a person, and now the only thing that ever answers a Support Chat.

**Support Agent** — an account that may do Agent work and nothing else: answer Support Chats, set the Support Hours, and look up a booking read-only to verify someone's claim. It cannot reach the back office, cannot change a booking, and cannot promote anyone.
_Avoid_: treating "Support Agent" and "**Agent**" as the same word. Agent is what someone is *doing* — an admin answering a chat is an Agent. Support Agent is what an account is *allowed* to do. Every Support Agent is an Agent; most Agents so far have been admins.
_Avoid_: giving a Support Agent access by widening the back office — access is granted by building the screen inside the **Support Desk**, so anything not deliberately built for them stays out of reach.

**Assignment** — which Agent owns a **Waiting** Support Chat. It is taken by answering: the first Agent to reply owns the conversation, and it leaves the unassigned queue for everyone else. There is no separate claiming step, and therefore no claim to go stale when someone opens a conversation and walks away.
_Avoid_: treating Assignment as permission — any Agent can read any Support Chat; what Assignment says is who is dealing with it.

**Resolved** — an Agent's statement that a Support Chat is finished. It is not an ending: a customer who writes again reopens the conversation, with the same transcript, and it returns to **Waiting** exactly as a fresh one would. Only an Agent resolves; the customer closing the widget means nothing.
_Avoid_: "closed" — nothing is prevented afterwards. _Avoid_: reading a Resolved chat as one the customer agreed was finished; it records what the Agent believed.

**Chat Reference** — the short code that names one Support Chat out loud, `CS-` and six characters, e.g. `CS-9QM2K7`. It exists so a customer writing from their own mail client, or an Agent naming a case to a colleague, can point at a conversation without a link.
_Avoid_: treating it as a credential. Holding a Chat Reference grants nothing: a Support Chat is reached by signing in, and the reference only names the thing you must already be entitled to see. This is the deliberate difference from helpdesks whose reference number *is* the way in.
_Avoid_: reading it as a booking reference. Bookings are `CG-` and `GG-`, one prefix per brand, because a booking has to be attributed to a brand inside one shared Stripe account. A chat has no money in it and the queue is deliberately blind to brand, so one prefix serves both.
_Avoid_: "ticket number" — see the note under **Support Chat** on why the conversation is not a ticket.

**Linked Booking** — a trip a Support Chat is about, named by its booking reference. A chat has any number of them, including none: a customer has at most one open Support Chat, so the single chat that is open has to carry every question they have, and a trip is often a flight and a hotel bought separately. A general question about how refunds work has no Linked Booking at all and is not incomplete for lacking one.
_Note_: the link records who made it. A customer chooses from their own bookings when opening the chat; an Agent can add or remove one afterwards. Nothing is linked by inference — a booking attached because it merely happened to be upcoming is a guess presented as a fact, and the place it would surface is a refund dispute.
_Avoid_: calling it "the booking" as though there were one.

**Urgency** — how close a Support Chat's customer is to travelling, and therefore how badly waiting hurts them. It is read from the **Linked Booking**, not declared: someone in a hotel tonight or at an airport in three hours outranks someone asking about a receipt, whatever order they wrote in. A chat with several Linked Bookings takes the most urgent of them; a chat with none is ordinary, which is right — a question with no trip attached is rarely the one that cannot wait.
_Why it is not asked_: a customer offered a box marked "urgent" ticks it, and a queue sorted by self-assessment is sorted by nothing. Departure dates are already known, already true, and cannot be argued with.
_Note_: an Agent can overrule it, and the override is what is stored — Urgency itself is computed at read time and never written down, because a booking that was three weeks away when the chat opened is three days away later and the queue must know that without anyone revisiting the row.
_Avoid_: "priority" as though it were a property of the conversation. It is a property of the *trip*, and it changes on its own as the date approaches.

**Internal Note** — something an Agent writes on a Support Chat for other Agents. It has no recipient: it is never delivered, never translated, never shown to the customer, and its arrival does not change the customer's place in the queue.
_Avoid_: thinking of it as a message with the audience turned off. A Note is an annotation on the conversation, which is why it is kept apart from the transcript rather than filtered out of it — the customer's view of a Support Chat cannot omit a Note it is incapable of reading.

**AI Search** — the hero's natural-language mode, which turns one sentence into search parameters and runs a search. Distinct from a Support Chat: it is a single turn, it holds no history, and it is about finding a trip rather than fixing one.
_Avoid_: calling it a chat or an assistant. _Note_: as of 2026-09-05 it is a mock — a two-second delay and a hardcoded result — so treat it as a design placeholder, not a capability.

## Localization

**Interface Language** — the words CheapestGo itself authors on the **storefront**: buttons, labels, map controls, policy headings, and the amenity vocabulary its own code maps supplier codes onto. Everything here is translatable by the team, into every locale the storefront offers, and English appearing in it reads as an unfinished product rather than an imported one. The back office is deliberately outside it — the only people who see admin are the team, so it stays English however many locales the storefront gains.
_Avoid_: treating a screen as translated because its keys exist — a string that was never given a key is invisible to any coverage count, and those are the ones a customer notices first, because they sit in the booking funnel rather than in the settings.

**Supplier Content** — the words a provider wrote: property descriptions, room names, bed notes, cancellation prose. It arrives in whatever language the supplier holds and is passed through unchanged, so it stays English on a Korean storefront. Deliberate: the content cache keeps one description per property with no language dimension, and a machine translation of a description sitting beside a price someone is being asked to pay is worse than the original.
_Avoid_: counting it as a translation gap. It is a supplier capability question — whether OTV holds Korean text at all — not a missing key.

**Storefront Locale** — the language a page is written in. It selects the **Interface Language** and nothing else: not **Supplier Content**, not the **Charge Currency**, not which properties are returned.
_Avoid_: inferring the market from it — locale is what a page is written in, not who may buy.

**Language Territory** — the set of languages one domain is allowed to serve, and the rule that no language is served by two domains. `airanggo.com` holds Korean alone; `cheapestgo.com` holds English, Japanese and Chinese. A language has exactly one home, so two of our own URLs never compete for the same query and `hreflang` has a single alternate to name per language.
_Avoid_: adding a locale to a domain because the routing already supports it — the constraint is commercial, not technical, and the cost of breaking it is that a brand competes with itself for its own market. _Avoid_: reading it as a restriction on visitors; anyone may buy from any storefront, in any **Charge Currency** offered.
