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

**Path lists include v1's frontend.** A Slice spans both repos, so a slice that cannot see `src/components/` cannot see its own behaviour changing. Measured 2026-09-02: five commits and ~400 insertions of v1 frontend behaviour — including MapResultsClient's streaming prices and unavailability banners — were tracked by no watermark at all. Design does not cross ([ADR-0016](adr/0016-parity-is-functional-not-visual.md)), so a commit in these paths that only moves markup or styling is noted and skipped rather than ported. That filter is a judgement call per commit, not something the delta decides.

| # | Slice | Watermark | Delta (re-run 2026-09-16) | State |
|---|-------|-----------|---------------------------|-------|
| C0a | Backend consolidation | `12f2af3` | 67 commits, but its paths overlap every slice below | level |
| C0b | Locale + SEO shell | `e79f354` | empty — but see the note on translations | **SEO done, translations open** |
| C1 | Hotel search | `8ef657b` | empty as of 2026-09-16 | **done** — see below |
| C2 | Hotel booking | `8bdd4a4` | empty as of 2026-09-17 | **done** — see below |
| C3 | Flights | `8bdd4a4` | Mystifly + segment terminals left | **done** — see below |
| C4 | Account | `8bdd4a4` | empty as of 2026-09-17 | **done** — see below |
| C5 | Admin | `6b0ced4` | the Support Desk half, which is C8 | **mostly done** — see below |
| C6 | Ops | `8bdd4a4` | support crons only, which are C8 | **done** — see below |
| C7 | Mobile and misc | `8bdd4a4` | empty as of 2026-09-17 | **done** — see below |
| C8 | Support Chat | `6b0ced4` | **35 commits** | not started — slice added 2026-09-16 |

Re-measure with `bash scratch/port-delta.sh` (`-v` for the commits themselves). Both v2 repos were
green on 2026-09-16: api-v2 196 tests, app-v2 147 tests, both typechecking.

A slice's watermark advances only when its delta is empty, so a slice marked done can **drift back out of done** when v1 moves under it. That is not a regression in v2 — it is the measurement working. C0b and C1 are both in that state today.

A slice is **done** when both v2 repos typecheck, their tests pass, its delta is empty, it honours api-v2's **Layer Contract** (`Route → Controller → Service → Repository`, see [api-v2/CONTEXT.md](../../cheapestgo-api-v2/CONTEXT.md)), and it has survived a Side-by-side Check against v1 running on the same 5433 database.

The Layer Contract applies to what the slice touches, including code already there: a slice that ports a capability also lifts that capability out of its route file. api-v2 currently has 23 route files against 4 controllers, 4 services and 4 repositories, with roughly 143 raw database call sites sitting in routes — worst in `admin.route.ts` (37), `cron.route.ts` (30) and `internal.route.ts` (22). That debt is paid down slice by slice, never as a separate cleanup pass.

---

## C0a — Backend consolidation

Makes v2 actually be a separate frontend and backend before any capability is ported into it ([ADR-0017](adr/0017-api-v2-owns-all-domain-logic.md)). Nothing here is user-visible; everything after it is blocked on it.

app-v2 carries 23 files under `src/server/` and 20 of its own API routes reimplementing TravelgateX, Postgres, FX locking, Stripe and auth — so prebook, search, autocomplete, confirm, cancel and amend each exist three times, in v1, api-v2 and app-v2. Two incompatible sessions are live at once: app-v2 sets a Lucia `cg-session` cookie while api-v2's `requireAuth` verifies a JWT `access_token`, which is why `/hotels/create-payment`, `/confirm` and `/cancel` are unreachable from app-v2 today.

**Work:** delete `app-v2/src/server/`; retire the 17 non-proxy routes under `app-v2/src/app/api/`; move the five `fetch('/api/...')` call sites onto `@/shared/lib/http`; drop `DATABASE_URL` and `DATABASE_URL_UNPOOLED` from app-v2's environment; retire Lucia in favour of api-v2's JWT; delete `api-v2/prisma/migrations/` per [ADR-0014](adr/0014-v2-reads-v1s-schema-until-cutover.md). The **Layer Contract** applies from here on.

**Verify [ADR-0003](adr/0003-users-role-is-authoritative.md) survives:** v1 reads `users.role` through the Lucia session. api-v2's JWT must carry or re-derive that role, or admin authorization breaks silently — check it here, not in C5.

**Check:** log in through api-v2, call an authed endpoint from app-v2 and get a 200; confirm no app-v2 route reaches TravelgateX or Postgres; confirm app-v2 boots with no `DATABASE_URL`.

### Done so far (2026-08-24)

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

### Done (2026-08-25)

v2 did **not** copy v1's mechanism here, and that was a deliberate choice — see the new section in [ADR-0015](adr/0015-locale-lives-in-the-url.md). v1 rewrites `/ko/search` to `/search` and carries the language in a cookie, so internal links drop the prefix and the language ends up belonging to the visitor rather than the link. v2 uses an `app/[locale]` segment, so the prefix survives navigation, no cookie is involved, and pages prerender per locale.

- `i18n/routing.ts` (`en`, `ko`, `ja`, `zh`, default `en`, `as-needed`), `i18n/navigation.ts` (locale-aware `Link`, `useRouter`, `usePathname`, `redirect`), and `i18n/request.ts` rewritten to read the segment. The request chain is brand lock → segment → default, with **no cookie**: one that outranked the URL would make a shared `/ko/...` link render in the recipient's language.
- **42 route files moved** under `app/[locale]/`; `/admin` deliberately left outside it.
- **~40 files had navigation imports swapped.** `useSearchParams`, `useParams` and `notFound` are not locale-aware and stayed on `next/navigation`, so the swap split mixed imports rather than rewriting whole lines. No call site changed — the wrappers share the originals' API.
- `middleware.ts` combines next-intl's middleware with the `/admin` guard, now on api-v2's JWT `access_token` rather than v1's Lucia `cg-session`.
- `shared/lib/seo.ts` (hreflang + canonical), `app/robots.ts`, `app/sitemap.ts`. The sitemap uses **v2's** route names — `/terms`, not v1's `/terms-of-service`.
- `cn.json` renamed to `zh.json`, and the two components that offered `cn` as a language now offer `zh`. `LocaleSelector` switches the URL through `router.replace(pathname, { locale })` instead of writing a cookie.

**Verified:** build clean and every route prerenders per locale (`/en`, `/ko`, `/ja`, `/zh`); `/`, `/ko`, `/ja/search`, `/zh/terms` all 200; `/de/deals` 404s; `<html lang>` tracks the URL; `/ko` renders Korean; `/admin` 307s to `/login` without a session and 200s with one; `/ko/admin` 404s; `robots.txt` disallows private paths under every prefix; `sitemap.xml` emits 104 URLs. Typecheck clean, 66/66 tests pass.

**One bug found by the smoke test:** `robots.txt` and `sitemap.xml` are routes, not files, so the locale middleware was rewriting them into the segment and serving the rendered homepage to anything asking for `/robots.txt`. Both are now excluded from the matcher.

**Debt:** some components still hold hardcoded English (`Sign in` renders untranslated on `/ko`). The locale files themselves are at 100% parity between `en` and `ko` — 248 keys each — so this is components not reaching for the keys, and it is fixed per slice as each one is touched.

## C1 — Hotel search

TravelgateX client and search, ETG room-group seeding, city aliases and the district-to-city remap, country bounding-box filtering, the granularity ladder ([ADR-0006](adr/0006-granularity-ladder-is-etg-driven.md)), optimistic catalog display ([ADR-0007](adr/0007-optimistic-catalog-display.md)), province search ([ADR-0004](adr/0004-province-search-is-etg-only.md)).

**v1 reference:** `src/lib/server/stays/`, `src/lib/server/search.ts`, `src/lib/search/`, `src/lib/constants/cityAliases.ts`, `src/lib/geolocation.ts`, `src/lib/property/`, `src/lib/room/`, `src/lib/destination-images.ts`, `src/app/api/search/`, `src/app/api/autocomplete/`, `src/app/api/stays/`, `src/__tests__/stays/`, `src/components/search/`, `src/components/property/`, `src/stores/searchStore.ts`, `src/hooks/`

**v2 target:** `src/lib/hotels/`, `src/services/hotels.service.ts`, `src/routes/hotels.route.ts`, and app-v2's `features/search/`, `features/property/`

**Gaps:** `search/more` and `google/search` are absent. Everything else exists and is behind.

C1 is too large for one pass — api-v2's hotels module is roughly 1,400 lines behind across 30 v1 commits — so it runs as four checkpoints, each ending in its own Side-by-side Check.

| | Checkpoint | State |
|---|---|---|
| C1a | Amenity vocabulary | 2026-08-25 |
| C1b | ETG content fetch and persistence | 2026-08-25 |
| C1c | Room groups, room catalog, the photo matcher | 2026-08-25 |
| C1d | Retire the duplicate Google Places autocomplete | 2026-08-25 |

### C1a — Amenity vocabulary (2026-08-25)

api-v2 held **91 of v1's 234** OTV amenity codes and **none** of the 65 ETG room slugs, and was missing `ETG_ROOM_AMENITY_MAP`, `etgRoomAmenityToLabel` and `normalizeStoredAmenity` entirely. Anything unmapped falls through a prettifier, so a supplier's non-English label reached an English page untouched — the defect v1 fixed in `ec05bf5` ("fix Russian amenities display").

`amenityCodes.ts` was ported whole (456 lines, one importer, so a wholesale replace was safe) and gained `normalizeAmenityList`, which handles what `hotel_content.amenities` actually stores: plain strings prettified from non-English codes alongside `{ code }` objects from TGX. It is now applied where api-v2 previously returned the column raw — `getProperty` in the service, and the instant catalog in `lib/hotels/search.ts`.

**Verified:** 19 of 258 distinct stored amenity strings are re-mapped, affecting **4,195 of 31,860** hotel-amenity rows — `Gym` → `Fitness Center`, `Laundry` → `Laundry Service`, `Breakfast` → `Breakfast Available`, plus casing canonicalisation. A property returns the same count it stores (41 in, 41 out — nothing dropped), and search results carry normalised amenities through the catalog path. 14 new tests; api-v2 57 tests, typecheck and build clean.

**Not fixed, and deliberately:** some supplier labels contain homoglyphs — `Golf сourse` has a Cyrillic `с`. Those pass through unchanged, which is right: the mapper canonicalises known vocabulary, it does not repair corrupt input.

### C1b — ETG content fetch and persistence (2026-08-25)

**96.9% of the catalog had no description** — 1,105,424 of 1,140,510 rows — so property pages rendered with no prose. ETG returns one in the very same `hotel/info` response api-v2 was already calling for amenities, and it was being discarded.

New `lib/hotels/etg.ts`: `parseEtgHotel` takes name, description and amenities from one hotel object, preferring `amenity_groups` where ETG provides them and falling back to `serp_filters` (its own facet vocabulary, which covers hotels the groups miss). `fetchEtgHotelContent` batches slug ids in 500s. `HotelsRepository.upsertEtgContent` persists per hotel, writing each field only where the existing row has nothing better — a richer TGX name or description is never replaced by an ETG one — and one row failing cannot cost the batch.

**A wrong turn worth recording.** The obvious wiring was the slug-id branch, which is where `fetchEtgAmenitiesBatch` lived. Then a catalog check showed **every `hotel_id` is numeric — zero slug ids** — so that branch never executes and the change would have done nothing. The description extraction had to go on the *hid* path, which is why the parser is shared rather than living inside one fetcher.

**Verified end to end against a live search.** Cebu had 0 of 385 descriptions. One search produced `ETG hid lookup: 30 with amenities, 30 with description, of 72` → `upserted 30 hotels`, leaving **30 of 385** — with real prose, and `content_source` still `tgx`, confirming the upsert added the description without overwriting existing fields. 14 new tests; api-v2 71 tests, typecheck and build clean.

`fetchEtgAmenitiesBatch` was left orphaned by the change and deleted.

### C1c — Room catalog and the photo matcher (2026-08-25)

api-v2's property endpoint returned `rooms: 0` and had no room-level content of any kind — no `roomPhotos`, no `matchEtgRoomGroup`, no `room_groups` handling. This is the capability the room-photo fix made in v1 needed before it could be ported.

- **`lib/hotels/roomMatch.ts`** — the matcher, kept pure so it is testable without a supplier. TGX names a room one way and ETG files its photos under another, so the link is text alone: a cascade of bedding-type match, exact name, prefix, parenthesis-stripped, then bed-type keyword. It deliberately has no tier-word fallback — matching on "deluxe" hands the same photos to every room of that grade, and on a page someone books from a wrong photo is worse than none.
- **`lib/hotels/roomGroups.ts`** — ETG `room_groups` parsing, including the `{size}` placeholder in image URLs and `name_struct.bedding_type`.
- **`repositories`** — `findRoomGroups` / `saveRoomGroups`.
- **`services/roomCatalog.service.ts`** — stored catalog first, live ETG seed otherwise, result stored either way.
- **`orderRoomPhotosByDistinctiveness`**, the v1 fix, now applied in `getProperty`.

**A real bug found by testing rather than reading.** `room_groups` defaults to `[]`, so an untouched row is indistinguishable from one that was seeded and genuinely came back empty — and treating empty as final meant **no hotel with the default value ever got seeded**. `room_groups_seeded_at` is the discriminator, and the repository now returns it.

**Verified end to end.** Ml Suites (`10569363`): before, `rooms: 1` with `photos: 0`. After, **`photos: 8`, `amenities: 10`**, with 14 ETG groups persisted and a seed timestamp written; a second request serves from the stored catalog. 15 new tests including the Hotel Naru pair, which must never collide. api-v2 86 tests, typecheck and build clean.

**Two things worth knowing.** Hotel Naru Seoul itself returns `rooms: 0` for the dates tried — TGX answers with GraphQL errors, meaning no availability, which is supplier-side and not a defect here. And `hotel_search_cache` will serve a stale empty result for a hotel+date pair, so clear the row when testing a change to this path.

#### Audit of the mapping, across every seeded hotel

`src/scripts/room-match-audit.ts` in api-v2 runs the matcher over all 959 hotels with seeded groups (38,811 room descriptions) and answers three questions.

| | |
|---|---|
| Collisions between **differently named** rooms | **1 hotel (0.1%), 3 descriptions (0.0%)** |
| Group pairs sharing at least one photo | **531,895 of 1,082,580 — 49.1%** |
| Mean overlap where photos are shared | **65.7%** |

The matcher is sound: essentially nothing collides. The single case is `"economy single room"` and `"standard single room"` both landing on `"Standard Single room (single bed)"` — Economy has no ETG group of its own, so it falls through to a bed-type match. Both are single rooms, so it is defensible, but Economy does show Standard's photos.

**The important number is the overlap.** Half of all room-group pairs at a hotel share photos, and where they do it averages two thirds. Hotel Naru was not an unlucky hotel — it is the normal shape of this data, which is what makes `orderRoomPhotosByDistinctiveness` a catalog-wide fix rather than a patch for one complaint.

A first version of the audit reported 47.5% of hotels colliding. That was measuring ETG's own duplicate group names collapsing onto the first occurrence, which is the dedup working as designed. Counting only distinct names gives the 0.1% above.

### C1d — One destination autocomplete (2026-08-25)

api-v2 carried two: the ported Mapbox-plus-alias one behind `GET /hotels/destinations`, and an older Google Places one behind `GET /hotels/suggest`, `POST /hotels/autocomplete` and `POST /hotels/autocomplete/resolve`.

**A correction to what C0a recorded.** That note said nothing in app-v2 used them. `/hotels/suggest` was in fact called from two places — `app/[locale]/search/page.tsx` and `features/search/components/search-view.tsx` — to resolve a destination string to coordinates when the URL carries none. Both now call `/hotels/destinations`, which returns the same coordinates but resolved through the city-alias dictionary and ranked by whether we stock the place.

The three routes, their controller handlers, and the whole Google Places autocomplete block in `lib/google/places.ts` — `autocompleteDestinations` plus the four helpers only it used — are removed. Confirmed unused first by api-v2's own mobile route, by every internal caller, and by the Postman collection.

**Verified:** the three endpoints 404, `/hotels/destinations` still answers, both repos typecheck, api-v2 86 tests, app-v2 66 tests, both builds clean.

## Catch-up — deltas re-run 2026-09-02

v1 moved under C0b and C1 after both were called done. Neither is a defect in what was ported; the watermark simply is no longer current. Measured with the command at the top of this file.

**Why this is not "port last week's commits."** The week window and the deltas do not agree in either direction. Three of C1's six owed commits (`1cff91c`, `715bb89`, `176b03d`) are dated 2026-08-25 and fall *before* a seven-day window — a week-shaped port drops them. And three commits *inside* that window belong to slices not yet started: `3c6192a` and `1810da2` are flights (C3), `33fd107` is mostly the admin dashboard (C5). Time is not the unit of work here; the slice is.

### C0b delta — 2 commits

- `80cd47b` — 8 keys added to `src/locales/en.json`.
- `715bb89` — `src/i18n/applyBrand.ts` (+35) and its test (+73), plus a change to `request.ts`. Brand lock is the first link in C0b's own documented request chain (brand lock → segment → default), so v2 is behind on the step that decides locale before the URL segment is read.

### C1 delta — 6 commits, 14 files, +1418/−125

| Commit | Brings |
|---|---|
| `a0016bd` | Stale-while-revalidate search, TGX client changes, **+170 lines to `amenityCodes.ts`** |
| `897efed` | Daily hotel content sync; double-encoded JSONB fix; `fetchPropertyData`; TGX search |
| `33fd107` | `tgx-timeout-budgets` (+119) and `tgx-unanswered-search` (+285) tests |
| `1cff91c` | Room photo prioritisation and name normalisation |
| `715bb89` | Interactive map search view with clustering ([ADR-0022](adr/0022-dense-map-markers-are-clustered-never-truncated.md)) |
| `176b03d` | Room utilities and search-processing constants |

Also in the diff: `cityAliases.ts` +153, `src/lib/server/search.ts` +108, `roomUtils.ts` +81, and new tests `resolveStayDates.test.ts` (+53) and `roomUtils.test.ts` (+154).

**C1a is stale, and that is the honest reading.** It records `amenityCodes.ts` as "ported whole (456 lines)" on 2026-08-25; `a0016bd` then added 170 lines to that file. The port was correct when made — v1 moved.

**Watch the C6 overlap.** `897efed` touches `cron/seed-room-groups` and `cron/refresh-hotel-content`. C6 already flags `seed-room-groups` as moving into C1 if the catalog is not seeded. Check 5433's catalog before treating these as C6's.

### Done in this catch-up (2026-09-02)

- **C0b — `applyBrand`.** app-v2 had the brand-lock chain but not the message rewriting, so all 13 CheapestGo strings in `en.json` — the sign-in prompt, the footer, the FAQ, the privacy policy naming who collects the reader's data — rendered wrong on AirangGo ([ADR-0005](adr/0005-geomeego-white-label-deployment.md)). Ported to `app-v2/src/i18n/applyBrand.ts`, applied after the locale merge so untranslated keys inherit the English string and get branded too. 7 tests; app-v2 99 tests, typecheck clean. The 8 locale keys in `80cd47b` are **flight** keys and belong to C3, not here.
- **C1a — amenity vocabulary back to level.** The +170: 153 German/Spanish/Italian/Dutch entries, and underneath them `toAmenityKey`, the one key shape both lookup directions now share. They disagreed, so a supplier sending `Aria Condizionata` missed a map that already held `ARIA_CONDIZIONATA`. Also fixed the prettifier's `\b\w`, which read an accented letter as a word boundary and capitalised the character after it — the origin of "GepäCklagerung". 9 tests.
- **Room-name rules.** api-v2 displayed and deduplicated on TGX's raw name, so the rate leaked into card titles and a supplier code could title a card. `lib/hotels/roomNames.ts` now holds `normalizeRoomName`, `isMeaningfulRoomName`, `extractRoomVariantLabel` and `pickBaseTitle`, typed on TGX rather than copied from v1's LiteAPI-shaped `roomUtils` — see [ADR-0025](adr/0025-a-port-carries-v1s-rules-not-v1s-supplier-shapes.md). Dedup still keys on the raw name so no bookable variant is lost; the variant is surfaced beside the title instead. 14 tests.
- **Dead LiteAPI branch removed from api-v2** — `normalizeLiteApiPolicy` (zero callers), `NormalizedPolicy`, and `rawLiteapiResponse` from both copies of `BookingPolicySnapshot`. The column stays. See the C2c note above for what this surfaced.
- **Refundable Tag canonicalised — api-v2 had v1's bug, live.** Three sites emitted `REFUNDABLE`/`NON_REFUNDABLE` (`travelgatex.ts` twice, `search.ts` once) while every consumer tested `'RFN'` — `normalizer.ts:266` and `:298`, and the free-cancellation filter. A test that never matches does not error; the filter returns nothing, which on screen is a search with no results. `toRefundableTag()` now converts at the supplier boundary, as v1 does. The defensive `|| === 'REFUNDABLE'` at `hotels.service.ts:847` is left in place for rows written before the fix. `search.ts:748` still emits `'UNKNOWN'` on the ETG fallback path — that is honest rather than wrong (ETG does not return refundability there) and is left alone. 4 tests.

- **Unanswered Search ported.** api-v2 already had stale-while-revalidate in full — cache key, effective TTL, stale serve, background refresh, inflight guards, on `hotel_search_cache`. What it lacked was the distinction that decides what the user sees. `runCityFallback` had **five paths that returned an empty result on failure**: an unresolved destination code, a known-miss skip, a hotel-code batch that threw, a partial batch failure, and an empty catalog. Only an uncaught throw set `tgxFailed`, and the `remove` emit is guarded on it — so on any of those five the whole Phase 1 catalog was wiped and the user read "no hotels found" for a city that has hotels. `UnansweredSearchError` now accumulates reasons across the fallback chain and throws, so the catalog stays and `done` carries `tgxUnanswered`. Thrown rather than returned, so the cache write is skipped.
- **`ALL_PROCESSES_FAILED` no longer blacklists a destination code.** api-v2 tested only `hasEmptyHotelsError`, so every OTV connection timing out — which TGX documents as transient — was recorded as a permanent OTV miss. Nothing expires those. This is the failure that takes Seoul from 185 hotels to 89.
- **The NONE Sentinel was being sent to TGX as a destination.** `resolveTgxDestinationCode` tested `if (row?.destination_code)`, and `'NONE'` is truthy, so the literal string went into the criteria as a destination code. v1 writes those rows and v2 reads the same schema ([ADR-0014](adr/0014-v2-reads-v1s-schema-until-cutover.md)), so they are present regardless of whether v2 ever writes one. Now returns undefined and falls through to Hotel-Code Fallback, skipping the 18-second round-trip the sentinel exists to avoid.
- **Hotel-code batches no longer lose the chunks that answered.** `Promise.all` rejected a whole batch on one chunk timing out, turning a partial answer into an empty one. Now `allSettled`, with the non-answering count feeding the unanswered reasons.

- **Double-encoded amenities are read again.** `normalizeAmenityList` opened with `if (!Array.isArray(raw)) return []`, and `hotel_content.amenities` is jsonb in two shapes — a real array, and a JSON *string* of the array for rows written double-encoded. The guard was false for exactly the rows that had data, so the list came back empty and the caller fell through to un-normalised live supplier text. That fallback is how untranslated German and Italian reached the page while the amenity map had known those words all along. Fixed at api-v2's chokepoint rather than v1's call site, since one normaliser serves both `getProperty` and the catalog. Migration `20260901000001` repaired the stored rows; this stops a survivor reopening the hole. 3 tests.
- **Payload trim, shaped for app-v2 rather than copied from v1.** `allMappable` rode along in every `hotels` emit as a filtered copy of `data` — the whole hotel array a second time in the same message — and **app-v2 never reads it**: its stream reader takes `chunk.data` alone and maps it through `toMappable`. Dropped from all three emits. Also dropped `description`, `amenities` and the duplicate `address` from the instant catalog, and capped `images` to the one element a card renders. **`location` was kept**, which is where this departs from v1: v1 removed it as having "no reader at all", but `MappableProperty` reads it and every card shows it. v2 owns its design ([ADR-0016](adr/0016-parity-is-functional-not-visual.md)), so v1's measurement of what is unread does not transfer — it had to be re-measured against app-v2.
- **`resolveStayDates` deliberately not ported.** v1 extracted it so the quote and the per-night display resolve one stay; api-v2 never defaults dates (`getProperty` requires both), and app-v2 already routes all 20 nights call sites through one `nightsBetween` in `shared/lib/stay.ts`. Porting it would add an unused helper to api-v2 and a duplicate to app-v2. The concern it addresses ([ADR-0020](adr/0020-a-hotel-price-carries-the-stay-it-was-quoted-for.md)) is already C2e's, and C2e already records v2 as not having v1's bug.

- **Unavailability banner ported (`6f2fe32`).** Closes the loop on `tgxUnanswered`: when the supplier never answered, the catalog stays on the map and a persistent pill says live prices did not load, with a retry. Built on app-v2's own chrome palette in the streaming toast's slot rather than copied from v1's markup ([ADR-0016](adr/0016-parity-is-functional-not-visual.md)) — the two never coexist, since this is set when the stream ends and that only shows while it runs. **Placement is not visually verified**; it reuses the toast's `top-[68px] md:top-[80px]` offset, so it should sit where the toast does.
- **Map clustering was already level.** `715bb89`'s work is present as `useHotelClusters.ts` + `ClusterPin.tsx` with tests, honouring [ADR-0022](adr/0022-dense-map-markers-are-clustered-never-truncated.md). No port needed.
- **11 broken internal links fixed across 9 files.** app-v2's footer linked `/terms-of-service`, `/privacy-policy`, `/cookie-policy` and `/hotels/search`; v2's routes are `/terms`, `/privacy`, `/cookies` and `/search`. **Every legal link in the footer 404'd**, and the register form's two did the same. All were raw `<a>`, which also drops the locale prefix ([ADR-0015](adr/0015-locale-lives-in-the-url.md)), so even the correct ones left Korean. Now locale-aware `Link` under `[locale]` and plain `next/link` under `/admin`, per the rule `src/i18n/navigation.ts` already documents.

- **Cancellation terms now reach the property payload.** `getProperty` mapped `refundableTag` but dropped `cancelPolicy`, although `r.cancelPolicy` was on the source object and **app-v2's `RoomOption` had declared the field all along** — the client was typed for data the API never sent, so a room could say "refundable" but not by when or for what fee. `toClientCancelPolicy` in `lib/hotels/travelgatex.ts` does the renaming at the supplier boundary, the same reason `toRefundableTag` lives there: TGX calls the figure `value`, the client's shape calls it `amount`, and `penaltyType` travels with it because without it a 20% penalty and a 20-unit one are the same number. 4 tests.

api-v2: 196 tests, typecheck clean. app-v2: 147 tests, typecheck clean — the app-v2 suite went green on 2026-09-02 once the room-selection and property-description tests were re-pointed at the redesign they had fallen behind (see "Stale tests, not bugs" below).

**app-v2's build is red, and was before this work.** `next build` exits 1 on 29 ESLint errors — unused imports and `any` — none introduced here. **17 of app-v2's 28 `features/**/*-view.tsx` have zero importers**: the feature-based split was half-adopted, so for those pages the code lives in `app/[locale]/…/page.tsx` and a stale duplicate sits beside it. Six of the nine files failing the build are among the dead ones. This is why `search-view.tsx` carries its own copy of the stream reader and did not get the banner. Deciding it is a slice-sized call, not a side effect of this catch-up.

**Small follow-up:** `allMappable` is still built and bbox-filtered inside `HotelSearchResult` although nothing emits or reads it now. Removing it touches the type and six return sites — worth doing, not worth doing at the tail of another change.

**Already level, no work needed.** `cityAliases.ts` in full — `HOTEL_DB_CITY_SYNONYMS`, `DB_CITY_INDEX` and its case-insensitive lookup, `resolveCanonicalCity`, `resolveHotelDbCities`. Also `orderRoomPhotosByDistinctiveness`. The watermark is a floor, so it over-reports; re-checking was cheap, exactly as intended.

**C1 database step: done (2026-09-02).** 5434 rebuilt from 5433 — 35 migrations, 0 double-encoded rows, `flight_segments` terminals present. Everything else in the delta has landed — SWR was already present and gained the Unanswered Search distinction, `fetchPropertyData`'s read fix went in at `normalizeAmenityList`, the payload trim was re-measured against app-v2, and the map work turned out to be level apart from the unavailability banner.

Measured 2026-09-02: **5433 is itself one migration behind** (`20260901000001_fix_double_encoded_jsonb` is pending there, not just on 5434), and 5434 is three behind. The double-encoding is live in both — **34,432 rows on 5433, 25,660 on 5434** — which is what `normalizeAmenityList`'s string branch is currently absorbing. The two databases have also drifted apart on row count (5433: 1,140,514; 5434: 1,140,979), so the Side-by-side Check's premise that 5434 is "freshly rebuilt from 5433 so the rows match" does not hold today.

### Not in this catch-up, deliberately

- **Flights** (`3c6192a`, `1810da2`) — adds `origin_terminal`/`destination_terminal` to flight segments and the email templates. api-v2 has no ported flight booking, so there is no delta to take; this is C3 whole.
- **Admin dashboard** (`33fd107`, minus its TGX tests) — customers, bookings and communication panels. C5 whole.
- **`8003216`** — moves an RDS credential out of `docker-compose.yml` into `.env`. v1 infrastructure. v2 has its own compose and its own database ([ADR-0018](adr/0018-v2-has-its-own-database.md)); mirror the practice, do not port the files.
- **`aa3eb8e`'s `deploy-production.yml`** — v1's EC2 deploy. v2 is not deployed.

### Schema

Three migrations landed in v1: `20260826000001_flight_segments_terminals`, `20260827000001_clear_stale_none_dest_codes`, `20260901000001_fix_double_encoded_jsonb`. v2 never authors a migration ([ADR-0014](adr/0014-v2-reads-v1s-schema-until-cutover.md)) — 5434 is rebuilt from 5433 ([ADR-0018](adr/0018-v2-has-its-own-database.md)). The JSONB fix matters most: it repairs double-encoded columns C1's search path reads.

## C2 — Hotel booking

quote, prebook, create-payment, confirm, cancel, amend, save — plus policy normalisation, the cancellation engine, the Stripe webhook, and FX locked at booking in USD ([ADR-0008](adr/0008-fx-locked-at-booking-in-usd.md)).

**v1 reference:** `src/app/api/booking/`, `src/app/api/stays/`, `src/app/api/webhooks/stripe/`, `src/lib/server/bookings.ts`, `src/lib/server/checkout.ts`, `src/lib/server/policy-normalizer.ts`, `src/lib/server/cancellation-engine.ts`, `src/lib/server/refunds.ts`, `src/lib/bookings/`, `src/lib/cancellation.ts`, `src/lib/pricing.ts`, `src/lib/currency.ts`, `src/lib/server/exchange-rates.ts`, `src/__tests__/checkout/`

**v2 target:** `src/services/bookings.service.ts`, `src/routes/bookings.route.ts`, `src/routes/webhooks.route.ts`, `src/lib/policies/normalizer.ts`, `src/lib/pricing.ts`

**Gaps (measured 2026-08-25).** The routes all exist in api-v2 — `/prebook`, `/create-payment`, `/confirm`, `/cancel`, `/amend`, the Stripe webhook. What is missing is the money logic *inside* them, so this slice is a set of rules to port, not endpoints to build.

| Capability | v1 | api-v2 | Note |
|---|---|---|---|
| Policy normaliser | 463 ln | 361 ln | **api-v2 is ahead.** It already exports `calculateCancellationFee`, `isCurrentlyFreeCancellation`, `normalizeTgxCancelPolicy`; v1 exports nothing api-v2 lacks. No port needed. |
| Charge base (`hotelChargeBase`) | 109 ln, 2 refs | absent | **api-v2 trusts the client's `amount`.** `createPayment` applies markup straight to `params.amount`; `hotel_prebook_quotes` is read 3x in v1 and 0x in api-v2. |
| FX lock (ADR-0008) | `lockFx`, 3 call sites | absent | No write to `usd_amount` / `fx_rate` / `fx_captured_at` / `fx_source` anywhere in api-v2. |
| Cancellation engine | 331 ln, 4 refs | folded into normaliser | Confirm the folded version covers the same cases before dropping the line item. |
| Metapolicy | 2 refs | absent | |
| `booking/save` | present | absent | |

`policy-normalizer`, `cancellation-engine` and `refunds` predate the port window (May to June 2026) — take v1's current state, not a delta.

### Checkpoints

- **C2a — Charge base.** ✅ Done — the Stripe base now comes from the recorded prebook quote ([ADR-0021](adr/0021-the-stripe-base-comes-from-the-prebook-quote.md)). Prebook persists `optionQuote.price` to `hotel_prebook_quotes`; `createPayment` reads it, converts with a strict converter that throws rather than degrades, and applies the markup to the server's figure — never the client's. 16 new tests in `src/__tests__/chargeBase.test.ts`.
- **C2b — FX lock.** ✅ Done — `src/lib/payments/fxLock.ts` ported; every path that creates a booking now records `usd_amount`, `fx_rate`, `fx_captured_at`, `fx_source` and `source_brand` ([ADR-0008](adr/0008-fx-locked-at-booking-in-usd.md)). Three call sites, matching v1: hotel confirm, Duffel and Mystifly. It runs after the money has moved, never throws, and on the hotel path patches the row *after* the insert so a rates outage leaves the columns null for a backfill rather than costing the booking. 8 tests in `src/__tests__/fxLock.test.ts`.
- **C2c — Cancel and refund.** ✅ Partly done — the refund now follows the recorded terms instead of returning the full charge ([ADR-0023](adr/0023-a-cancellation-refunds-what-the-recorded-terms-allow.md)). Confirm writes `booking_policy_snapshots` + `policy_tiers` (all three tables existed, none was written) and no longer collapses a tiered rate to `free_cancellation`; cancel reads them through `src/lib/policies/cancellationEngine.ts` and scales the Stripe amount by a refund ratio. 12 engine tests plus 4 service-level ones. **Still to port:** `refund_logs` (v1's `createRefundRequest`/`processRefund`) and metapolicy handling; existing bookings have no snapshot and need backfilling from `bookings.cancellation_policy`. **No-show penalty and early departure fee are not disclosed to the guest (found 2026-09-02, refined).** api-v2's snapshot write sets `policy_type`, `summary`, `refundable_tag`, `free_cancel_deadline` and `raw_provider_response`, but never `no_show_penalty` or `early_departure_fee`. The first reading of this was that two columns needed wiring; tracing v1 shows the columns are an **audit record on both sides** — `cancellation-engine.ts` maps them onto the snapshot object and nothing computes from them, and `calculateCancellationFee` does not consult them.

v1 derives both fresh at render time and shows them — `CancellationPolicySection` at checkout, `PoliciesSection` on the property page — and **app-v2 shows neither anywhere**. That reads like a disclosure gap. It is not, and the reason matters.

**Both v1 call sites read LiteAPI shapes.** They pass `cancellationPolicies?.cancelPolicyInfos` and `cancellationPolicies?.hotelRemarks`. The TGX query asks for `cancelPolicy { refundable, cancelPenalties { deadline hoursBefore penaltyType currency value } }` — **neither field exists in it**. So for OTV, the only live hotel supplier, both detectors receive `undefined`, return 0, and the section does not render. Those paths are dead in v1 too; they are LiteAPI-era, like the rest of that vocabulary.

**The real no-show data is ETG's, and it is a different port.** v1 surfaces `metapolicy_struct` / `metapolicy_extra_info` (`travelgatex/search.ts:2229`) and reads rate-level `no_show_time` (`fetchPropertyData.ts:547`). Metapolicy is already listed as **absent** in C2's gap table above. Disclosure follows from porting metapolicy — it cannot be built before it, because until then there is nothing to disclose.

So: **do not port the detector call sites**, and do not delete `detectNoShowPenalty` / `detectEarlyDepartureFee` either — they are the parsing half of the metapolicy work when it comes. The columns they would fill are audit-only on both sides; `calculateCancellationFee` consults neither.
- **C2d — Amend and save.** Re-checked 2026-08-26: **both already exist in api-v2**, contrary to what this line said before. `/api/v2/bookings/amend` is `bookings.route.ts:21` (57 lines against v1's 72 — close enough that the open question is behavioural parity, not existence), and saved trips are served twice over: `bookings.route.ts:87-89` for the account page and `saved-trips.route.ts` mounted at `/saved-trips` for the flights SaveButton. Both are reachable and in use. **Remaining work is a parity read of `/amend` against v1's route, plus deciding whether two saved-trips implementations should stay two.**
- **C2e — Prices carry their stay.** Hardening, not a fix — re-checked 2026-08-26. app-v2 does **not** have v1's doubled-price bug: api-v2's `getProperty` only fetches rooms when both dates are present, so a request without them returns no rooms rather than a default-date quote, and app-v2 reads and writes `checkIn`/`checkOut` consistently with nothing emitting the lowercase form. What remains is latent duplication — roughly ten places divide by `nights` and seven derive `nights` independently — which is the shape that produced the v1 bug ([ADR-0020](adr/0020-a-hotel-price-carries-the-stay-it-was-quoted-for.md)). Worth doing, but as prevention rather than repair.

**Schema is ready** (checked 2026-08-25). This slice was recorded as blocked because `hotel_prebook_quotes` and `booking_fx_lock` appeared in neither repo's `schema.prisma`. Both were genuinely unapplied; `dbmate up` brought 5433 current — 13 pending migrations, 8 of which needed `-- migrate:up`/`-- migrate:down` markers added — and 5434 was rebuilt from it. Verified present: the `hotel_prebook_quotes` table, `unified_bookings.fx_rate`, and `stripe_processed_events.completed_at`.

## C3 — Flights

Search and booking across Duffel and Mystifly, order placed before payment ([ADR-0009](adr/0009-airline-order-placed-before-payment.md)), one slice at a time ([ADR-0010](adr/0010-flights-are-shopped-one-slice-at-a-time.md)), duplicate departures warned not refused ([ADR-0011](adr/0011-duplicate-departures-are-warned-not-refused.md)), internal routes called in-process ([ADR-0012](adr/0012-internal-routes-are-called-in-process.md)), a failed booking cancels its own order ([ADR-0013](adr/0013-a-failed-booking-cancels-its-own-order.md)).

**v1 reference:** `src/lib/server/flights/`, `src/app/api/flights/`, `src/app/api/internal/`, `src/types/flights.ts`, `src/utils/flight-utils.ts`

**v2 target:** `src/lib/flights/`, `src/services/flights.service.ts`, `src/routes/flights.route.ts`, `src/routes/internal.route.ts`

**Gaps (re-audited 2026-08-26).** Closer to done than this line used to claim.

**Routes are at parity.** Twenty flight routes in v1, twenty in api-v2, differing only in that `refund`, `void`, `void-quote` and `reissue` sit under `/mystifly/*`. This file previously called that a gap, on the grounds that "v1's are provider-agnostic and dispatch by provider" — **that was wrong**. v1's four routes import from `@/utils/postgres/functions`, never mention Duffel, and never branch on provider. They are Mystifly-only in v1 too, so the namespacing in api-v2 names the same thing more honestly rather than losing anything.

**Internal routes: four of v1's eight.** Present: `auto-recover`, `create-booking`, `issue-ticket`, `retry-emails`. Of the four absent — `revalidate-flight` is a capability api-v2 already has under another name (`refreshDuffelOffer` plus the `PRICE_CHANGED` guard at `flights.service.ts:247`), and `setup-staging-schema` is a one-shot Coolify bootstrap that v2 does not want ([ADR-0018](adr/0018-v2-has-its-own-database.md) gives v2 its own database with dbmate owning the schema). That leaves **`cheapest-flight` and `refresh-flights`** genuinely missing, both serving deal-price refresh from cron — arguably C6 rather than C3.

**What is not established: behavioural parity.** Everything above compares surfaces and capabilities, not conduct. api-v2's flight logic is ~2,559 lines against v1's ~3,073, but api-v2 consolidated twenty v1 modules into three libs and one service, so the difference is largely shape. Comparing a symbol at a time is misleading — 24 of v1's exported flight symbols have no textual match in api-v2, yet spot checks found the capability present under a different name every time. Deciding this properly needs the two run side by side against the same offer, which needs provider credentials and a database.

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

**Gaps:** none as of 2026-09-17. `email` is deliberately *not* a route in v2 — see the C7
close-out below.


## C8 — Support Chat

The capability this plan was blind to until 2026-09-16: 35 commits, and the part of v1 that is
still being designed week by week.

**In it:** the customer's widget and its live updates over SSE on a Postgres bus; the Agent's
inbox and the **Support Desk**; **Assignment** by an admin ([ADR-0041](adr/0041-support-chats-are-assigned-by-an-admin-never-taken.md));
**Translation** stored beside the author's words ([ADR-0033](adr/0033-a-translation-is-stored-never-recomputed.md),
[ADR-0034](adr/0034-translation-goes-through-chatwonder.md)); attachments
([ADR-0040](adr/0040-a-support-attachment-is-private-and-is-reached-only-through-the-app.md));
the **Chat Reference** ([ADR-0038](adr/0038-a-chat-reference-names-a-conversation-but-opens-nothing.md));
**Urgency** ([ADR-0039](adr/0039-the-support-queue-is-ordered-by-how-close-the-customer-is-to-travelling.md));
**Support Hours**; the **Help Page**; and Suggested Answers
([ADR-0043](adr/0043-the-widget-suggests-only-a-person-answers.md),
[ADR-0044](adr/0044-the-widget-answers-the-common-questions-itself.md)).

**v1 reference:** `src/lib/server/support/`, `src/app/api/support/`, `src/app/api/admin/support/`,
`src/components/support/`, `src/app/admin/(dashboard)/support/`, `src/app/admin/desk/`,
`src/lib/support/`, `src/app/(main)/help/`

**v2 target:** `api-v2/src/routes/support.route.ts` and its service and repository layers;
app-v2's `features/support/`.

**Why it is last (decided 2026-09-16).** Everything above it is settled; Support is not. It
changed four times on 2026-09-15 alone — a messenger layout for the inbox, a leak of staff ids
fixed in the customer payload, an SSE ordering fix, and two ADRs about answering the common
questions. Porting a moving target costs the work twice, so this slice starts when the design
stops moving, and its watermark is taken on that day rather than today.

**One thing to check before starting:** SSE over Postgres `LISTEN/NOTIFY` assumes a long-lived
process. api-v2 is one, so this ports across — but confirm the deployment still holds a socket
open per reader before designing anything on top of it.

---

## Done 2026-09-16 — C4, C6, most of C5, part of C7

Worked in order of cost rather than of number: the slices whose gaps were small enough to close
whole, so the count of unported capabilities falls before the expensive ones start.

### C4 — Account, done

- **A name has a maximum length**, enforced at all three doors that write one — register, the
  profile update, and the Google sign-in that takes a name from someone else's system. v1 learned
  this the expensive way (QA BG-9: a live profile with a 13,708-character first name). A name
  from Google is *clamped* rather than refused: turning someone away from their own account over
  the length of their name would be the wrong answer. `src/lib/users/names.ts`.
- **The password reset email is named for the brand the recipient used**, not a literal
  "CheapestGo" — a reset arriving from a company they have never heard of reads as phishing, and
  the sending domain has to match the brand or SPF/DKIM alignment fails. `src/lib/brand.ts`.
- **`users.route.ts` lifted onto the Layer Contract**: UsersController, UsersService,
  UsersRepository. It previously held the validation and four raw Prisma calls.
- Verified: 9 unit tests, plus `scratch/smoke-v2-c4-account.mjs` — 10 checks against a running
  api-v2, including the 13,708-character name being refused at both doors.

**Not a gap after all:** v1's OAuth `redirect_uri` fix (both legs must quote the same URI) does
not apply here. api-v2 derives both from `config.API_URL`, so they cannot disagree.

### C6 — Ops, done

All four absent routes ported. `revalidate-flight` stays deliberately absent: api-v2 already has
that capability as `refreshDuffelOffer` plus the `PRICE_CHANGED` guard.

- **`cron/seed-room-groups`** — fills room photos and amenities ahead of anyone searching, so the
  first customer to open a property does not pay for the supplier call. Never-seeded hotels
  first, then the stalest; one hotel per second, because a burst from a cron is indistinguishable
  from an incident at ETG's end.
- **`cron/etg-dump-sync`** — the bulk catalog load. v1 carries the `fzstd` package to read
  Zstandard; **Node 24 decompresses it natively**, so api-v2 needs no dependency for it. Streamed
  rather than buffered, and a failed batch is retried row by row so one malformed supplier line
  cannot lose the other 399.
- **`internal/cheapest-flight`** and **`internal/refresh-flights`** — live price for one route,
  and cache warming for a popular one.
- Verified: 4 unit tests over the dump handshake, plus `scratch/smoke-v2-c6-ops.mjs` — 9 checks,
  including every route refusing an unauthenticated caller and a real ETG seed of one hotel.

### C5 — Admin, all but one screen

Ported: **destinations**, **saved-trips**, **price-alerts**, **notifications**, **settings**,
**search**, **tgx-health**, **brand**, **run-cron**, **stripe**, **mobile** — through
AdminContentService / AdminSettingsService / AdminStripeService / AdminMobileService and
AdminContentRepository, rather than into the route file.

Rules worth naming, because they are what the tests hold:

- **A page size from a query string is capped** at 100. It is otherwise a way to ask for the
  whole table in one response.
- **An action with no ids is refused.** The alternative is a `deleteMany` with an empty filter,
  which empties the table the screen was showing.
- **Deactivating a price alert is offered before deleting one** — a customer's alert that stops
  emailing can be turned back on; a deleted one cannot be explained to them.
- **`run-cron` works from an allowlist**, not a free-form name: an admin session must not become
  the authority to call any cron, because a cron is a supplier account.
- **The mobile screen never prints the API key**, only whether one is configured and a masked
  form — a key printed into an admin page is a key in a screenshot.
- Verified: 13 unit tests, plus `scratch/smoke-v2-c5-admin.mjs` — 24 checks against a running
  api-v2, including a customer being refused (403) and an admin accepted.

**`admin/reviews` is blocked on the schema, not on work.** v1's screen lists individual reviews
— a row per review, with a reviewer name — but v2's `hotel_reviews` is a per-hotel *summary*:
rating and count, synced from ETG. There is nothing to list or delete. Porting it means first
deciding whether v2 stores individual reviews at all, which is a schema decision and belongs with
whoever owns [ADR-0018](adr/0018-v2-has-its-own-database.md).

### C7 — Mobile and misc, part

- **`google/search`** (Places autocomplete) ported into api-v2. It is not the same thing as the
  existing `/google/discover`, which answers "what is near this point" rather than "what might
  they be typing" — repointing callers at that would have been a quiet wrong answer.
- **`og`** — the social preview image — ported into **app-v2**, not api-v2: an OG image is
  presentation, Next renders it natively, and Express would need a font pipeline to do it worse.
  v1's several hand-tuned design variants did not cross
  ([ADR-0016](adr/0016-parity-is-functional-not-visual.md)); v2 draws its own from its own tokens.
- **Left:** `mobile/flights/book` and `mobile/flights/confirm`, which sit on C3's flight booking
  and are better done with it than before it.

### What this leaves

C0b (locale and SEO), C1 (hotel search delta), C2 (booking money rules), C3 (flights behavioural
parity), C7's mobile flight booking, and C8 (Support Chat, deliberately last).

**One standing constraint for C2 and C3:** hotel bookings run against the **live OTV API** — the
provider has no sandbox standing in for it — so those slices are verified with unit tests, mocked
supplier responses and read-only calls. No test booking is ever created to prove a code path.

---

## Done 2026-09-16 — C0b and C1

Both had drifted back out of done, which is the measurement working rather than a regression.
Closing them was a different job from the earlier slices: almost nothing here was a missing
endpoint, and most of it was a rule v1 had learned the expensive way and v2 had not.

### C0b — the second brand is actually servable

app-v2 could not serve AirangGo. `applyBrand` substituted the brand through the locale messages,
but every surface naming the brand outside them was a literal: the header and footer wordmarks,
the landing copyright, the root metadata — the tab title and the share card — and the whole of
the privacy, cookie, terms and refund pages, which are hardcoded English prose rather than
translation keys. Those four are the pages that state *which site collects the reader's data*,
so served from the Korean domain they named the wrong company.

- **`shared/lib/brand.ts`** — `canonicalBrandName` (the GeomeeGo → AirangGo mapping, so the UI
  reads AirangGo while the Korean instance is still started with the pre-rebrand env var) and
  `brandWordmark`, which splits the name so the trailing "Go" keeps its accent. Four surfaces
  were splitting it by hand; v1 shipped "GeomeGo", one `e` short, that way.
- Wired through `applyBrand`, the header, both footers, the landing wordmark (sized per glyph so
  a shorter name leaves no dead space inside the link), the root metadata and 13 page files.
- **The admin back office is deliberately left literal** — it is one shared CheapestGo desk
  across both storefronts, not a second brand's back office.
- Verified: 7 unit tests plus the applyBrand suite, and `scratch/smoke-v2-c0b-brand.mjs` — 26
  checks against app-v2 started as `NEXT_PUBLIC_BRAND_NAME=GeomeeGo`, asserting every page reads
  AirangGo, none reads CheapestGo, and none still shows the pre-rebrand name. Re-run without the
  variable, every page reads CheapestGo again.

### C1 — hotel search

**Search results were being replayed.** api-v2 still had v1's `hotel_search_cache`: two hours,
six for popular cities, then served *stale* for as long again while refreshing behind the reader.
A hotel's Nightly Rate is its cheapest room and cheap rooms are what sell, so a replayed rate is
often a room already gone — the customer searches, searches again, and watches every price rise.
v1 measured it live on 2026-09-11: Tokyo 7.7h old, Paris 7.1h, Manila 3.8h, and two Manila hotels
45% and 47% under the live rate. The cache is gone. What is left is in-flight deduplication — two
identical searches at the same moment share one supplier call — and both callers still get a live
answer. The dead `getSearchCache`/`setSearchCache` repository pair and both admin cache-clear
routes went with it; a button offering to clear a cache that no longer exists sends the next
person debugging a price down the wrong path entirely.

**A search for one country was returning another's hotels.** api-v2 had no geographic filter at
all — the TGX destination code for Paris also answers with Paris, Texas. Ported as
`lib/geo/countryBoxes.ts` (`isConfirmedOutOfCountry`) and applied in both places that matter:
before persisting a backfill, and before rendering a result. A hotel is dropped only when its
stored country *and* its coordinates agree it is somewhere else, because the boxes are rough —
used alone they dropped 170 of Uruguay's 313 hotels, all of Galápagos, Montego Bay and Dakar.

**A territory could not find its own hotels.** `lib/geo/territories.ts` ported whole: a
territory's hotels arrive filed under its parent's country code, so all 930 Hong Kong hotels are
stored `CN`, and its districts are stored as the city — 450 under "Kowloon" alone. Matching
`country = 'HK'` and `city = 'Hong Kong'` found none of them (QA BG-8). The correction now runs
through one helper, `lib/geo/hotelLocation.ts`, used by all three places that ask "the hotels in
this place", plus the destination-coverage check that decides whether a place is offered at all.
The same border works the other way: a 50 km circle from central Hong Kong takes in Shenzhen,
Dongguan and Zhuhai, so a territory search keeps to its own side — judged by name, because
coordinates cannot separate Shenzhen from Hong Kong at the border.

Also closed:

- **Destination codes are resolved per country.** The unscoped cache holds one row per city name
  worldwide and city names collide: "Paris, France" was answered with Paris, Texas, which TGX
  truthfully reported as empty, and the search then pruned all 300 catalog hotels and rendered
  "no hotels found". A cached row that can be *proven* to belong elsewhere is now refused. The
  NONE sentinel expires after 7 days — left permanent, a single TGX 5xx routes a city to the
  hotel-code fallback forever at roughly half its inventory.
- **Supplier budgets match OTV's.** 12,000 ms to the supplier rather than 18,000 — more than it
  will ever use just buys dead time on a call it was never going to answer, and the fallback
  chains two of them. HTTP aborts are separate and larger (22 s for a destination, 13 s for one
  hotel) because they cover the response transfer, not the supplier wait.
- **The search payload carries what a card renders.** `description` and `amenities` are large
  TOASTed columns no search card shows, and a card shows one image. The ETG enrichment gate that
  used to read amenities off those rows now asks the database directly, so trimming them cannot
  turn into an ETG call for all 300 hotels on every search.
- **Supplier-facing routes are rate limited.** `searchRateLimit` existed and was applied to
  nothing, so hotel search, destinations, the property page and both autocomplete routes had only
  the default 100-per-15-minutes. Same hole v1 closed as QA BG-10.
- **A reversed stay is refused** at both search doors rather than sent on as a one-night search
  for dates nobody asked about (QA BG-5).
- **A Mapbox feature is typed by its id layer**, not by whichever place type happens to be first
  in the array — getting it wrong puts a city on the wrong rung of the granularity ladder.
- **app-v2: recent searches belong to an account**, not to a browser. They are persisted and
  nothing cleared them on sign-out, so the next person at a shared computer saw where the last one
  had been looking (QA BG-1); clearing them outright loses the history instead (QA BG-12). Filed
  per account on sign-out, taken back on sign-in, and a list left behind by an expired session is
  filed under its owner rather than handed to the newcomer. Both of app-v2's two auth stores
  subscribe, since a sign-in through either has to do it.
- **app-v2: one derivation of the stay** on the property page, with dates a supplier will accept.
  A link that has sat in a chat window for a week names dates in the past, which read on the page
  as the hotel having no rooms at all.
- **app-v2: signing out wipes the booking in progress.** BG-1's other half is mostly absent here
  by construction — the booking store is in memory and the checkout form is component state, so
  none of v1's leaked name, email and phone exists to leak. What remained was the flight someone
  had picked, in session storage, which survives a sign-out in the same tab, and the wishlist of
  places they hearted. Both are cleared, and in a `finally` so a failed sign-out request cannot
  leave them: the person clicked sign out, and the next one at that browser is already sitting
  down.

**Already in sync, checked rather than assumed:** the amenity vocabulary (api-v2 is ahead — it
has v1's 170 new non-English supplier codes plus `normalizeAmenityList`), the room-name rules and
the photo-distinctiveness ordering, the Unanswered Search banner in app-v2, the area-coverage
probe, and the city-alias dictionary bar one entry (Lisbon, filed as both "Lissabon" and "Lisbon",
where the one-to-one mapping reached 2,113 of 3,003 hotels).

**Not ported, and named rather than skipped quietly:** v1's translation pass over its search and
property components. app-v2's locale files hold 248 keys against v1's several hundred, and its
components still carry hardcoded English. That is the C0b debt this file already records, it spans
the C1–C3 surfaces, and it is per-slice work rather than part of this one.

**Verified:** api-v2 273 tests (from 222), app-v2 171 (from 147), both typechecking, v1's 1434
still green, plus `scratch/smoke-v2-c1-search.mjs` — 18 checks against a running api-v2, including
a Hong Kong search returning 259 hotels with none across the border in China, two identical
searches answering with different hotel counts (live, not replayed), and an empty
`hotel_search_cache`.

---

## Done 2026-09-16 — C2, the money rules

C2a–C2e ported the booking *flow*. What had not crossed was the arithmetic: api-v2 was still
pricing on the model v1 replaced, and the difference is money, not shape.

### api-v2 had four markup implementations, and the live one was wrong

`lib/pricing.ts` (a flat 5% for hotels, 4% for bundles), a second copy in `types/hotels.ts`
with both rates hardcoded to `0` and marked "disabled", a third inside `flights.service.ts`
that charged **`FLIGHT_MARKUP = 0`**, and a fourth in app-v2 that nothing imported. So:

- **flights were sold at cost.** Every Duffel booking recovered neither Duffel's $3.00 + 1%
  nor Stripe's fee.
- **hotels charged 5%** against a model that says 5.9% — and against a *measured* Stripe rate
  of 4.4%, 5% covers a hotel only if nobody ever cancels. A $300 stay netted $0.84.
- `STRIPE_RATE` read 2.9%, Stripe's US domestic-card headline, while this account is
  US-registered and its customers are not: every live charge settles at 4.4%.

v1's model is now api-v2's: `MarkupSpec` — a rate, a flat component in USD, and a cap on the
result — with flights at 7.2% + $4.40 capped at 12% and hotels at 5.9%. The flat component is
converted into the base price's currency at the call site, because adding `4.40` to a peso
fare charges ₱4.40, about eight US cents. The three duplicate implementations are gone.

**One discrepancy carried over deliberately.** `HOTEL_MARKUP_SPEC.flat` is $0.40 and the call
site passes `0`, so hotels charge the rate alone. That is exactly what v1 does — it added the
flat component and passed zero at its only call site in the same commit (`57278e66`).
Charging it is a decision about what customers pay, not a code fix, so it stays as v1 has it.
One argument, one line, whenever someone decides.

### Seven places divided a Stripe amount by 100

KRW has no minor unit, so `pi.amount / 100` records a ₩1,200,000 booking as ₩12,000 — and
AirangGo is Korea-locked, which makes that a primary market rather than an edge case. All
seven now go through `fromStripeAmount`: the hotel confirm's stored total, three flight refund
amounts (including the quote a customer sees *before* they cancel), and both flight-ticketing
confirmations in `internal.route.ts`.

### A charge could not be attributed, and a retry could not be paid

api-v2 minted `FORHU-<millis>-<rand>` at confirm time. FORHU Inc owns the Stripe account every
FORHU product settles into and Stripe pays out daily as one pooled deposit, so that prefix
named the one thing every product shares and could answer nothing. It was also minted *after*
the charge, leaving a failed booking's payment with no reference at all.

`bookingReference.ts` is ported: `CG-7K2M9Q` / `GG-…`, Crockford base32 with no I, L, O or U.
It is minted **before** the charge, from a hash of the idempotency key — never randomly, because
Stripe replays an idempotent request only when its parameters are identical, and a customer who
steps back from payment and proceeds again sends the same request. A random reference made every
retry a "different request" under the same key: a 500, and no way to pay (QA BG-19). Confirm
reads it back off the PaymentIntent rather than from the request body — the client must not
choose the identifier a payment is filed under — and passes it to OTV as the client reference,
which is what a cancellation has to quote.

### The Stripe fee is now recorded, not just estimated

`STRIPE_RATE` has to be an estimate, because the markup is computed before a charge exists. It
was never checked against anything. Stripe reports the exact figure per charge, for free, on the
balance transaction — so confirm captures with `expand: ['latest_charge.balance_transaction']`
and records what was really taken, with the card's issuing country beside it, which is *why* the
rate is what it is. Every field is optional: a booking must never fail over a reporting figure.

### A Stripe webhook had no replay guard

Stripe retries a delivery it did not get a 2xx for, with the same event id, and api-v2's handler
had nothing to stop it running twice. The claim/commit pair is ported: a row claims the event, a
*completed* claim skips the duplicate, and a claim that was never completed is reprocessed —
because that is a delivery that died part-way, and skipping it would lose the work. Not committed
on the error path, so Stripe's retry can still run.

### `/admin/revenue` did not exist

app-v2's revenue screen has been calling it since it was written, and showing its error state.
`enrichBookingFinances` — the last piece of v1's pricing module — is what turns the stored pieces
into markup, Stripe's cut and what is left. **A booking with no recorded rate reports zero markup
rather than an estimated one**: v1 used to invert the *configured* rate, which has no term for a
flat component and is not the rate that booking was sold at, so it produced plausible wrong
margins in reporting. A visibly missing figure gets investigated; an invented one gets banked.
Amounts are summed unconverted and the response says which currency it counted — restating a
closed period at today's rate is the error ADR-0008 exists to prevent.

**Verified:** api-v2 300 tests (from 273), typecheck clean, plus `scratch/smoke-v2-c2-money.mjs`
— 17 checks, and `scratch/smoke-v2-c5-admin.mjs` now 29. **No booking was created.** The quote a
payment prices from is inserted straight into the local database, so the whole charge path runs
with no supplier call; Stripe is in test mode locally. The smoke confirms a $300 quote is charged
$317.70, that a client claiming $1 is refused rather than charged $1, that an expired quote
cannot be charged from, that paying twice returns the same intent, and that a replayed webhook
leaves one claim.

### C2, closed out

**Customers were billed more than the total they were shown — in v1, live.** The checkout
rendered a hardcoded 5% service fee (`usePricingCalculation`) while create-payment charged 5.9%
from `HOTEL_MARKUP_SPEC`, so a $300 room displayed $315.00 and billed $317.70. The rate moved on
2026-09-08 and the client was never updated. app-v2 had the same shape at a hardcoded 6%.

The fee is now one function, `hotelServiceFee`, in both pricing modules. Prebook returns it in
its server display block beside the converted total, both checkouts render that block instead of
doing arithmetic, and create-payment charges with the same function. **Nothing is billed above
the displayed total**: `capAtDisplayedTotal` applies the rule `resolveHotelChargeBase` already
applied to the base, one step later, to the figure the customer agrees to — within tolerance the
displayed total stands, beyond it the customer is shown the new total to re-confirm.

**The $0.40 flat hotel component is charged.** ADR-0036 sets hotels at $0.40 + 5.9%; v1 put
$0.40 in the spec and passed `0` at its only call site in the same commit, with a comment saying
the flat part was zero. It is converted into the charge currency, and dropped rather than the
sale refused if rates are unavailable — a fee shown without it is never higher than one charged
with it. A $300 stay is now $318.10.

**api-v2's error handler threw away what a client needs to act on a refusal.** Six call sites
attached fields with `Object.assign` — the price to re-confirm, the booking a duplicate collides
with, the offer that replaced an expired one — and the handler sent only `error` and `message`.
`AppError` now carries `details`, the handler sends them (never over `error` or `message`), and
app-v2's http client exposes the body so the checkout can show the new total.

**Refunds are logged before money moves.** `refund_logs` ported: a `pending` row opens before
Stripe is asked, and closes as `processed` with the Stripe refund id, or `failed`. v1 closed it as
`processed` with the full amount approved whether or not Stripe refunded anything — the log
contradicted the booking on the one fact it exists to record. Fixed in both.

**Bookings from before snapshots existed.** A cancellation refunds what the recorded terms allow,
and a booking with no snapshot has none — so it refunds nothing, even on a free-cancellation rate.
`npm run backfill-policy-snapshots` derives the snapshot from `bookings.cancellation_policy` with
`snapshotFromPolicy`, the function confirm now uses too, so a backfilled booking is held to the
same rule as one confirmed today. Dry run unless `--apply`, idempotent, names the database it is
pointed at, and skips a booking with nothing to derive terms from rather than inventing them.
**Not run against RDS** — both local databases hold one booking each; the real population is live,
and running it there is the owner's call.

**`/amend` was an open door.** It validated nothing, capped nothing, and put what the customer
typed into an HTML email to whatever address they typed — from the brand's own no-reply domain.
Set the email to a stranger's and a link in the name, and it was a phishing relay. Now: names
through `checkName` (the same 30-character cap as every other name field), a real email required,
every value escaped, sent under the booking's brand via `fromNoReply`, with v1's before/after diff
and the admin notification. Lifted onto the Layer Contract. The same escaping went into the `/email`
endpoint's builders, which only send to the signed-in user but interpolated the body just the same.

**Found and not fixed, because it is a decision rather than a defect:** vouchers do not reduce a
TravelgateX charge in either system. The client applies the discount "at LiteAPI level", which TGX
has no equivalent of, and create-payment never applies one — a large voucher reaches the customer
as a price-changed prompt at the full price. Charging a discount means deciding who funds it and
whether it comes off the base or the total.

**Verified:** api-v2 327 tests, app-v2 171, v1 1520, all typechecking. Smokes: C2 money **21/21**
(including a checkout showing the old 5% being asked to re-confirm rather than billed more, and a
few-cents drift being honoured rather than topped up), policy backfill **14/14** against synthetic
local bookings. Still no booking created.

---

## Done 2026-09-17 — C3, flights

The audit of 2026-08-26 found the surfaces at parity and left behavioural parity open. That is
where everything below was hiding: api-v2 had the endpoints and not the rules, and each missing
rule had already cost v1 something real.

### A traveller could be ticketed onto a different flight

When an offer expires, the order path rebuilds an offer request and books from the results. That
request carries origin, destination, date and cabin — every flight that airline runs that day
comes back. api-v2 then filtered by validating carrier and sorted by **how close the price was**,
and `offerRefresh` fell all the way through to *the cheapest offer on the route*. Price proximity
is not identity: a 06:00 and a 22:00 departure at one fare are interchangeable to that sort.
Nothing downstream would notice either, because the segments were written from the itinerary the
browser posted.

`offerItineraryMatch` is ported — marketing carrier, flight number, origin, destination and
departure instant, segment by segment, slice shape included — and applied in both places. No
match means the flight is reported unavailable, never substituted. **v1's own `/offer-refresh`
route still had the loose match and is fixed too.**

### A second attempt bought a second ticket

The payment step's "Back to details" returns to the form, and re-submitting places another real,
paid order — which is how v1 issued two EVA tickets 61 seconds apart. `preorderReuse` is ported
with all four gates: the offer id inside a 30-minute window, the order still live *at Duffel*
rather than in our own row, the passengers matching this submission, and the total matching this
attempt's bags and seats. The last two matter as much as the first — "Back to details" is where
a misspelled name gets fixed, and reusing the order would ticket the uncorrected one. An order
that fails those gates is cancelled before the replacement is bought.

### Nothing else may strand a paid order

Only one failure — a session update — used to undo a placed order. Everything else (the session
insert, the rates fetch, Stripe) went to the generic handler and left a confirmed ticket against
the balance that nothing had recorded. Everything after the order now runs inside one guard that
cancels it on the way out (ADR-0009, ADR-0013).

### Smaller rules, each with its own history

- **Passport details reach the airline.** The form requires a passport number, expiry and
  nationality, validates all three, and then sent none of it — the traveller supplied it again at
  check-in. Sent now, and only where the offer asks for them: some sources reject an order that
  volunteers them.
- **A duplicate departure is warned, not refused** (ADR-0011). api-v2 refused outright with no
  way through; a family on two bookings could not book at all. `acknowledgeDuplicate` is the way
  through, and the refusal now says so.
- **One price tolerance.** api-v2 hardcoded its own beside `getFlightPriceTolerance`. When two
  gates disagree, a fare drifting between them is waved through one and stopped by the other —
  which is what makes prices look like they change constantly.
- **The balance guard is off unless asked for.** It calls `/air/payments/balances`, which does
  not exist: on live it threw on every booking, was swallowed, and cost a round trip.
- **Segments are written from the order Duffel is holding**, not the browser's payload, so the
  confirmation email cannot describe a flight the PNR is not for. A segment with no readable
  times is skipped rather than dated to `new Date()` — today's date on a future leg reads as a
  real departure everywhere it is shown.
- **E-ticket numbers are read from `unique_identifier`.** Two places read `document_number`,
  which Duffel does not send, so `.map()` yielded `[undefined]` — length one, so the "no tickets
  yet" check passed and the booking was marked ticketed with `[null]` against it. Seat
  assignments and per-passenger ticket numbers are written too, which is where the trips page and
  the confirmation email read them from.
- **A booking half-written by the other path is waited for.** Two callers race by design; the
  loser used to be told "your card has not been charged" while the winner was issuing the ticket.

### Search: always live, and an outage says so

`searchFlights` served offers from a 10-minute cache. A stored row carries the provider's offer
id, and a Duffel offer dies 20–30 minutes after it is issued — so a cache hit handed the traveller
a price whose offer no longer existed, and the booking failed at order placement and re-quoted
onto a different one. Offers are never served from the database now; `flight_results_cache` is
still written, and read only by the price calendar.

The same file raced the *whole* of `searchDuffel` — retries included — against the same 12
seconds `searchDuffel` allows for a **single attempt**, so the retry ladder could never deliver
and a slightly slow first attempt came back as zero offers. The deadlines now derive from one
another in `searchBudget`, and a provider that cannot answer **throws** instead of returning an
empty list: `failedProviders` reaches the page, which offers a retry instead of saying there are
no flights on the route. A 429 is never retried — it only makes more 429s.

### The fare is checked before the card is entered

api-v2 had no revalidation at all: a price change was discovered at order placement, where the
only answer left is an error. `POST /flights/revalidate` prices the offer with Duffel's Price
Action first. Only an **increase** beyond the tolerance interrupts the traveller — comparing the
absolute difference stopped a booking to ask someone to approve a *cheaper* fare, which is about
half of all drift — and a drop is adopted at the lower price. A provider that cannot answer
soft-passes, because the order path re-quotes anyway. app-v2 calls it on selection and says
"Checking price…" on the card while it does.

**Verified:** api-v2 411 tests (from 320), app-v2 171, both typechecking, plus
`scratch/smoke-v2-c3-flights.mjs` — 12 checks against live sandbox Duffel, including a replacement
offer coming back as the same flight (BA0105 → BA0105) and two identical searches returning 234
brand-new offer ids apiece. **No order was placed.**

**Not ported:** Mystifly's `AirRevalidate` and its stop-parsing, which belong with whatever
re-enables Mystifly; and `flight_segments.origin_terminal` / `destination_terminal`, which v1
added and v2's schema does not have — a migration, and migrations here are applied by hand.

---

## Done 2026-09-17 — C7, the receipt and the confirmation

C7's remaining items were the mobile flight routes (done with C3, since they sit on it) and
the invoice. Measuring the invoice turned up something larger sitting behind it.

### A confirmed booking told nobody

**v2 sent no booking email at all.** Not for hotels, not for flights, on any path. The only
thing that could send a confirmation was `POST /api/email`, which the browser called after a
successful checkout — and nothing in app-v2 called it. A traveller paid, and heard nothing:
no reference, no policy, no receipt link, nothing to show at a front desk.

v1 had already deleted its own copy of that route ([`8cb2f27b`](https://github.com/FORHU/cheapest-go-app/commit/8cb2f27b)) for a related reason — a
client-triggered send raced the server's own and could double-send with a different total.
v2 inherited the route and none of the server-side sends that were supposed to replace it.

What v2 has now:

- **`src/lib/email/send.ts`** — one way to send. Deduplicates on `email_logs` before calling
  Resend, records what it sent, and keeps the rendered HTML on anything that failed so the
  existing `POST /api/internal/retry-emails` job can re-send it. That job already existed and
  had nothing to retry, because nothing ever wrote a row for it.
- **`src/lib/email/templates.ts`** — the hotel and flight confirmations as pure functions.
  No database, no config import (importing `@/config` validates the whole environment and
  calls `process.exit`, which makes a template impossible to render in a test). Everything
  customer-supplied is escaped: a guest name and a free-text special request both reach the
  markup, and a mail client renders HTML.
- **`src/lib/email/flightConfirmation.ts`** — takes a booking id and reads the rest. v1 wrote
  this separately at five call sites and they drifted: one sent every confirmation with a
  total of `0 USD`, another described the itinerary the traveller *selected* rather than the
  one the airline ticketed.
- Wired into `hotels.service.confirmBooking`, both provider branches of
  `internal/create-booking`, and the Duffel `order.updated` webhook — which is what makes the
  "your ticket is on the way" email true, by sending the ticket numbers when they arrive.
- **`POST /api/email` deleted.** A client-driven send is a second path to the same message,
  and the second path is the one that double-sends.

Every send is fire-and-forget at the call site. The booking exists and the money has moved
before the email is attempted, so a mail outage leaves a row for the retry job — never a
failed response to a traveller who has already been charged.

### The dedup guard did not exist

v1's email module says the pre-send check is backed by "the unique index on `email_logs`
(booking_id, email_type) WHERE status IN ('sent','queued')". **There is no such index** — not
on v1's database and not on v2's. The read was the only guard, and three callers can reach
it concurrently for one booking.

`db/migrations/20260917000001_email_logs_dedup.sql` adds it, in both repos. Partial on
purpose: a `failed` row is not a delivery, and a booking may collect several before one
succeeds. Applied to both local databases and to live on 2026-09-17.

Only rows written from 2026-09-17 on are covered. Live already held one pair it would have
rejected — FORHU-1786604066125-XNI3K, two confirmations sent **50ms apart** on 2026-08-13, which
is this race caught in production (from the client-side send v1 removed in `8cb2f27b`). Both
emails really went out, so both rows are kept: deleting one would erase a message someone
received, and marking one `failed` would hand it to the retry job to send a third time.

### A receipt only worked for whoever was signed in

`GET /invoices/:id/pdf` required a session and scoped the row to the caller, which meant
"Download PDF" failed for exactly the people an emailed receipt link is for — a guest opening
it signed out, or anyone the booker forwarded it to. It is the same receipt the trips page
renders in another file format, so it answers to the same Capability Link
([ADR-0027](adr/0027-capability-link.md)): possession of the UUID is the authorisation.

Now `optionalAuth` with its own rate limit (20/min per caller, since it renders a PDF and is
reachable without a session), the session read only to fill in a viewer's email where the
booking carries none, and **UUID only** — the supplier reference and the PNR were a second,
weaker way into the same data, and a PNR is six characters off a luggage tag.

app-v2 gained the "Download PDF" action to go with it; before this the receipt endpoint had
no caller in the frontend at all.

### Fixed in v1 as well

- **Every email the Korean brand sent showed the wrong company.** The masthead was the
  literal `cheapestGo` in all ten templates, beside a footer, a from-address and a body that
  all said AirangGo. Now `brandWordmark()`, like everything else that names the brand.
- **Flight times were formatted in the process timezone.** Segments store the airline's naive
  local wall clock in a `timestamptz` column, so they read back correctly only in UTC. The
  production container runs UTC, which made this right by accident there and wrong in every
  other environment — so a local check of a flight email showed departures hours out and
  nobody could tell whether that was the bug or the environment. Pinned to UTC in both repos.

### Checked

`scratch/smoke-v2-c7-email.mjs` — 17 checks: the send machinery, that each booking path is
wired to it, that the database index exists and does not block a legitimate retry, and that
a receipt opens with no session while a supplier reference and a PNR both 404.
`src/__tests__/confirmationEmail.test.ts` — 22 tests over dedup, the retry payload, escaping,
the credit line, the awaiting-ticket wording and the charged total.

**No email was sent to a real address and no booking was created.**

---

## Done 2026-09-17 — C4 and C6, re-measured

Both slices were called done on 2026-09-16 without their watermarks moving, so their
deltas still counted everything already ported. Re-measured against HEAD.

### C4 — four items, three already there

The 30-character name cap, `fromNoReply()` on password resets, and the recent-search and
booking-in-progress handoffs were already in v2. Two were not:

- **The OAuth redirect URI was written twice.** Google rejects the token exchange unless
  both legs quote an identical `redirect_uri`, and api-v2 built the same string in two
  places — the exact shape of the bug v1 fixed by extracting a helper. Now one function.
- **The session check on boot was unbounded.** Every sign-in screen disables itself on
  `isLoading`, which starts `true` and clears only when `/auth/me` answers, so a request
  stalled on a poor connection left them disabled with no way out (QA BG-15). Ten seconds,
  then "not signed in" — the server still decides on every real request. Applied to both of
  app-v2's auth stores, since either can be the one that boots.

### C6 — the jobs that watch the money

Two reconcilers existed in v1 and in neither v2 repo. Both are **derived on every call and
never stored** (ADR-0026): a stored discrepancy is a third record that can disagree with
the two it summarises.

- **`hotel-reconciliation`** — hotel charges that succeeded in Stripe with no booking row
  behind them. The customer holds a room this platform cannot see, show them, or cancel.
  It repairs nothing deliberately: a reconciler that writes from payment evidence
  eventually acts on a stale read, and the action at the end of that path is a refund.
  Refuses outright when `STRIPE_EXPECTED_ACCOUNT` does not match the key's account, because
  the compose file pairs live RDS with test Stripe keys and scanning there reports every
  test intent as unrecorded while hiding the real one.
- **`platform-cost-reconciliation`** — whether the month's markup covered what the month
  cost to serve, reading the Stripe fee this system now records against the one the model
  assumed. This is the loop that was missing when a 4% flight markup sat below a 4.017%
  break-even for months; what surfaced it was an invoice screenshot arriving by chance.

**Both are now scheduled**, along with `etg-dump-sync` and `seed-room-groups`, which
existed as routes that nothing called. In v1 all four are still unscheduled — their cron
expressions are written in their route comments and wired to nothing.

### Three defects found while measuring

- **api-v2 cancelled by the reference OTV rejects.** OTV answers a cancel addressed by
  supplier reference with "Request not accepted by supplier" while accepting the identical
  booking by client reference (measured 2026-09-06 on CG-770AZS / supplier 448577296). v1
  only ever worked here by accident — its `provider_metadata` was double-encoded, so the
  supplier reference read as undefined and it fell through to the client branch. api-v2
  inherited the supplier-first order without inheriting the accident, so **its hotel
  cancellations would have failed outright.** Now client-first with the supplier reference
  as a fallback, pinned by tests rather than by a comment.
- **The OTV credit alert could never fire.** RateHawk denominates the credit line in PHP —
  600,000 PHP — while the outstanding sum was taken over `total_price`: the guest price,
  markup included, in whatever currency each guest paid. Two different units compared as
  bare numbers, so a 600,000 PHP ceiling read as $600,000, about sixty times the real one.
  That alert is the only warning before OTV starts silently auto-cancelling refundable
  bookings at their free-cancellation deadline. Now summed over `supplier_cost`, with the
  limit converted into the same currency, and a conversion that fails raises a notification
  instead of reading as healthy.
- **Nothing recorded a supplier call.** A `bookings` row records a *sale*; it is written by
  `confirmBooking`, above the client that performs the mutation, so a supplier booking that
  never reaches that point exists at OTV and nowhere here. That is CG-770AZS, which OTV
  raised with us and we could neither confirm nor deny.
  `supplier_booking_attempts` now records the *call*, written before the mutation and
  closed after — at the TravelgateX client, not at a route, so the trace does not depend on
  which caller took which path. Migration applied to both local databases and to live on
  2026-09-17.

### Also

- **`poll-pending-tickets` marked bookings ticketed with no ticket numbers.** It set the
  status and left the column empty — the same field the webhook path fills. It now records
  the numbers and sends the e-ticket email, which makes it the third route by which a
  ticket can be announced and the only one that catches a webhook we never received.
- **`backfill-booking-fx`** ported. `lockFx` never throws by design, so a rates outage
  leaves the FX columns null rather than costing the booking — and a row with no rate is
  excluded from every blended total, permanently. This is the other half of that design.
  Dry run by default. 19 rows pending locally, all priceable; **not run with `--apply`.**

### Checked

`scratch/smoke-v2-c6-ops.mjs` — 20 checks, including live calls to both reconcilers.
`reconciliation.test.ts` (10), `platformCost.test.ts` (8), `cancelReference.test.ts` (9).
**No booking was created and no cancellation was sent to the live supplier.**

### Not ported, and why

- `purge-support-attachments` and `resume-support-translations` — C8, deliberately last.
- v1's deploy workflows and its one-off operator scripts (`audit-city-aliases`,
  `city-spelling-candidates`, `peek-*`, `tgx-list-bookings`, `import-otv-delta`). These are
  v1's deployment and investigation tooling, not product behaviour; api-v2 deploys itself.
- `backfill-segment-terminals` — still waiting on the terminal columns, as under C3.

---

## Done 2026-09-17 — C0b’s SEO half, and C2/C3 re-measured

### C2 and C3 were already level

Both deltas turned out to be the work done on 2026-09-16, committed in v1 since. Three
items were genuinely missing from v2 and are now in:

- **`offer-refresh` could substitute a different flight** — already fixed in api-v2 under
  C3, confirmed against the delta.
- **An offer’s times went through `new Date()`.** A provider quotes a flight the way a
  boarding pass does — 08:15 at the gate it leaves from — with no UTC offset, so there is
  nothing for a `Date` to convert *from*. Building one anyway makes the browser guess a zone
  and render in another. app-v2 had three copies of that formatter; there is now one that
  reads the digits out of the string, one `formatBookingTime` for a booking’s times (which
  really are instants), and a test that holds in any timezone.
- **`ticket_numbers`:** v1’s delta changes `JSON.stringify(tickets)` to `tickets`, on the
  stated premise that the column is `text[]`. **It is `jsonb` in both local databases**, and
  both binding forms round-trip correctly through postgres.js, so v1’s change is harmless
  but its comment is misleading. api-v2 uses `::jsonb` with `JSON.stringify`, which is right
  for the schema Prisma declares. Worth confirming against live before anyone "fixes" it.

### C0b — canonicals, and which locales a deployment claims

v1 rebuilt `hreflang` around a question v2 never asked: **which locales does this
deployment actually serve?** app-v2 had the shape that made a language disappear.

- **Every page declared the English URL as its canonical.** `/ja/terms` named `/terms`
  as canonical, which tells Google the two are the same page and one should be discarded.
  The canonical now carries the prefix the page is served under.
- **`hreflangAlternates` had no callers at all.** No page in app-v2 emitted a canonical or
  an alternate. Ten now do; `/property/[id]` among them, which is one indexable page per
  hotel and therefore the whole long tail.
- **A locked deployment is now a real case.** AirangGo sets `NEXT_PUBLIC_LOCALE=ko` and
  serves one language at the root — a prefix does not switch language there, so every
  canonical is unprefixed, folding those prefixed URLs onto the real one.
- **Korean is no longer advertised by CheapestGo as its own** (ADR-0037). `/ko` still answers
  and still names itself as its own canonical — so it is not absorbed into the English page —
  but it is in no sitemap.
- **The sitemap reads the same list the pages do.** Two copies is how v1’s sitemap came to
  advertise a `/ko` its own pages no longer claimed.

Three pages were `'use client'` *page files*, which cannot export `generateMetadata` at
all — `/property/[id]`, `/deals`, `/destinations/[slug]`. Each is now a server route file
over a client component of the same content.

**Verified against a real build**, not just a typecheck: `/terms` canonicalises to
`/terms`, `/ja/terms` to `/ja/terms`, `/ja/property/31810` to itself with three alternates
and an `x-default`, and the sitemap is 78 URLs with no `/ko` in any of them.

### Amended 2026-09-18 — the alternates had to become cross-domain

v1 moved the same evening (`e79f3542`), closing the last open consequence of ADR-0037, and
the shape ported above was already the wrong one. **Google discards an alternate the named
page does not confirm back**, so a set only one domain declares counts for nothing — dropping
`ko` from CheapestGo did not make CheapestGo’s alternates correct, it made all of them
inert.

Both domains now declare the same four languages, each at its home: `ko` at
`airanggo.com`, `en`/`ja`/`zh` at `cheapestgo.com`, `x-default` at the English page. A
deployment emits its own languages as relative paths and the others absolute, so the two
sides resolve to an identical set — which a test asserts directly, by resolving both against
their own origin and comparing.

The homes are a constant, not `NEXT_PUBLIC_SITE_URL`: an alternate names the page on the
live site, so a local or staging build still points at production for a language it does not
serve. Its own languages stay relative, which is what lets the same image serve both brands.

Checked by running the build twice — once as CheapestGo, once with
`NEXT_PUBLIC_LOCALE=ko` and AirangGo’s site URL. Both emit the same five links, and
AirangGo’s sitemap is 26 Korean URLs where CheapestGo’s is 78.

### C0b’s other half is the translation pass, and it is still open

The rest of the C0b delta is `src/locales/*.json` — v1 has **2,328 keys per language** and
app-v2 has 248. Missing namespaces: account, bookingDestination, checkout, destinations,
flightBook, invoice, legal, popularDestinations, property, propertyGallery, propertyNav,
propertyOverview, reviewsSection, search, trips, about, support, map, help.

This is deliberately not started here. It is bulk translation rather than behaviour, it
wants a native reviewer for ko/ja/zh, and doing it badly is worse than not doing it — a
page that renders in broken Korean is the thing the Korean brand exists to avoid.

**The delta cannot see this, and the C0b watermark is at `e79f354` anyway.** A watermark
measures how far v1 has moved since v2 last caught up; these keys are not a movement. v1 has
held roughly 2,300 of them all along and app-v2 never had them, so the gap is a *level*
difference and reads as zero however the watermark is set. Holding the watermark back would
not have made it visible either — it would only have hidden the SEO work that is genuinely
done. It is tracked here, in prose, because nothing else can track it.

---

## Done 2026-09-17 — C5, the half that is not the Support Desk

Most of C5’s 28 commits are Support Desk admin — the conversation queue, agents,
attachments, hours — which is C8. What is left is the back office proper.

### An admin could promote anyone, including by typo

`POST /admin/users/:id/promote` read the role as
`role === 'admin' || role === 'user' ? role : 'admin'`. **Any value it did not recognise
granted administrator** — a typo, a role from a newer deployment, an empty body. It also
let an admin demote themselves, which locks them out of a console nothing left can reopen.

The rule is now `validateRoleChange`, tested without a session, and the route records who
changed whose role in `admin_audit_log` — a table that existed and had one caller.
`support_agent` is deliberately **not** in v2’s role vocabulary: `users_role_check` admits
only `user` and `admin`, so accepting it would pass validation and fail at the database.
It arrives with C8 and the migration that widens the constraint.

### The revenue screen added currencies together

It summed `charged_price` across bookings in PHP, KRW and USD as bare numbers — a
₩1,200,000 stay counted as 1,200,000 against a dollar total. The code said so honestly in
a comment ("only meaningful while one currency dominates"), which is not the same as being
right.

Every total is now restated at each booking’s **own locked rate** (ADR-0008) rather than at
today’s, so a closed period does not move each time the page is opened. Each row still
shows the currency the customer was charged in. A booking with no locked rate contributes
nothing and is **counted**: `unconvertedCount` is 19 against the local database today,
which is exactly the number `backfill-booking-fx` reports as pending.

### The booking list named nothing

A hotel row showed the property name and a flight row showed its PNR, so an agent taking a
call about "the Manila flight on the 9th" could match the caller only by reference. The
list now names the trip — and names a flight by the **whole journey**: a connection reads
`MNL→NRT` rather than `MNL→ICN`, and a return reads `CRK⇄PUS` rather than `CRK→CRK`,
which named nowhere. The segments are aggregated in the same query, so 500 bookings do not
become 500 follow-up reads.

### Checked

`roleChange.test.ts` (7), `adminRevenue.test.ts` (4), `normaliseBooking.test.ts` (13), plus
live calls: self-demotion and an unknown role both refused, the revenue endpoint reporting
USD with its unconverted count, and the booking list naming real journeys.

### Not done, and why

Everything under `admin/support/**` — 14 routes — is the Support Desk, which is C8. The
C5 watermark stays at `6b0ced4` until that lands, because advancing it would bury them.

---

## Done 2026-09-18 — the legal pages, in four languages

### It was never a translation problem

The gap recorded above as "the translation pass" is not missing translations. **246 of
app-v2's 248 keys already use v1's exact key paths**, and v1 holds real, human Korean for the
namespaces app-v2 lacks — `legal` 296 of 306 strings in Korean, `trips` 272, `checkout` 211,
`property` 130 of 130.

What is missing is `t()` calls: **11 of app-v2’s 187 component files use translations at
all.** Wiring a component to a key path v1 already covers lights up all four languages at
once. A native reviewer is needed only for strings v1 never had — which corrects what this
document said yesterday, that the whole pass was blocked on one.

Admin is excluded, and that is v1’s rule rather than a shortcut: **v1 translates none of its
99 admin files and has no `admin` namespace.**

### The four legal pages first, because the SEO work made them worse

They are the pages whose canonicals landed yesterday — so AirangGo now has Korean-targeted,
indexable legal pages that greeted a Korean reader in English. They are also the pages that
state who holds a reader’s data and what they are agreeing to.

`legal` (306 strings × 4 languages) is now in app-v2, and the pages render from it. The
markup stays v2’s own ([ADR-0016](adr/0016-parity-is-functional-not-visual.md)); only the
words are shared.

Rendered **from the data**, unlike v1, which hand-writes a JSX block per section. There are
45 sections across the four documents and v1 is still editing the copy, so a block each is
both longer and a thing to keep in step by hand. The risk that buys is the opposite one — a
key shaped in a way the renderer does not know disappearing in silence — so the test walks
every leaf string in all four documents and fails naming any that did not reach the page. It
caught three real gaps while it was being written: list entries shaped `{label, text}`
rendering as nothing, a link whose text is keyed `refundLinkText` rather than after its
stem, and a "email us at" sentence with no address of its own.

### One company, named the same way everywhere

Three different companies appeared across the three repos. **FORHU Inc. is the operating
entity** (confirmed 2026-09-18), which is what v1 already served publicly and what the
TravelgateX contract names.

| Was | Where | Now |
|-----|-------|-----|
| JTP Partners | app-v2’s four legal pages and its footer copyright | FORHU Inc. |
| CheapestGo Travel Services | the receipt PDF in v1 and api-v2 | FORHU Inc. |
| `FORHU Inc.. All rights reserved.` | every app-v2 page footer | the doubled period is gone |

The receipt FIXME is resolved rather than carried forward. The doubled period is inherited
from v1 and is **still live there** — `footer.copyright` in all four of v1’s locale files.

### Checked

`legal-sections.test.tsx` — 15 tests, including the exhaustive coverage walk and a check that
every `linkHref` in the messages becomes a real href. Then against a running build: `/terms`
in English, `/ko/terms` in Korean — its headings render as Korean rather than English — and
133 mentions of AirangGo and none of CheapestGo across the new strings — `applyBrand` reaches
the ported copy, which the C0b brand smoke confirms at 26/26.

### What is left of the storefront

Roughly 130 files still hold hardcoded English, with the user-facing text concentrated in
about 14 of them — checkout, property, trips and search being the ones that matter. The
namespaces are already in v1 with Korean written: `checkout`, `property`, `trips`, `search`,
`account`, `invoice`, `flightBook` and the rest.

---

## Out of scope

- `src/components/voice/VoiceAssistant.tsx` and `api/voice` — Voice Layer is Phase 2.
- `api/debug/tgx`, `api/test-email`, `internal/setup-staging-schema` — development-only.
- `api/fn/[name]` — generic function runner, deliberately replaced by admin actions.
- All of v1's design: components, styling, layout, landing sections, legal-page markup.

## Stale tests, not bugs — app-v2, resolved 2026-09-02

Eight app-v2 tests arrived red with the teammate's UI pull and stayed red through the rebase. None of them was a defect. Both components had been deliberately redesigned and their tests had not followed, so every failure read as "Unable to find an element with the text …" — the components render something coherent, just not what the old assertions described.

**`property-description.tsx`.** The panel no longer holds amenities behind a "See all amenities" disclosure. It now picks the *near-universal comforts* out of the whole amenity set with `GENERAL_AMENITY` — Wi-Fi, air conditioning, a bathroom with toiletries — caps them at five, and passes `disclosure={false}`. A hotel's more particular facilities (a pool, a gym, a ski room) belong to the room-detail modal. The group is also relabelled: `Amenities` → `General Amenities`, `Policies & rules` → `Rules & Policies`. The `COLLAPSED_AMENITIES` machinery still exists inside `ChipGroup` for other callers; this panel simply stopped asking for it.

**`room-selection.tsx`.** Amenities left the card face. A card now draws only its structural rows — bed, occupancy, board — under "Room Details", and everything else is behind "View more", which opens a dialog rather than expanding in place. Board wording changed too: `RO` reads "Room Only" on both the row and the pill, not "No Breakfast Included". The pill deliberately runs a size shorter than the filter chip ("Breakfast" vs "Breakfast Included") so the two fit different places.

**Layout.** The check-in/check-out hours and the amenity chips are no longer two cells of one grid. The hours sit in the head row beside the price and rating; the chips are a row of their own beneath. The goal is unchanged — a long amenity row must not drag `IN` and `OUT` down with it — but it is now met by separating the rows rather than by pinning the hours to the top of a shared cell.

**What was changed.** Only the two test files; no component was touched. Each test kept its original intent and was re-pointed at where the behaviour now lives — the amenity-fallback and rate-owns-its-own-list tests read through the modal, and `offers View more only once the features outrun the card` became `keeps the amenities off the card face, behind View more`, since "View more" is now unconditional on a column that has rows.

**Two tests were passing vacuously.** `draws no policies group when the hotel states none` queried the old `Policies & rules` label, which no longer exists under any condition — it has been re-pointed at `Rules & Policies` and is a real check again. `offers no amenities link when they all fit` queries a `See all amenities` button the panel can no longer render at all; it is left in place but is worth deleting when that component is next touched.

**Correction to an earlier reading in this document's history.** The `.slice(0, 5)` in `property-description.tsx` was at one point suspected of defeating the disclosure. It does not — the cap is the design, and the disclosure is switched off independently. The board field was likewise suspected of a room/rate shape mismatch; `ratesOf` maps `boardCode: room.boardType`, so that path is sound.

## C2c — metapolicy, ported 2026-09-02

**What v1 has.** `hotel_content.metapolicy_struct` and `metapolicy_extra_info`, added by `20260728000001_hotel_content_metapolicy.sql` for RateHawk API Addendum §10(b), filled by the `etg-dump-sync` cron, and read into the property payload as `metapolicyStruct` / `metapolicyExtraInfo`. **Nothing in v1 consumes either field.** The data reaches the edge of the page and stops.

Meanwhile v1's no-show and early-departure disclosure — `extractNoShowPenalty`, `detectNoShowPenalty`, `CancellationPolicySection`, `PoliciesSection` — reads `cancelPolicyInfos` and `hotelRemarks` off a LiteAPI-shaped blob. TravelgateX sends neither, so those paths are dead in v1 as well. The port therefore carries the *rule* (§10(b) requires disclosure) onto the shape that actually arrives, per ADR-0025.

**ETG's `no_show` is not a fee.** It is `{ time, day_period, availability }` — the hour past which a guest counts as a no-show. There is no amount in it, so v1's `noShowPenalty: number` has no source and cannot be ported. Disclosing the deadline is the honest equivalent; inventing a number would be worse than saying nothing.

**Measured, not assumed.** All 50 hotels on 5433 and 5434 carrying a metapolicy have the same 14 keys — 12 arrays, plus `no_show` and `visa` as objects. After normalisation **50/50 produce drawable sections**. `check_in_check_out_type` is `unspecified` on every row that has it, so those rows genuinely cannot say which of the two they are; that is the hotel's silence, not a mapping gap.

**A price counts as stated only when a currency came with it.** ETG writes `"0.00"` for two different facts: a cot that is free (`currency: "EUR"`) and a charge the hotel never filled in (`currency: null`). The currency decides — with one, zero means Free; without one, the row still discloses "Not included in the rate" but shows no amount. Reading the second as free would disclose the opposite of the truth, which is the one error a §10(b) obligation cannot absorb.

**The client was already built for this.** app-v2's `room-selection.tsx` has taken a `propertySections: DetailSection[]` prop and an `additionalInfo` string since the modal landed, `room-content.tsx` renders them through `DetailSectionGrid`, and `property.types.ts` says in a comment that it *"mirrors cheapestgo-api-v2 src/lib/hotels/roomContent.types.ts"* — a module that did not exist. It does now, and `getProperty` emits `roomPolicySections` and `additionalInfo` into it. **No app-v2 change was needed.** Verified end to end against `GET /api/v2/hotels/property/6301530`.

**`SectionId` is a closed union shorter than ETG's group list, so groups merge:** deposit, parking, pets, shuttle, early check-in/late check-out, additional fees, no-show and visa all file under `general`; cots and extra beds under `beds-extra`; children and children's meals under `child-policy`; meals under `food-drink`; internet under `internet-comms`.

**Still open on the same contract.** `amenityGroups` is the other prop app-v2 declares under that same "ETG-sourced extras" comment, and api-v2 does not emit it either. Room-scoped `DetailSection`s (`RoomContent.sections`, `keyFacts`, `bedLine`, `bedsExtraSummary`) are likewise unimplemented server-side — the modal falls back to `allFeatures` when they are absent, which is why nobody noticed.

### Pre-existing bug found and fixed: the property endpoint was answering 500

`hotel_review_items.id` is a Postgres `bigint`, which Prisma returns as a JS `BigInt`, and `JSON.stringify` throws on one. `getProperty` returns `reviewItems`, so **every hotel with a review row — 3,827 of them — was answering `500 INTERNAL_ERROR`**. The container running pre-change code fails identically, so this predates the metapolicy work; it surfaced only because verifying the metapolicy meant calling the endpoint. `findHotelReviewItems` now stringifies the id. The client keys these rows by array index, so nothing downstream changes.

api-v2 after C2c: **196 tests** (was 175), typecheck clean.
