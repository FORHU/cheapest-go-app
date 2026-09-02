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

| # | Slice | Watermark | Delta (re-run 2026-09-02) | State |
|---|-------|-----------|---------------------------|-------|
| C0a | Backend consolidation | `12f2af3` | empty | level |
| C0b | Locale + SEO shell | `791d4e2` | **2 commits** | drifted — see Catch-up |
| C1 | Hotel search | `791d4e2` | **6 commits, +1418/−125** | drifted — see Catch-up |
| C2 | Hotel booking | `6b0ced4` | not measured | **in progress** — C2a/C2b done, C2c partly |
| C3 | Flights | `6b0ced4` | not measured | audited 2026-08-26, not ported |
| C4 | Account | `6b0ced4` | not measured | not started |
| C5 | Admin | `6b0ced4` | not measured | not started |
| C6 | Ops | `6b0ced4` | not measured | not started |
| C7 | Mobile and misc | `6b0ced4` | not measured | not started |

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

- **C0b — `applyBrand`.** app-v2 had the brand-lock chain but not the message rewriting, so all 13 CheapestGo strings in `en.json` — the sign-in prompt, the footer, the FAQ, the privacy policy naming who collects the reader's data — rendered wrong on GeomeeGo ([ADR-0005](adr/0005-geomeego-white-label-deployment.md)). Ported to `app-v2/src/i18n/applyBrand.ts`, applied after the locale merge so untranslated keys inherit the English string and get branded too. 7 tests; app-v2 99 tests, typecheck clean. The 8 locale keys in `80cd47b` are **flight** keys and belong to C3, not here.
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

api-v2: 175 tests, typecheck clean. app-v2: 147 tests, typecheck clean — the suite went green on 2026-09-02 once the room-selection and property-description tests were re-pointed at the redesign they had fallen behind (see "Stale tests, not bugs" below).

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

**Gaps:** `google/search` and `og` are absent.

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
