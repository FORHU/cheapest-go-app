# Hotel search audit — open follow-ups

Audit run 2026-08-27 against `cheapestgo.com` and the container on `:3001`. Everything
below is what was **not** finished. Work that was completed is in commit `aa3eb8e` and
its parents; the reasoning behind the decisions already taken is in
[ADR-0024](adr/0024-supplier-coordinates-are-not-improved-by-geocoding.md) and in the
`Unanswered Search`, `NONE Sentinel`, `Cron Job` and `Scheduler` entries in
[CONTEXT.md](../CONTEXT.md).

Database observations are as of 2026-08-27 and were not re-verified when this list was
written on 2026-08-31.

---

## 1. Payload trim — the largest remaining win

**The original complaint was "search takes 40 seconds". This is the part of it that is
still unaddressed.** Server time was improved; the bytes were not.

A production search ships **5–7 MB to display ~100 hotels** (Gangnam measured at 6.82 MB
post-deploy). Roughly 86% of it is never read by anything:

| Field | Share of Phase 1 payload | Read by |
| --- | --- | --- |
| `description` | 34.8% | nothing |
| `amenities` | 30.3% | nothing — the amenities filter is a URL param, not client-side |
| `images[1..n]` | ~20% | nothing — the card renders `image` only, there is no carousel |
| `roomTypes` | 223 KB on a Bangkok search | nothing on the client |
| `done.allMappable` | 209–468 KB | duplicates hotels already sent in `hotels` messages |

The card reads exactly eleven fields: `currency, id, image, location, name,
originalPrice, price, priceLoading, rating, refundableTag, reviews`. The list adds
`coordinates`, `type`, `boardTypes`. `SearchMapView` explicitly overwrites `description`
and `amenities` with empty values when it builds its own objects.

**Decision already taken:** trim at the DB query, not the response boundary — it saves
the read, the detoast, the ~85 KB average `hotel_search_cache` rows and the
serialisation, not just the network.

**Two `LIMIT 1000`s exist and only one is free to shrink.** `getInstantHotelCatalog` in
the stream route is display-only — shrinking it costs zero priced results. The one in
`runCityFallback` decides how many hotel codes TGX is asked about, and shrinking that
trades coverage for speed.

Measured on the production radius query: fat `LIMIT 1000` **22.9 s**, slim `LIMIT 1000`
**3.9 s**, slim `LIMIT 300` **2.1 s**. Container timings over a home link, so the
absolute numbers are inflated; the ratio is not.

`fetchHotelContent` is shared with the single-hotel path, which *does* need
`description`/`amenities` for the property page — it needs a slim/full mode, and the
property page needs a test.

## 2. Verification gaps

- **Neither "prices unavailable" banner has ever been rendered.** Two were written —
  `HotelResultsClient` (list) and `MapResultsClient` (map, floating) — and zero have been
  seen in a browser. They typecheck and the trigger condition is correct, which is not
  the same thing. To force one: `TRAVELGATEX_ENDPOINT_URL=https://tgx-unreachable.invalid npm run dev`
  then search a city on a date never searched before, or `hotel_search_cache` serves a
  success and nothing shows. Note the `TRAVELGATEX_` prefix — `env.ts` prefers it over
  `TRAVELGATE_`, and overriding the wrong one silently does nothing.
- **Batching under concurrency is untested.** The hotel-code fallback now fires five
  parallel TGX calls where it fired one. `search.ts` carries a comment saying OTV
  throttles, and there is no rate limiter, no 429 handling and no concurrency cap in the
  TGX client. At ~28 searches/day this is close to theoretical, and a throttled batch
  degrades safely (counted as unanswered, catalog preserved) — but it has only ever been
  tested one search at a time.
- **The deploy's cron step has never been confirmed on EC2**, and the easy signal is now
  contaminated. Production's sidecar was definitely running on 2026-08-27 — 26,194 reviews
  synced at exactly 02:00 UTC while the local cron was down (its logs show a gap from
  08-22 14:xx to 08-27 07:41), and `etg-reviews-sync` has no GitHub workflow. But that was
  the *pre-existing* hand-started container; whether the **deploy** now recreates it is
  still unknown. The 02:00 UTC timestamp can no longer prove it either, because the local
  sidecar fires the same job — it did so on 09-01. Only
  `ssh <ec2-host> 'docker ps --filter name=cheapestgo-cron'` settles this.
- **Prebook's 55 s timeout is proven only as no-regression.** A live prebook returned 200
  in 6.5 s, comfortably inside both the old 18 s and the new 55 s. The fix only bites on a
  quote slower than 18 s, which cannot be manufactured on demand.
- **Four crons could not be verified either way** — `check-price-alerts` (no price alerts
  exist), `poll-pending-tickets` (no pending tickets), `cleanup-sessions` and
  `cache-cleanup` (nothing expired to delete). No evidence of failure, none of success.

## 3. Data and infrastructure debt

- **RDS has no `schema_migrations` table.** Nothing records which migrations have been
  applied there, and `dbmate up` from a developer shell reads `DATABASE_URL`, which points
  at local Postgres on 5433 — so it reports success while changing nothing that matters.
  **This single gap caused three separate production bugs found in one afternoon:** flight
  segments silently discarded, hotel bookings losing `source_brand`, and the ETG dump sync
  unable to write. All three were hidden by `try/catch` blocks that logged and continued.
  Backfilling the table is not purely mechanical: asserting all 34 migrations applied would
  claim data-only ones like `clear_etg_hotel_images` ran, which can only be verified
  structurally.
- **The migration audit only covered tables, columns and functions** — not indexes,
  constraints or enum values. More drift may exist.
- **239,764 hotels carry Nominatim coordinates**, overwritten in place with no original
  retained, and measurably less precise than the supplier's (9.3% share an exact
  coordinate against 4.0% of untouched rows). `osm_geocoded_at` identifies them. Repair
  means re-pulling `lat`/`lng` from the ETG dump. See ADR-0024.
- **The `NONE` sentinel clear costs one slow search per city.** 3,828 cities each owe a
  one-off destination-code resolution as the cache repopulates; Seoul's first search after
  the clear took 26 s.
- **Orphaned Duffel order `ord_0000B9eW4pEUTDvzh27YXo` / `C2IWPF` still needs cancelling.**
  `cleanup-orphaned-duffel-orders` runs every 10 minutes from the sidecar and has not
  resolved it, which is worth understanding on its own.

## 4. Loose ends in the code

- **`/api/search/more` is dead** — no callers, and it does not paginate: it re-runs the
  whole search with no offset or cursor.
- **`fetchSearchData.ts:348`** wraps `searchTravelgateX` in `.catch(() => null)`, so the
  non-streaming `/api/search` route swallows `UnansweredSearchError` and still renders
  empty. The live path is the stream, so this is secondary — but it is the same bug that
  was just fixed, surviving in a second place.
- **Infinite scroll was deferred, not rejected.** The agreed position was to trim first and
  re-measure; at ~250 KB there may be nothing left worth lazy-loading. If it is revisited,
  it needs server-side sort and a real cursor, and it conflicts with
  [ADR-0022](adr/0022-dense-map-markers-are-clustered-never-truncated.md), which requires
  complete map coordinates.
- **Staging has no `CRON_SECRET` and no cron sidecar.** Deliberately not added: if staging
  shares the production RDS, a second sidecar would double-run every job, including
  orphaned-order cleanup and ticket polling. Needs a decision about staging's database
  first.
- **Jobs are not written to tolerate two schedulers.** The local sidecar was found running
  all 12 production jobs against live RDS — it curls the app service, which by design
  talks to RDS, so `docker compose up` was silently starting a second scheduler alongside
  production's. It is now behind a `cron` compose profile and opt-in. No harm resulted,
  but only because auto-refunds carry a Stripe idempotency key and order cleanup tolerates
  `already_cancelled`. `poll-pending-tickets` re-reads status before refunding but takes no
  `FOR UPDATE` or advisory lock, so it is safe by one key rather than by design. Worth a
  deliberate pass if a second scheduler ever becomes legitimate.
- **`hotel_content` has no index supporting search** — 1.14 M rows, no index on `city`,
  `country` or `lat`/`lng`, so both the radius and city-name branches sequentially scan.
  Deliberately deprioritised: the scan costs ~367 ms while the fat projection costs
  ~19,000 ms. Worth doing after the trim, not before, and the `ILIKE '%city%'` predicate
  should become an exact match on a normalised key at the same time — the wildcards buy
  nothing (the alias map already handles spellings like Tokyo → "Tokio") and actively pull
  in false positives such as Villeparisis and Damparis for Paris.

---

## Suggested order

1. **Payload trim** — the only item that addresses the original complaint, and it shrinks
   the content-API call and cache rows as a side effect.
2. **Confirm the cron sidecar** — cheap, and silent failure means ticket polling and
   refund checks stop with nothing to flag it.
3. **RDS migration tracking** — the root cause of three production bugs; until it is
   fixed, the next missed migration is found by accident again.
4. **Render the banners** — small, but two pieces of user-facing code have shipped unseen.
5. Everything else.
