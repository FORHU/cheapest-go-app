# v2 Feature Port — status

Tracks how far `cheapestgo-api-v2` and `cheapestgo-app-v2` have caught up with v1. See **Feature Port**, **Slice**, and **Side-by-side Check** in [CONTEXT.md](../CONTEXT.md); **Design Independence** and **Functional Parity** in app-v2's `CONTEXT.md`; [ADR-0014](adr/0014-v2-reads-v1s-schema-until-cutover.md) for the shared schema; [ADR-0015](adr/0015-locale-lives-in-the-url.md) for locale routing; [ADR-0016](adr/0016-parity-is-functional-not-visual.md) for why slices are cut by capability.

**Scope: functional parity.** Every capability v1 has, v2 has, behaving the same way — regardless of when it was built in v1. Design does not cross: v1's components are read as specifications of behaviour, never copied as markup.

v1 is **not frozen** — it is the deployed system and takes fixes in realtime. The port keeps up by measurement, not by standing still: each slice records the v1 commit it is level with, and re-runs its delta before it is called done.

## Watermarks

`6b0ced4` (2026-08-06) is the conservative floor. Where api-v2 already implements a capability it was ported from v1 at some point between June and 2026-08-19, but *which* point was never recorded — so every slice starts at the floor. Re-checking something already ported is cheap; missing something is not.

```
git -C cheapest-go-app log <watermark>..HEAD --oneline -- <that slice's v1 paths>
```

Empty means level. Anything listed must be ported before the watermark advances. A gap marked "absent" means the capability does not exist in v2 at all, so there is no delta to take — port v1's current state whole.

| # | Slice | Watermark | Done |
|---|-------|-----------|------|
| C0a | Backend consolidation | `12f2af3` | 2026-08-24 |
| C0b | Locale + SEO shell | `6b0ced4` | not started |
| C1 | Hotel search | `6b0ced4` | not started |
| C2 | Hotel booking | `6b0ced4` | not started |
| C3 | Flights | `6b0ced4` | not started |
| C4 | Account | `6b0ced4` | not started |
| C5 | Admin | `6b0ced4` | not started |
| C6 | Ops | `6b0ced4` | not started |
| C7 | Mobile and misc | `6b0ced4` | not started |

A slice is **done** when both v2 repos typecheck, their tests pass, its delta is empty, it honours api-v2's **Layer Contract** (`Route → Controller → Service → Repository`, see [api-v2/CONTEXT.md](../../cheapestgo-api-v2/CONTEXT.md)), and it has survived a Side-by-side Check against v1 running on the same 5433 database.

The Layer Contract applies to what the slice touches, including code already there: a slice that ports a capability also lifts that capability out of its route file. api-v2 currently has 23 route files against 4 controllers, 4 services and 4 repositories, with roughly 143 raw database call sites sitting in routes — worst in `admin.route.ts` (37), `cron.route.ts` (30) and `internal.route.ts` (22). That debt is paid down slice by slice, never as a separate cleanup pass.

---

## C0a — Backend consolidation

Makes v2 actually be a separate frontend and backend before any capability is ported into it ([ADR-0017](adr/0017-api-v2-owns-all-domain-logic.md)). Nothing here is user-visible; everything after it is blocked on it.

app-v2 carries 23 files under `src/server/` and 20 of its own API routes reimplementing TravelgateX, Postgres, FX locking, Stripe and auth — so prebook, search, autocomplete, confirm, cancel and amend each exist three times, in v1, api-v2 and app-v2. Two incompatible sessions are live at once: app-v2 sets a Lucia `cg-session` cookie while api-v2's `requireAuth` verifies a JWT `access_token`, which is why `/hotels/create-payment`, `/confirm` and `/cancel` are unreachable from app-v2 today.

**Work:** delete `app-v2/src/server/`; retire the 17 non-proxy routes under `app-v2/src/app/api/`; move the five `fetch('/api/...')` call sites onto `@/shared/lib/http`; drop `DATABASE_URL` and `DATABASE_URL_UNPOOLED` from app-v2's environment; retire Lucia in favour of api-v2's JWT; delete `api-v2/prisma/migrations/` per [ADR-0014](adr/0014-v2-reads-v1s-schema-until-cutover.md). The **Layer Contract** applies from here on.

**Verify [ADR-0003](adr/0003-users-role-is-authoritative.md) survives:** v1 reads `users.role` through the Lucia session. api-v2's JWT must carry or re-derive that role, or admin authorization breaks silently — check it here, not in C5.

**Check:** log in through api-v2, call an authed endpoint from app-v2 and get a 200; confirm no app-v2 route reaches TravelgateX or Postgres; confirm app-v2 boots with no `DATABASE_URL`.

### Done so far (2026-08-24, uncommitted)

- api-v2 gained `GET /hotels/count` through all four layers — repository `countHotelContentByCity`, service `countByCity`, controller `count`, route. It was the only app-v2 route with no api-v2 equivalent that had a live caller.
- `api-v2/prisma/migrations/` deleted per [ADR-0014](adr/0014-v2-reads-v1s-schema-until-cutover.md).
- app-v2's auth moved to api-v2: `auth.api.ts` rewritten onto `@/shared/lib/http` (`/auth/login`, `/auth/register`, `/auth/logout`, `/auth/me`, `/auth/request-reset`, `/auth/reset-password`), and both Google OAuth entry points now leave for api-v2's `/auth/google`. `authFetch` is gone, and so is `src/app/auth/callback/` — api-v2 handles the callback and redirects to `SITE_URL`.
- Callers repointed: hotel count, trending destinations, and hotel reviews now address api-v2 directly.
- **19 of app-v2's 20 API routes deleted** — all of `auth/`, all of `booking/`, `search`, `hotels/count`, `hotels/property/[id]`, `hotels/[id]/review`, `trending-destinations`. Only `autocomplete` remains.
- **18 of the 23 `src/server/` files deleted** — auth, admin, bookings, landing, stripe, email, csrf, rate-limit, safe-error, currency, exchange-rates, the TGX wrapper and the TGX search.
- Test environment now supplies `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL` and the Stripe key, so anything importing `shared/lib/env` resolves in tests instead of building URLs from the string `undefined`.
- Both repos typecheck; app-v2 66 tests pass, api-v2 43 tests pass.

### Destination autocomplete, ported

`/api/autocomplete` was the last thing holding app-v2's server layer up. It called v1's `autocompleteDestinations` — Mapbox, plus the city-alias dictionary, plus a hotel-coverage filter — and returned the `rung`, `bbox`, `canonicalCity` and `districtName` the search page needs to scope map pins to a city. api-v2's `autocompleteDestinations` is a *different* implementation built on Google Places (`src/lib/google/places.ts`) that returns none of those, so repointing the callers at it would have broken map scoping silently. `search.ts` also called TravelgateX directly with an API key, which [ADR-0017](adr/0017-api-v2-owns-all-domain-logic.md) forbids outright.

v1's implementation now lives in api-v2 as `GET /hotels/destinations`, following the Layer Contract: `DestinationsRepository.findCityCoverage` for the catalog lookup, `DestinationsService` for the Mapbox calls, alias remapping, rung mapping and ranking, and a `destinations` controller handler. Next's `unstable_cache` has no equivalent here, so the 300-second response cache is a bounded in-process map. v1's alias data came across whole: api-v2 held **1,741 alias entries against v1's 9,410** and had no `matchAliasQuery` at all, and no `countries.ts` either.

app-v2 gained `features/search/api/destinations.api.ts`, which branches on mode — hotels to `/hotels/destinations`, flights to `/airports/search`. Serving both from one place is what justified a route handler here in the first place.

**C0a is complete.** `app-v2/src/server/` and `app-v2/src/app/api/` are both gone; `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and `DATABASE_SSL` are out of its environment; `postgres`, `lucia` and the argon2 binding are out of its dependencies. The build reports 40 routes and no API routes at all. app-v2 is a frontend.

Two latent bugs surfaced from typing the boundary. The search bar's `DestSuggestion` did not include `'airport'` even though flights mode returns airports — untyped `json.data` had been concealing it. And `Destination.countryCode` is optional on the shared type while every suggestion in fact carries one, so the suggestion type now says so.

**Remaining debt for C1:** api-v2 still has the Google Places `autocompleteDestinations` behind `POST /hotels/autocomplete` and `GET /hotels/suggest`. Nothing in app-v2 uses them any more. Confirm no mobile client does either, then remove them — two destination autocompletes is the duplication this slice existed to end.

## C0b — Locale and SEO shell

Multi-language is a feature; the pages it wraps are not. app-v2 today has `src/i18n/request.ts` reading a cookie, no `middleware.ts`, no `routing.ts`, no `robots.ts`, no `sitemap.ts`, and `cn.json` where it should have `zh.json`. Locale moves into the URL per [ADR-0015](adr/0015-locale-lives-in-the-url.md).

**v1 reference:** `src/middleware.ts`, `src/i18n/`, `src/lib/seo/hreflang.ts`, `src/app/robots.ts`, `src/app/sitemap.ts`, `src/locales/`

**Gaps:** `middleware.ts`, `routing.ts`, `robots.ts`, `sitemap.ts`, hreflang — all absent. Rename `cn.json` to `zh.json`. app-v2's locale files hold roughly 10% of v1's strings (12 KB against 116 KB), but strings arrive with the slice that uses them, not here.

**Check:** `/ko/...` and `/ja/...` resolve to the right pages, `hreflang` and `sitemap.xml` emit all four locales, and an English URL is unprefixed.

## C1 — Hotel search

TravelgateX client and search, ETG room-group seeding, city aliases and the district-to-city remap, country bounding-box filtering, the granularity ladder ([ADR-0006](adr/0006-granularity-ladder-is-etg-driven.md)), optimistic catalog display ([ADR-0007](adr/0007-optimistic-catalog-display.md)), province search ([ADR-0004](adr/0004-province-search-is-etg-only.md)).

**v1 reference:** `src/lib/server/stays/`, `src/lib/server/search.ts`, `src/lib/search/`, `src/lib/constants/cityAliases.ts`, `src/lib/geolocation.ts`, `src/lib/property/`, `src/lib/room/`, `src/lib/destination-images.ts`, `src/app/api/search/`, `src/app/api/autocomplete/`, `src/app/api/stays/`, `src/__tests__/stays/`

**v2 target:** `src/lib/hotels/`, `src/services/hotels.service.ts`, `src/routes/hotels.route.ts`

**Gaps:** `search/more` and `google/search` are absent. Everything else exists and is behind.

## C2 — Hotel booking

quote, prebook, create-payment, confirm, cancel, amend, save — plus policy normalisation, the cancellation engine, the Stripe webhook, and FX locked at booking in USD ([ADR-0008](adr/0008-fx-locked-at-booking-in-usd.md)).

**v1 reference:** `src/app/api/booking/`, `src/app/api/stays/`, `src/app/api/webhooks/stripe/`, `src/lib/server/bookings.ts`, `src/lib/server/checkout.ts`, `src/lib/server/policy-normalizer.ts`, `src/lib/server/cancellation-engine.ts`, `src/lib/server/refunds.ts`, `src/lib/bookings/`, `src/lib/cancellation.ts`, `src/lib/pricing.ts`, `src/lib/currency.ts`, `src/lib/server/exchange-rates.ts`, `src/__tests__/checkout/`

**v2 target:** `src/services/bookings.service.ts`, `src/routes/bookings.route.ts`, `src/routes/webhooks.route.ts`, `src/lib/policies/normalizer.ts`, `src/lib/pricing.ts`

**Gaps:** `booking/save` is absent. `policy-normalizer`, `cancellation-engine` and `refunds` predate the port window (May to June 2026) — take v1's current state, not a delta.

**Blocked on:** `20260816000001_hotel_prebook_quotes.sql` and `20260816000002_booking_fx_lock.sql` appear in neither repo's `schema.prisma`, which means they are probably unapplied. Verify against the live 5433 database before starting.

## C3 — Flights

Search and booking across Duffel and Mystifly, order placed before payment ([ADR-0009](adr/0009-airline-order-placed-before-payment.md)), one slice at a time ([ADR-0010](adr/0010-flights-are-shopped-one-slice-at-a-time.md)), duplicate departures warned not refused ([ADR-0011](adr/0011-duplicate-departures-are-warned-not-refused.md)), internal routes called in-process ([ADR-0012](adr/0012-internal-routes-are-called-in-process.md)), a failed booking cancels its own order ([ADR-0013](adr/0013-a-failed-booking-cancels-its-own-order.md)).

**v1 reference:** `src/lib/server/flights/`, `src/app/api/flights/`, `src/app/api/internal/`, `src/types/flights.ts`, `src/utils/flight-utils.ts`

**v2 target:** `src/lib/flights/`, `src/services/flights.service.ts`, `src/routes/flights.route.ts`, `src/routes/internal.route.ts`

**Gaps:** `refund`, `void`, `void-quote` and `reissue` exist in api-v2 only under `/mystifly/*`; v1's are provider-agnostic and dispatch by provider. Partial, not done.

## C4 — Account

Auth, preferences, saved trips, price alerts, vouchers. `users.role` is authoritative ([ADR-0003](adr/0003-users-role-is-authoritative.md)); no RLS ([ADR-0002](adr/0002-remove-legacy-rls.md)).

**v1 reference:** `src/app/api/auth/`, `src/app/api/account/`, `src/app/api/preferences/`, `src/app/api/saved-trips/`, `src/app/api/price-alerts/`, `src/app/api/voucher/`, `src/lib/server/auth.ts`, `src/lib/server/preferences.ts`, `src/lib/server/vouchers.ts`, `src/stores/authStore.ts`

**v2 target:** `src/routes/auth.route.ts`, `users.route.ts`, `saved-trips.route.ts`, `price-alerts.route.ts`, `vouchers.route.ts`, `src/services/auth.service.ts`

**Gaps:** none absent. All behind.

## C5 — Admin

The largest gap in the API. app-v2 has all 20 admin pages scaffolded; api-v2 has 13 admin endpoints against v1's 20.

**v1 reference:** `src/app/api/admin/`, `src/lib/server/admin/`

**v2 target:** `src/routes/admin.route.ts`

**Gaps, all absent:** `brand`, `destinations`, `mobile`, `notifications`, `price-alerts`, `reviews`, `run-cron`, `saved-trips`, `search`, `settings`, `stripe`, `tgx-health`

`fn/[name]`, v1's generic function runner, is deliberately not ported — its actions fold into admin panel actions.

## C6 — Ops

Crons and internal maintenance routes.

**v1 reference:** `src/app/api/cron/`, `src/app/api/internal/`, `src/app/api/fn/`, `scripts/`, `.github/workflows/`, `src/lib/server/admin/recovery.ts`

**v2 target:** `src/routes/cron.route.ts`, `src/routes/internal.route.ts`, `src/scripts/`

**Gaps, all absent:** `cron/etg-dump-sync`, `cron/seed-room-groups`, `internal/cheapest-flight`, `internal/refresh-flights`, `internal/revalidate-flight`

**Watch this one.** `etg-dump-sync` and `seed-room-groups` populate the hotel catalog. If the 5433 database is not already seeded, C1's search has nothing to return and these two move into C1. Check before starting C1, not when C6 comes around.

No TGX-backed cron is in scope at all — TravelgateX prohibits scheduled calls not triggered by real user intent.

## C7 — Mobile and misc

**v1 reference:** `src/app/api/mobile/`, `src/app/api/invoice/`, `src/app/api/weather/`, `src/app/api/email/`, `src/app/api/google/`, `src/app/api/og/`

**v2 target:** `src/routes/mobile.route.ts`, `invoices.route.ts`, `weather.route.ts`, `email.route.ts`, `google.route.ts`, `photos.route.ts`

**Gaps:** `google/search` and `og` are absent.

---

## Out of scope

- `src/components/voice/VoiceAssistant.tsx` and `api/voice` — Voice Layer is Phase 2.
- `api/debug/tgx`, `api/test-email`, `internal/setup-staging-schema` — development-only.
- `api/fn/[name]` — generic function runner, deliberately replaced by admin actions.
- All of v1's design: components, styling, layout, landing sections, legal-page markup.
