# Golf trust, transparency & search — design

**Date:** 2026-10-12
**Branch:** `feat/golf-courses`
**Status:** approved in conversation
**Builds on:** `2026-10-05-golf-tee-time-booking-design.md`, `2026-10-05-golf-extras-design.md`
**Source:** `CheapestGo Golf Booking Service — Competitive Benchmark` (2026-10-10), gaps 2 and 5, Phase 1.

## Goal

Make CheapestGo's golf honest and searchable where GolfNow/TeeOff/Golfscape are not: one all-in
price from the first search result that equals the checkout price, each course's rules stored as
data and shown before payment, a consistent course fact block, and search by date, players and
time window with a hint when a course misses the chosen date.

## Decisions

- **Policy model, pragmatic.** Enforced per course: booking window and cancel cutoff (already
  enforced). Displayed per course: weather rule (plain text). **Not modelled:** deposits — we
  authorise the full amount and capture on confirmation.
- **All-in = green fee + service fee** for the chosen number of players, from the same fee function
  checkout uses. Extras stay optional and are never added to it. Players default to 2 and the
  screen says so, because the service fee has a flat component and is not linear in players.
- **Search hides courses with no tee times in their window; courses that miss the chosen date
  are shown below the matches with the nearest earlier/later dates that have availability.**
- **Who confirms is unchanged** (admin) — a course portal is a separate spec that builds on the
  policy fields added here.
- **Out of scope:** reviews, packages, waitlist, rate bands, rewards, deposits, price caps and
  sort controls in search, the course portal.

## Data — migration `20261012000001_golf_policy_and_facts.sql`

`golf_courses` gains:

| column | type | notes |
|---|---|---|
| `booking_window_days` | integer NOT NULL DEFAULT 60 | CHECK 1–90 |
| `weather_policy` | text NOT NULL DEFAULT `''` | ≤ 500 chars, plain text |
| `yardage` | integer NULL | CHECK 1000–12000 |
| `year_opened` | integer NULL | CHECK 1800–2100 |
| `designer` | text NULL | |
| `grass` | text NULL | |

`golf_bookings` gains `weather_policy text NOT NULL DEFAULT ''`, a snapshot taken at the hold (the
cancel cutoff is already snapshotted in `free_cancel_until`).

## Rules — `src/lib/golf/rules.ts`

- `HORIZON_DAYS` remains as the default window (60) and the schema maximum becomes 90.
- `isBookableStart(startsAt, now, windowDays = HORIZON_DAYS)` — lead ≥ `MIN_LEAD_HOURS` and
  ≤ `(windowDays + 1)` days.
- Tee-time generation, availability listing, hold and search use the course's own window.
  Shrinking a window deletes nothing: tee times beyond it just stop being bookable and listed.
- `MIN_LEAD_HOURS` stays global until the course portal exists.

## Price — `quoteGolf`

`quoteGolf({ greenFeeTotal, extrasTotal = 0, currency })` returns
`{ base, serviceFee, total }`; `holdTeeTime` and search both call it, so a search price cannot
drift from a checkout price. `allInPerPlayer = total / players`.

## Search — `src/lib/server/golf/search.ts`

`searchCourses({ country?, date?, players = 2, from?, to?, now })`:

- Matches open tee times with `spots_left ≥ players`, inside `[now + MIN_LEAD, now + window]`, on
  the course-local `date` when given and between course-local `from`/`to` times.
- Per course: cheapest matching tee time quoted all-in (total and per player) and its first 4
  matching tee times (chips linking to `/golf/[slug]/book`).
- No date: "From $X all-in for N players" from the cheapest upcoming match.
- Date set, no match that day: the course is returned `dated: false` with `nearest` — up to one
  earlier and one later date with availability and the all-in "from" price on it.
- Courses with no matching tee time anywhere in their window are omitted.

URL state: `/golf?date=YYYY-MM-DD&players=2&from=HH:MM&to=HH:MM&country=…`, a plain GET form.
Invalid params fall back to unset (date/times) or 2 (players); nothing 500s.

## UI

- `GolfPolicyBlock` — booking window, free cancellation, refund form, weather rule ("Ask the
  course" when blank) and the confirmation promise. Used on the course page, above the pay button
  at checkout, and on the booking status page/emails from the booking's snapshot. It states only
  what the system does; it never implies instant confirmation.
- `GolfFactBlock` — holes, par, yardage, opened, designer, grass, amenities; missing facts are
  omitted.
- `/golf` — filter bar, result cards with all-in price and tee-time chips, dimmed "nearest dates"
  cards.
- Admin course form — the six new fields; changing the window shows how many existing tee times
  fall outside it.

## Localization

`golf.policy.*`, `golf.facts.*`, `golf.search.*` in all four locales (locale-parity test).

## Error handling

A hold on a tee time outside the course's window is `not_bookable` (existing). Search validates
inputs with zod; bad values fall back to defaults on the page and 400 on the JSON endpoint.

## Testing

- Pure: window-aware `isBookableStart`, `quoteGolf`, time-window and date parsing.
- DB integration: search matching, nearest-date hint, time zones across midnight, window
  enforcement, search quote = hold quote.
- Component: policy block, fact block, filter form.

## Docs

CONTEXT.md terms "All-in price" and "Booking window"; ADR noting the window is per course.

## Implementation notes

- The course page's tee-time picker also shows all-in prices: `GET /api/golf/courses/[slug]/tee-times`
  takes `players` (default 2) and returns `allInPerPlayer` per tee time, from `quoteGolf`.
  Changing the party size refetches and keeps the chosen time; changing the date clears it.
- The admin form states, in a hint, that shortening a window keeps existing tee times but stops
  selling those beyond it. A live "N tee times outside the window" count was left out: nothing
  acts on it yet.
- The cheapest course card on `/golf` without a date or time filter also lists published courses
  that currently have no bookable tee time, as plain cards, so a course never disappears from
  the page just because it is fully booked.
- ADR-0047 records the all-in price and per-course window decisions.
