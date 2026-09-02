# Hotel search audit — open follow-ups

Audit run 2026-08-27 against `cheapestgo.com` and the container on `:3001`. Everything
below is what was **not** finished. Work that was completed is in commit `aa3eb8e` and
its parents; the reasoning behind the decisions already taken is in
[ADR-0024](adr/0024-supplier-coordinates-are-not-improved-by-geocoding.md) and in the
`Unanswered Search`, `NONE Sentinel`, `Cron Job` and `Scheduler` entries in
[CONTEXT.md](../CONTEXT.md).

Section 0 records what has since been closed. Everything after it is still open.

Database observations were re-verified on 2026-09-01 against live RDS.

---

## 0. Closed since this list was written (2026-09-01)

**Payload trim — done.** Every field measured as dead weight is gone from the wire.
`getInstantHotelCatalog` selects `images[1]` instead of the whole array and no longer
selects `description` or `amenities`; `fetchHotelContent` gained a `slim` mode, defaulting
to full so a new caller cannot silently lose fields; city results carry `roomTypes: []`;
and `done.allMappable` goes through `toMapPins()`, which keeps the ten fields the map
plots instead of re-serialising every hotel a second time. Two pure duplications went with
them — `images` echoed `image`, and `address` echoed `location` with no reader at all.

| City | Before | After | Per hotel shown |
| --- | --- | --- | --- |
| Gangnam | 6.82 MB | 2.28 MB | 53.7 KB → 8.9 KB |
| Jeju | 5.59 MB | 1.55 MB | 86 KB → 17 KB |
| Cebu City | 3.22 MB | 1.37 MB | 169 KB → 8.1 KB |
| Seongnam | 4.64 MB | 1.31 MB | — |

`done` alone went from 209–468 KB to 34 KB. What remains is mostly the 1,000-row catalog
at roughly 1.3 KB each; the only lever left there is the display `LIMIT`, which is a UX
call about how many placeholder cards to show and is deliberately untouched.

**Refundable Tag canonicalised — done.** The server emitted `REFUNDABLE`/`NON_REFUNDABLE`
while the search UI tested `=== 'RFN'` in four places, so **"Free cancellation only"
silently returned zero hotels and the free-cancellation badge never rendered**. Checkout,
the policy formatter and the cancellation engine had each grown their own `||` chain
accepting both spellings; the search UI was the one place that had not, and an empty
filter result looks exactly like "nothing matched". `toRefundableTag()` now converts at the
supplier boundary. Measured after: `{RFN: 79, NRFN: 89}` — 79 hotels match the filter.
See the **Refundable Tag** entry in CONTEXT.md.

**Amenity language — done, and it was not what it looked like.** Customers saw Italian and
German on the property page. The map already contained those words; two bugs stopped it
being consulted. `otvCodeToLabel` did not collapse spaces before lookup while
`normalizeStoredAmenity` did, so a supplier code arriving as spaced text missed an entry
the map already held — both now share one `toAmenityKey()`. And the property page's
`Array.isArray(r.amenities)` was false for exactly the rows that had data, so it silently
fell back to raw supplier text. ~110 genuinely new German, Dutch, Spanish and Italian
entries were added on top (91.7% coverage of 177,682 non-English occurrences), plus a fix
for the prettifier capitalising the letter after every accent (`GepäCklagerung`).

**jsonb double-encoding — writers fixed and backfilled.** `${JSON.stringify(x)}::jsonb`
double-encodes under postgres.js: it infers the parameter as jsonb and JSON-encodes it, so
the cast lands on an already-encoded string. Verified directly against this database —
that form yields `string`, `${sql.json(x)}` yields `array`. Every `hotel_content` writer
now uses `sql.json()`, and migration `20260901000001` repaired ~77,000 rows across
`amenities`, `amenity_groups`, `contact_info` and `room_groups`. All four columns now
report zero `string` rows. The defensive parse in `fetchPropertyData` is kept as
belt-and-braces for anything historical.

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
- **The booking tables are still double-encoded, and one of them reaches refunds.**
  `hotel_content` was repaired by migration `20260901000001`, but the same
  `${JSON.stringify(x)}::jsonb` pattern lives at ~8 further call sites in `bookings.ts`,
  and the damage is already stored: `bookings.cancellation_policy` is **8 string / 1
  object**, `booking_policy_snapshots.raw_liteapi_response` is **9 string**. At
  `bookings.ts:881` the read is `const stored = bookingRow.cancellation_policy as any` —
  a jsonb string is truthy, so it is returned in place of the fallback object and
  `cancelPolicyInfos` arrives `undefined` in the refund path. Nothing is broken today:
  there are 8 bookings and 6 are already refunded. Deliberately left alone — it touches
  money and wants its own decision, not a side effect of a search audit.
- **`hotel_search_cache` is never purged.** 233 rows, oldest 2026-08-21. Reads check the
  row's age so a stale entry is never served, but nothing deletes it; the table grows
  without bound. `cache-cleanup` looks like the owner and is not — it targets
  `search_results_cache`, a different table.

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

1. **The booking-path double-encoding** — the only open item that touches money.
   `cancellation_policy` is stored as a string on 8 of 9 bookings and is read straight into
   the refund path. Harmless while the booking count is tiny; the cost of finding out later
   is not.
2. **Confirm the cron sidecar** — one SSH command. Silent failure means ticket polling and
   refund checks stop with nothing to flag it, and the usual signal is no longer trustworthy.
3. **RDS migration tracking** — the root cause of three production bugs in one afternoon;
   until it is fixed, the next missed migration is found by accident again.
4. **Render the banners** — small, but two pieces of user-facing code have shipped unseen.
   Everything about them is verified except the pixels.
5. Everything else.

A note on order, from the shape of this audit: every item here was found by measuring
rather than reasoning, and the obvious answer was wrong more often than not. The missing
index mattered far less than dead columns. Aligning timeouts to the supplier's own spec
broke a city until batching was added. "Production is broken" turned out to be an artefact
of testing on far-future dates. The Italian amenities were not a missing translation but a
lookup key that did not match. Prefer measuring the next item over reasoning about it.
