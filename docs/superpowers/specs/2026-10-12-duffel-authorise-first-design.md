# Duffel flights: authorise the card, then buy the ticket — design

**Date:** 2026-10-12
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
- **A switch, default off.** `DUFFEL_MANUAL_CAPTURE` is read once, when `/book` creates the intent,
  and the result is stamped on the intent as `captureFlow: authorise_first | order_first`. Everything
  after that routes by the stamp, never by the current flag, so flipping the flag cannot strand a
  payment already in flight.
- **Small rises are absorbed, big ones are asked about.** A fare that rises by no more than the
  existing tolerance (`getFlightPriceTolerance()`: $0.50 live, $10.00 sandbox) between the hold and
  the order is paid from our margin; the customer is charged what they saw. Above it, the hold is
  released and the new price is shown for them to accept. A fare that falls is passed on: we capture
  the lower amount.

## Flow (flag on)

1. `/book` (web and mobile) validates and revalidates as today, then creates the session and an
   intent for amount **A**, `capture_method: 'manual'`, metadata `captureFlow: authorise_first`.
   **No order is placed.** It returns `clientSecret`, `sessionId`, `paymentIntentId` as before.
2. The client confirms the intent. A declined card fails here; nothing has been bought.
3. Stripe sends `payment_intent.amount_capturable_updated`. The webhook runs
   `finaliseDuffelAuthorised({ sessionId, paymentIntentId })`:
   1. claim the session (below), so only one path places the order;
   2. `placeDuffelOrder(...)` — the machinery extracted from `/book`: offer refresh, Price Action,
      price-change retries, timeout recovery;
   3. **refused** → `paymentIntents.cancel`, session `failed`, customer told they were not charged;
   4. **placed** → write the order onto the session exactly as `/book` does today
      (`duffel_pre_order_*`, corrected `flight`) and set `original_price` to the order's actual total,
      so reporting shows what Duffel charged us rather than the quote; then `paymentIntents.capture`
      (`amount_to_capture` = min(A, recomputed amount));
   5. call `createBooking` unchanged: its Duffel handler already reads the order from the session.
      The webhook then tickets, emails and writes the ledger as it does for Duffel today.
4. `/confirm` is the fallback for the same function. For `authorise_first` intents it accepts
   `requires_capture` (or `succeeded` if the webhook already captured) and calls
   `finaliseDuffelAuthorised`. The claim makes the two paths place one order.

## The charge amount

Today the customer is charged from the **order's locked total**. Before an order exists, that
number must come from somewhere the client cannot understate:

- **A** = `computeOrderTotal(rawOffer, seatServiceIds, bagServiceIds)` (server-derived from the
  offer's `available_services`, never the client's seat/bag totals) → markup → FX, using the
  same functions as now. The pricing audit columns (`currency`, `original_price`, `charged_price`,
  `markup_pct`, `payment_currency`) are written at intent creation instead of after the order.
- At order time the Price Action total gives **A′** by the same markup and FX.
  - `A′ ≤ A`: capture A′.
  - `A′ > A` and the base fare rose by no more than the tolerance: place the order, capture A.
  - rise above the tolerance and not already confirmed by the traveller: cancel the intent and
    return `price_changed` with the new price, reusing the 409 flow the client already has.

## Claiming the session

`createBooking` locks `status IN ('pending','initiated','payment_initiated','payment_authorized')`
and sets `processing`. Finalisation needs its own claim before placing an order, then hands over:

- atomic `UPDATE … SET status = 'ordering' WHERE status IN ('initiated','payment_initiated','payment_authorized')`;
- immediately write `duffel_pre_order_id` once the order exists — the "stake a claim" write `/book`
  makes at 1453, so the existing orphan sweep, which selects on that column, can always find it;
- set the status back to `payment_authorized` with the order columns, so `createBooking`'s lock works.

Anything that lists statuses (auto-recover, admin views, the orphan sweep) is audited for
`ordering` in the plan.

## What changes where

| Unit | Change |
|---|---|
| `src/lib/server/flights/duffel-order.ts` (new) | `placeDuffelOrder`: extracted from `/book` ~900–1450; used by both paths |
| `src/lib/server/flights/finalise-authorised.ts` (new) | `finaliseDuffelAuthorised`, claim, capture or cancel |
| `api/flights/book`, `api/mobile/flights/book` | flag-gated: no order, manual capture, stamp, persist `confirmed_price` and `capture_flow` |
| `api/webhooks/stripe` | new Duffel branch on `amount_capturable_updated`; `payment_intent.succeeded` ignores `authorise_first` intents so the legacy handler's auto-refund can never touch a good booking |
| `api/flights/confirm` | accept `requires_capture` for `authorise_first`, call finalise |
| auto-recover job | cancel `authorise_first` intents still `requires_capture` with no order after ~15 minutes |
| migration | `booking_sessions.capture_flow text`, `booking_sessions.confirmed_price numeric`, both nullable |

The legacy `order_first` path stays as written until the flag has run clean; removing it (and
pre-order reuse) is a later change.

## Failure handling

| Case | Result |
|---|---|
| Card declined | stops at the client; nothing bought |
| Offer expired or unavailable at order time | cancel intent; "this fare is no longer available, you were not charged" |
| Fare rose above tolerance | cancel intent; `price_changed` with the new price |
| Order placed, capture fails | rare (already authorised). Cancel the Duffel order, notify the team, mark failed. Cancelling an instant order may not recover the fare (fare rules decide), which is why it alerts rather than assumes |
| Webhook and `/confirm` both fire | one order: the claim fails for the second |
| Both miss | auto-recover releases the hold; no order exists to undo |
| Process dies after the order, before capture | claim write means the orphan sweep finds the order |

Each refusal is logged with a distinct reason (`offer_unavailable`, `price_rise`,
`capture_failed_after_order`, `declined_at_client`) so the effect on conversion can be measured.

## Testing

Unit, with Duffel and Stripe mocked:
- `placeDuffelOrder`: success, `offer_no_longer_available`, `price_changed` inside and outside the
  tolerance, timeout recovery finding an order, timeout with none.
- `finaliseDuffelAuthorised`: success captures once; refusal cancels and never captures; capture
  failure cancels the order; a second concurrent call places no second order; `A′ < A` captures A′.
- Webhook routing: `authorise_first` goes to finalise and `succeeded` is ignored for it; an
  `order_first` intent still takes the legacy path unchanged.
- `/book`: flag off is byte-for-byte today's response; flag on places no order and returns a manual
  intent.

## Rollout

Deploy with the flag off; enable in sandbox; enable in live and watch the refusal reasons. Turning
it off sends new bookings back to the old path at once; intents already authorised finish by their
stamp.

## Out of scope

- Hold orders; `api/booking/create-payment` (a different product).
- Removing the legacy path or pre-order reuse.
- Statement wording: customers see a pending hold, then a capture. Support should know.
- Card authorisations last about seven days, so no new expiry risk.
