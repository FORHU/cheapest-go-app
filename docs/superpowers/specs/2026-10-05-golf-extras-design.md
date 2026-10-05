# Golf extras — design

**Date:** 2026-10-05
**Branch:** `feat/golf-courses`
**Status:** approved in conversation
**Builds on:** `2026-10-05-golf-tee-time-booking-design.md`, `2026-10-05-golf-publish-requires-tee-times-design.md`

## Goal

A customer booking a tee time can add club rental, a caddie or a golf cart, at prices the course
sets in admin. The team arranges them with the course when it confirms the booking.

## Decisions

- **Three extras, a closed list:** `club_rental` (per set), `caddie` (per caddie), `cart` (per
  cart). The codes are the amenity codes of the same names, so their storefront names come from
  the existing `golf.amenities.*` labels in all four languages.
- **Per item.** The customer picks a quantity from 0 to the number of players for each extra the
  course offers.
- **The course sets prices** in its own currency, per extra it offers. Not offered = no row.
- **Prices lock at the hold,** like the tee-time price. Changing extras after a hold starts a new
  hold (the old one is released), so the card is authorised for the right amount.
- **Service fee** is charged on green fee + extras. Total = green fee + extras + service fee.
- **Out of scope:** mandatory fees (a course's compulsory caddie belongs in the tee-time price),
  stock limits (the team confirms everything with the course before charging), extras without a
  tee time.

## Data — migration `20261005000002_golf_extras.sql`

- `golf_course_extras` — `course_id` (FK cascade), `code` (CHECK in the three), `price
  numeric(10,2)` (≥ 0), timestamps. Primary key `(course_id, code)`.
- `golf_booking_extras` — `booking_id` (FK cascade), `code`, `quantity` (1–4), `unit_price`,
  `total`. Primary key `(booking_id, code)`. Written in the hold's transaction.
- `golf_bookings.extras_total numeric(10,2) NOT NULL DEFAULT 0`.

## Code

- `src/lib/golf/extras.ts` (pure, client-safe) — `GOLF_EXTRAS`; `parseExtrasParam` /
  `formatExtrasParam` for the checkout URL (`extras=club_rental:2,cart:1`); `sanitizeExtras`
  (drops extras not offered, caps at players, drops zeros); `priceExtras` (lines + total, or the
  reason it is refused).
- `src/lib/schemas/golf.ts` — `holdRequestSchema.extras` (default `[]`, unique codes);
  `golfExtrasInputSchema` for admin; `GolfBooking.extras` and `extrasTotal`.
- `src/lib/server/golf/extras.ts` — `listCourseExtras`, `setCourseExtras` (replaces the set).
- `src/lib/server/golf/bookings.ts` — `holdTeeTime` prices extras against the course's current
  offer (refused with `extras_unavailable`, 409), resumes a live hold only when players *and*
  extras match, stores the lines and `extras_total`, adds `extrasTotal` to the PaymentIntent
  metadata. Every booking read carries its extras.
- Emails, the status page and the admin bookings queue show one line per extra.

## Customer flow

The checkout page reads `extras` from its URL, keeps only valid choices (`sanitizeExtras`),
and renders an **Extras** section when the course offers any: each extra with its price per item
and a 0–N picker. Changing a quantity replaces the URL; the server re-renders every total, so the
total shown is always the total the hold charges. Once payment has started the pickers are
locked. If the hold answers `extras_unavailable`, checkout says so and reloads.

## Admin

- `api/admin/golf-extras` — `GET ?courseId=`, `POST { courseId, extras: [{ code, price }] }`.
- The Tee times window gets an **Extras** section (`CourseExtras.tsx`): one row per extra with an
  "Offer" tick box and a price, and **Save extras**.
- The bookings queue lists each booking's extras under its players.

## Copy

`golf.booking`: `extrasHeading`, `extrasHint`, `extraEach`, `extraLine`, `extrasUnavailable`,
in en, ja, ko, zh. Extra names reuse `golf.amenities.*`. Emails and admin stay English.

## Demo courses (local data)

All four demo courses offer club rental US$45, caddie US$30 and cart US$25 (placeholders,
editable in admin).

## Testing

- Unit: `extras.ts` (parse, format, sanitize, price); schemas; emails with extra lines.
- Integration (real DB): `setCourseExtras` replaces the set; a hold stores extra lines at the
  offered price and charges the fee on green fee + extras; changing extras replaces the hold; an
  extra the course does not offer is refused.
- Routes: `api/admin/golf-extras`; the hold route passes extras through.
- UI: checkout picker updates the URL and sends extras with the hold; admin extras save.
- Live: a booking with extras on a demo course, against Stripe test mode.
