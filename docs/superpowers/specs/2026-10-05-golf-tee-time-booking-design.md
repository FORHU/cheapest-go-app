# Golf tee-time booking — design

**Date:** 2026-10-05
**Branch:** `feat/golf-courses`
**Status:** approved in conversation
**Builds on:** `2026-09-30-golf-courses-design.md`, `2026-10-02-golf-entry-points-design.md`
**Blueprint:** "CheapestGo Golf Blueprint" artifact (one timed-inventory engine; this is the first
slice of its phase 1)

## Goal

Let a customer pick a real tee time on a course page, pay for it, and get it confirmed — without
a golf supplier API. The team sets up tee-time schedules per course in admin; tee times are
generated from them. Because our tee times are not the course's own tee sheet, **a booking is
final only after the team has checked with the course**: the customer's card is authorised at
checkout and captured when the team confirms.

## Out of scope (later slices)

Add-ons (clubs, caddie, cart), lessons and range/sim bays, Stay & Play, one-off closed days,
golf bookings in "My trips", editing a schedule in place (delete and re-add), supplier feeds,
the partner API. "Ask about tee times" (support chat) stays on every course page.

## Rules

| Rule | Value | Where |
|---|---|---|
| Hold (unpaid) lasts | 15 minutes | `HOLD_MINUTES` |
| Bookable from | 24 h before tee time | `MIN_LEAD_HOURS` |
| Bookable until | 60 days ahead | `HORIZON_DAYS` |
| Team must decide by | earlier of request + 48 h and tee time − 2 h | `decideBy()` |
| Free cancellation until | tee time − course `free_cancel_hours` (default 48) | recorded on the booking |
| Players per booking | 1–4, never more than spots left | schema + SQL |

Card authorisations last about 7 days; the 48-hour decision window keeps capture well inside it.

## Statuses

`held → requested → confirmed`, with final states `expired`, `declined`, `cancelled`.

| From | Event | To | Money | Spots |
|---|---|---|---|---|
| — | customer starts checkout | `held` | PaymentIntent created, manual capture | taken |
| `held` | card authorised (webhook or status page) | `requested` | authorised | kept |
| `held` | 15 min pass | `expired` | PI cancelled | released |
| `requested` | team confirms | `confirmed` | captured | kept |
| `requested` | team declines, or `decide_by` passes | `declined` | PI cancelled, never charged | released |
| `requested` | customer cancels | `cancelled` | PI cancelled, never charged | released |
| `confirmed` | customer cancels before `free_cancel_until` | `cancelled` | full refund, fee included (ADR-0036) | released |
| `confirmed` | team cancels (closure, weather) | `cancelled` | full refund | released |

After `free_cancel_until` the customer cannot cancel online; the page points to support.
`close_reason` records why a booking reached a final state: `hold_expired`,
`declined_by_team`, `not_confirmed_in_time`, `cancelled_by_customer`, `cancelled_by_team`.

**The oversell guard** is one statement:
`UPDATE golf_tee_times SET spots_left = spots_left - $n WHERE id = $id AND status = 'open' AND spots_left >= $n`.
Zero rows means not enough spots. No app-side count, no lock.

**One live hold per customer per tee time** — a partial unique index on
`golf_bookings (user_id, tee_time_id) WHERE status = 'held'`. A second request for the same tee
time returns the existing hold instead of taking more spots. Starting a hold also releases that
customer's other live holds and sweeps expired holds first, so correctness does not wait on cron.

## Data — migration `20261005000001_golf_tee_time_booking.sql`

**`golf_courses`** gains `timezone text NULL` (IANA name; a course without one cannot have
schedules) and `free_cancel_hours integer NOT NULL DEFAULT 48` (CHECK 0–720).

**`golf_tee_time_schedules`** — `id`, `course_id` (FK cascade), `name`, `days_of_week smallint[]`
(0 = Sunday … 6, non-empty), `first_tee time`, `last_tee time` (≥ first), `interval_minutes`
(5–60), `spots` (1–4, default 4), `price_per_player numeric(10,2)` (≥ 0), timestamps. Different
prices for different times of day are separate schedules.

**`golf_tee_times`** — `id`, `course_id` (FK cascade), `schedule_id` (FK set null), `starts_at
timestamptz`, `spots`, `spots_left` (CHECK 0 ≤ spots_left ≤ spots), `price_per_player`,
`currency char(3)`, `status` (`open | closed`), `created_at`. `UNIQUE (course_id, starts_at)`, so
overlapping schedules cannot double a tee time; generation is `ON CONFLICT DO NOTHING`.

**`golf_bookings`** — `id`, `reference` (unique, `CG-XXXXXX` from `bookingReference`), `user_id`
(FK users), `course_id`, `tee_time_id` (both FK restrict), `players`, `lead_name`,
`contact_email`, `price_per_player`, `green_fee_total`, `service_fee`, `total`, `currency`,
`payment_intent_id` (unique), `status`, `hold_expires_at`, `requested_at`, `decide_by`,
`confirmed_at`, `closed_at`, `close_reason`, `refund_amount` (default 0), `free_cancel_until`,
timestamps. Indexes: `(status, decide_by)`, `(user_id, created_at DESC)`, the partial unique above.

Because bookings restrict deletes, deleting a course that has bookings fails; the module maps
the foreign-key violation to `CourseHasBookingsError` and the admin API answers 409.

**`email_logs`** — the `email_type` CHECK gains `golf_requested`, `golf_confirmed`,
`golf_declined`, `golf_cancelled`.

## Price

`green_fee_total = price_per_player × players`; `service_fee` from `golfServiceFee()` in
`src/lib/pricing.ts`, a twin of `hotelServiceFee` reading `GOLF_MARKUP_PERCENTAGE` /
`GOLF_MARKUP_FLAT_USD` (defaults: the hotel values). Charged in the course's currency. All three
figures are stored on the booking and shown as separate lines. The PaymentIntent carries
`bookingReference`, `brand`, `type: 'golf'`, `golfBookingId` and the price split in metadata
(ADR-0026), and its idempotency key is the booking id.

## Code

**Pure, client-safe (`src/lib/golf/`)**
- `time.ts` — `isValidTimeZone`, `zonedTimeToUtc(date, time, tz)`, `localDate(instant, tz)`,
  `addDays(date, n)`. Built on `Intl`; no new dependency.
- `schedule.ts` — `expandSchedule(schedule, tz, fromDate, days)` → UTC instants.
- `rules.ts` — the constants above, `decideBy`, `freeCancelUntil`, `cancellationFor(booking, now)`.
- `src/lib/schemas/golf.ts` — course schema gains `timezone`, `freeCancelHours`;
  new `teeTimeScheduleInputSchema`, `holdRequestSchema`; booking types.

**Server**
- `src/lib/server/golf/teeTimes.ts` — schedules list/create/delete, `generateTeeTimes`,
  `listAvailableTeeTimes(slug, date)`, `getBookableTeeTime(id)`, `courseHasSchedules(id)`.
- `src/lib/server/golf/bookings.ts` — `holdTeeTime`, `syncPayment`, `confirmBooking`,
  `declineBooking`, `cancelByCustomer`, `cancelByTeam`, `sweepGolfBookings`,
  `getBookingForUser`, `listBookingsForAdmin`.
- `src/lib/server/golf/emails.ts` — one pure builder per status plus a sender; `logEmail` is
  exported from `src/lib/server/email.ts` for it. Emails are English like the other booking emails.

**Routes**
- `GET /api/golf/courses/[slug]/tee-times?date=YYYY-MM-DD` — public, rate-limited.
- `POST /api/golf/bookings` — auth, CSRF, rate limit per user → `{ reference, clientSecret, … }`.
- `POST /api/golf/bookings/[reference]/cancel` — auth, CSRF; ownership checked in the module.
- `/api/admin/golf-schedules` (GET `?courseId=`, POST `create | delete`) and
  `/api/admin/golf-bookings` (GET `?status=`, POST `confirm | decline | cancel`) — same shape as
  `api/admin/golf-courses`.
- `GET /api/cron/golf-sweep` (every 5 min) and `GET /api/cron/golf-generate-tee-times` (daily),
  added to `docker/cron/crontab`, the run-cron allowlist and the admin crons list.
- Stripe webhook: `payment_intent.amount_capturable_updated` with `metadata.type === 'golf'`
  calls `syncPayment` before the Mystifly branch's early returns.

**Pages**
- `/golf/[slug]` — a **Book a tee time** panel (date, times with spots left and price, players)
  when the course has schedules; "Ask about tee times" stays below it.
- `/golf/[slug]/book?teeTime=&players=` — login required (`/login?next=`); summary, lead player
  name, then `StripeEmbeddedCheckout`. States that the card is only charged after the course
  confirms.
- `/golf/bookings/[reference]` — owner only; syncs a `held` booking with Stripe on load (covers
  redirect payment methods and a closed tab); status, details, price lines, cancel when allowed.
- Admin: a **Tee times** dialog per course (schedules list, add, delete) and
  `/admin/golf/bookings` (waiting, upcoming, closed) with Confirm / Decline / Cancel and refund.
  Sidebar entry "Golf Bookings". Course form gains time zone and free-cancellation hours.

## Localization

New keys under `golf.booking.*` in en, ja, ko, zh; locale parity test stays green. Admin English.

## Error handling

- Stripe failure while starting a hold: the hold is released in the same request and the
  customer sees "We couldn't start the payment. Please try again."
- Not enough spots: 409 `not_enough_spots` with the count left.
- Tee time gone, closed, too soon or past the horizon: 409 `tee_time_unavailable`.
- Capture failure on confirm: the booking stays `requested`; admin sees the Stripe message.
- Webhook and status page both call `syncPayment`; it is idempotent (`WHERE status = 'held'`).

## Testing

- Unit: `time.ts` (incl. a DST zone, `America/New_York`), `expandSchedule`, `rules.ts`,
  `golfServiceFee`, schemas, email builders.
- Route tests with mocks: tee-times, bookings, cancel, admin schedules/bookings, cron auth.
- Integration (real DB, skips when unreachable like `courses.integration.test.ts`, Stripe
  mocked): two holds race for the last spot and exactly one wins; one live hold per customer and
  tee time; sweep expires holds and declines overdue requests; each status transition moves
  spots and money as the table says.
- Manual: book a tee time end to end with a Stripe test card; confirm and decline from admin.

## Docs

CONTEXT.md: the **Golf Course** entry no longer says "nothing is held"; new **Tee Time** and
**Golf Booking** entries describe the request-then-confirm model.
