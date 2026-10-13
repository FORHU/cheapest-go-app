# Duffel flights: authorise the card, then buy the ticket — design

**Date:** 2026-10-12 (revised the same day after reading the code, see the last section)
**Branch:** `landing-sections`
**Status:** approved in conversation; written here for review

## Problem

`/api/flights/book` buys the Duffel order first and asks the card afterwards:

| Step | Where | What |
|---|---|---|
| 1 | `book/route.ts` 916–919 | order body: `type: 'instant'`, `payments: [{ type: 'balance' }]` |
| 2 | `book/route.ts` 970 | `POST /air/orders` — the seat is bought from our Duffel balance |
| 3 | `book/route.ts` 1563–1568 | `paymentIntents.create({ capture_method: 'automatic' })` |

A declined card therefore always arrives after we have spent our own money, and we then have to
cancel the order and hope the supplier lets us. The mobile route does the same
(`mobile/flights/book/route.ts` 387). `payment_requirements` is not read anywhere.

## Decisions

- **Authorise, buy, capture.** The intent is created with `capture_method: 'manual'`. The order is
  placed only once the card is authorised (`requires_capture`). Success captures; refusal cancels
  the intent, which releases the hold and moves no money. Mystifly already works this way.
- **Not Duffel hold orders.** Measured on test credentials only 15–78% of offers allow them
  (MNL→ICN 49%, CRK→LHR 15%, MNL→SIN 78%): a second booking flow for half the traffic, with
  deadlines, and `instant` would still need these safeguards. Re-measure on live credentials if
  this is revisited.
- **A switch, default off.** `DUFFEL_MANUAL_CAPTURE=on` is read once, when `/book` creates the
  intent, and the result is stamped on the intent as `captureFlow: authorise_first | order_first`.
  Everything after that routes by the stamp, never by the current flag, so flipping the flag cannot
  strand a payment already in flight.
- **Small rises are absorbed, big ones are asked about.** A fare that rises by no more than the
  existing tolerance (`getFlightPriceTolerance()`: $0.50 live, $10.00 sandbox) between the hold and
  the order is paid from our margin; the customer is charged what they saw. Above it, the hold is
  released and the new price is shown for them to accept. A fare that falls is passed on: we capture
  the lower amount.
- **The legacy path is not touched.** The order-first code in `/book` stays exactly as written
  until the flag has run clean and the path is deleted. The new path places orders with the
  existing `place-duffel-order.ts`, which is made equivalent to `/book`'s inline logic first.
- **Web first.** The mobile route has its own client; it stays order-first until that client is
  checked against `requires_capture`.

## Flow (flag on)

1. `/book` validates and revalidates as today, validates the phone (the order will not be placed
   until later, so a bad number must stop here), creates the session and an intent for amount **A**,
   `capture_method: 'manual'`, metadata `captureFlow: authorise_first`. **No order is placed.** It
   returns `clientSecret`, `sessionId`, `paymentIntentId` as before.
2. The client confirms the intent. A declined card fails here; nothing has been bought. The
   embedded checkout already treats `requires_capture` as success and starts polling.
3. Stripe sends `payment_intent.amount_capturable_updated`. The webhook runs
   `finaliseDuffelAuthorised({ sessionId, paymentIntentId })`:
   1. claim the session (below), so only one path places the order;
   2. refuse a duplicate: the same traveller already holds an order for this offer and these
      passengers from another session (two tabs, two authorisations);
   3. `placeDuffelOrder(...)`: Price Action, price-change retries, timeout recovery, same-itinerary
      refresh;
   4. **refused** → record why on the session (`failure`), cancel the intent (releases the hold, no
      refund), mark the booking failed so the existing polling sees it;
   5. **placed** → stake the order id on the session at once, write the order onto it exactly as
      `/book` does today (`duffel_pre_order_*`, corrected `flight`, `original_price` = what Duffel
      charged us), then `paymentIntents.capture` with `amount_to_capture` = min(A, recomputed);
   6. call `createBooking` unchanged: its Duffel handler already reads the order from the session.
      The caller then tickets, emails and writes the ledger as it does for Duffel today.
4. `/confirm` is the fallback for the same function. For `authorise_first` intents it accepts
   `requires_capture` (or `succeeded` if the webhook already captured). The claim makes the two
   paths place one order.

## The charge amount

Today the customer is charged from the **order's locked total**. Before an order exists, that
number must come from somewhere the client cannot understate:

- **A** = `computeOrderTotal(rawOffer, seatServiceIds, bagServiceIds)` (server-derived from the
  offer's `available_services`, never the client's seat/bag totals) → markup → FX, using the
  same functions as now. The pricing audit columns are written at intent creation.
- At order time the actual order total gives **A′** by the same markup and FX.
  - `A′ ≤ A`: capture A′.
  - `A′ > A`: only possible when the base fare rose by no more than the tolerance (or the
    traveller had already confirmed a higher price): place the order, capture A.
  - rise above the tolerance and not already confirmed: refuse with `price_changed` and the new
    price.

## Claiming the session

`createBooking` locks `status IN ('pending','initiated','payment_initiated','payment_authorized')`
and sets `processing`. Finalisation needs its own claim before placing an order, then hands over:

- atomic update to a new status `ordering` (the `booking_sessions_status_check` constraint is
  widened by the migration) from `initiated`, `payment_initiated` or `payment_authorized`;
- a claim older than 8 minutes may be taken over (an order attempt can legitimately run 130s plus
  one 130s retry); the new claimer first looks for an order the old one placed, using the existing
  timeout reconciliation, and resumes from a staked order id if there is one;
- the order id is written the moment the order exists, so the orphan sweep, which selects on that
  column, can always find it;
- on handing over, the status returns to `payment_authorized` with the order columns, so
  `createBooking`'s lock works.

## How the traveller learns the outcome

The checkout already races two things after the card step: `/api/flights/booking-status` polling
and `/api/flights/confirm`. Both only know "failed" today and answer `booking_failed_refunded`
("your payment has been refunded"), which is wrong for a released hold.

- A new `booking_sessions.failure` column holds `{ errorCode, priceChange? }`. Both endpoints read
  it when the booking row is `failed` and answer the stored code; sessions without it keep the
  legacy answer.
- Codes reuse existing copy, all of which already says the card was not charged:
  `flight_unavailable`, `seats_unavailable`, `supplier_outage`, `balance_insufficient`,
  `phone_number_invalid`, `duplicate_booking`, `booking_failed`. No new strings.
- `price_changed` carries `priceChange`; the client returns to the form with the existing
  price-change prompt (`confirmPriceChange`), which resubmits with the new price confirmed.

## Recovery

- **Webhook and `/confirm` both missed.** The existing auto-recover job expires sessions whose
  Duffel intent is not `succeeded`, which would leave a live hold on the card. For
  `authorise_first` intents it instead runs finalisation again; the claim and the resume logic make
  that safe. A session whose card has not been authorised yet is left alone for its 30-minute life
  (plus a margin), because auto-recover looks at sessions older than five minutes and a 3DS
  challenge can be inside that. After it, the intent is cancelled so a late payment cannot leave a
  hold. A hold still unfinalised after 2 hours is cancelled and the session expired, and an order
  that was staked but never captured is cancelled with it.
- **Orphan cleanup** is unchanged, and cannot race finalisation: it only selects sessions in
  `payment_initiated` or `initiated`, and a claimed session is `ordering`, then
  `payment_authorized`.

## What changes where

| Unit | Change |
|---|---|
| `db/migrations/…_flights_authorise_first.sql` | `booking_sessions.confirmed_price`, `failure`; status check gains `ordering` |
| `flights/capture-flow.ts` (new) | read the flag once; read the stamp |
| `flights/duffel-order-total.ts`, `duffel-order-passengers.ts`, `duffel-order-errors.ts`, `flight-charge.ts` (new) | pure pieces the order path needs |
| `flights/place-duffel-order.ts` (exists, unused) | made equivalent to `/book`'s inline logic, then used |
| `flights/finalise-authorised.ts` (new) | claim, refuse or order, capture, record |
| `flights/post-booking.ts` (new) | ticketing, email, ledger moved out of the webhook file so more than one caller can use them |
| `api/flights/book` | flag-gated edits only: no order, manual capture, stamp, persist `confirmed_price` |
| `api/webhooks/stripe` | Duffel branch on `amount_capturable_updated`; `succeeded` ignores `authorise_first` |
| `api/flights/confirm`, `booking-status` | accept `requires_capture`; answer stored failures |
| `api/internal/auto-recover` | finalise or release `authorise_first` holds |
| `hooks/flights/useFlightBooking.ts` | price change after authorisation returns to the form |

## Failure handling

| Case | Result |
|---|---|
| Card declined | stops at the client; nothing bought |
| Offer expired or unavailable at order time | refuse `flight_unavailable`; hold released |
| Same flights no longer sold, or seats and bags cannot carry over | refuse `flight_unavailable`; hold released |
| Fare rose above tolerance | refuse `price_changed` with the new price; hold released |
| Duplicate authorisation for the same offer and passengers | refuse `duplicate_booking`; hold released |
| Order placed, capture fails | rare (already authorised). Cancel the Duffel order, notify the team, refuse `booking_failed`. Cancelling an instant order may not recover the fare (fare rules decide), which is why it alerts rather than assumes |
| Captured, then recording the booking fails | never refunded here: the order and the money both exist; the team is notified and auto-recover records it |
| Webhook and `/confirm` both fire | one order: the claim fails for the second |
| Both miss | auto-recover finalises, or releases after 2 hours |
| Process dies after the order, before capture | the staked id lets the next claimer resume, or the orphan sweep find it |

Each refusal is logged with a distinct code so the effect on conversion can be measured.

## Testing

Unit, with Duffel, Stripe and the database mocked:
- `place-duffel-order`: raw order adopted after a timeout; only same-itinerary offers are
  re-quoted; price changes are reported in bare fares; a price change still unresolved after the
  retries is reported.
- `finaliseDuffelAuthorised`: success captures once, after the order id is staked; each refusal
  cancels and never captures; capture failure cancels the order; a second claim places nothing; a
  duplicate is refused; A′ < A captures A′; an existing order is resumed rather than rebought; an
  unexpected error hands the claim back.
- Failure responses, recovery decisions, price-change parsing, charge arithmetic, flag reading.

Manual, in the Duffel sandbox with Stripe test cards (declined, authorised, 3DS), flag off then on.

## Rollout

Deploy with the flag off; enable in sandbox; enable in live and watch the refusal codes. Turning it
off sends new bookings back to the old path at once; intents already authorised finish by their
stamp.

## Out of scope

- Hold orders; the mobile routes; `api/booking/create-payment` (a different product).
- Deleting the legacy path and pre-order reuse.
- Statement wording: customers see a pending hold, then a capture. Support should know.
- Card authorisations last about seven days, so no new expiry risk.

## Revision notes

First draft proposed extracting the order code from `/book` into a new module. Reading the code
changed that:

- `place-duffel-order.ts` already exists. It was extracted for the mobile route, which imports it
  but never calls it. It has drifted from `/book`: a carrier-and-nearest-price refresh pool where
  `/book` requires the same itinerary, price changes reported with ancillaries mixed in, and a
  timeout-recovery branch that reads fields a raw Duffel order does not have. The new path uses it
  after these are fixed; `/book` keeps its inline copy untouched until the legacy flow is deleted.
- `booking_sessions.status` is constrained, so the `ordering` claim needs a migration.
- Recovery finalises held intents instead of cancelling them at 15 minutes.
- The first draft did not say how a refusal reaches the traveller, nor guard two authorisations of
  the same trip. Both are added.
- The mobile routes are deferred, and no `capture_flow` column is needed: the intent's metadata
  carries the stamp and the session's existing `capture_method` records it.

## Acceptance

**Automated, 2026-10-13, on `landing-sections`:** `tsc --noEmit` clean; eslint clean over every
touched area; the full vitest suite 1828 passed, 87 skipped, 0 failed. The claim is exercised
against the real local database (`finalise-authorised.integration.test.ts`: taken once, not taken
over while recent, taken over when stale, not claimed once booked or failed, released).

**Sandbox, not yet run:** a declined card buys nothing; an authorised card is ordered, captured
and recorded exactly once; 3DS; an expired offer releases the hold and says the card was not
charged; two tabs paying the same trip produce one ticket; a missed webhook is recovered by
auto-recover; flag off behaves as before. Listed with expected results in the plan, Task 17
steps 3–10.
