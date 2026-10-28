# Pay-first flight booking (web)

Date: 2026-10-28
Status: design approved in conversation, awaiting written-spec review
Supersedes for web: [ADR-0009](../../adr/0009-airline-order-placed-before-payment.md)

## Problem

`/api/flights/book` buys the Duffel order (a real, paid airline ticket) when the traveller submits the form, then creates the Stripe PaymentIntent. Two consequences:

1. **Duplicate orders.** The request holds the order call open for up to 130 s. If the traveller navigates back during that window, the hook unmounts and the idempotency key (`useRef`, `useFlightBooking.ts:180`) is lost. Resubmitting mints a new key and a new `booking_sessions` row. The only cross-submit guard, `findLivePreOrderForOffer`, matches on `duffel_pre_order_id`, which is saved only after Duffel answers, so the second request finds nothing and buys a second order. `booking_sessions.idempotency_key` is write-only; nothing reads it.
2. **Tickets bought without payment.** Every abandoned checkout leaves an unpaid order against our Duffel balance until the orphan sweep cancels it. The sweep (`cleanup-orphaned-duffel-orders`) currently fails on every run (curl exit 22), and seven unpaid sessions holding Duffel orders in the local DB are 29 days old or more and still `payment_initiated`.

## Goal

The airline order is placed, and the booking confirmed, only after Stripe has authorised the card. Nothing is bought before the traveller pays.

## Decisions

| Question | Decision |
|---|---|
| Money model | Authorise, then order, then capture (`capture_method: manual`). A failed order releases the hold; the customer is never charged. Same pattern the Mystifly path already uses. |
| Scope | Web only. `/api/mobile/flights/book` keeps pre-buying; the webhook tells the two apart by whether the session already holds an order. |
| Where the order is placed | Server-side after authorisation: Stripe webhook primary, `/api/flights/confirm` as fallback. Both go through `createBooking`'s existing session lock. |
| Waiting-state copy | "Thanks, we're confirming your booking" / "We'll email your confirmation to {email}. You don't need to wait on this page." Does not say "payment received" because the card is only held. |
| Failure notice | New email when the booking cannot be completed and the hold is released. |

## Design

### `/api/flights/book` (web, Duffel)

Kept: auth, rate limit, passenger/contact validation, passenger-type check, FX guard, same-day duplicate warning (ADR-0011), `revalidateFlight` and its price gate, session insert, `withDuffelServicePrices` (the charge depends on seat and bag prices).

Removed: `findLivePreOrderForOffer` use, the Duffel `POST /air/orders` call and its refresh pool, claim-staking, the orphan-cancel catch.

Added: a PaymentIntent with `capture_method: 'manual'` for the marked-up quote. Its Stripe idempotency key is derived from user, Duffel offer id, and a hash of passengers, services and charge currency, not from the session id. A repeat submit with unchanged details returns the same PaymentIntent; changed details cancel the superseded unpaid PaymentIntent and create a new one. The request now takes milliseconds, which removes the race window.

The session stores the quote (`original_price`, `charged_price`, `currency`, `payment_currency`) and `payment_intent_id`, status `payment_initiated`. The raw offer and service ids are already on the session.

### After authorisation

Stripe event `payment_intent.amount_capturable_updated`. The webhook currently ignores every provider except Mystifly there; add a Duffel branch that applies only when the session has no `duffel_pre_order_id`. It sets `payment_authorized` and calls `createBooking`.

`createBooking`'s Duffel handler (`create-booking.ts`) gains one step at the top: when the session has no pre-order, place the order with `placeDuffelOrder` (the helper the mobile route already uses; the web route's ~600-line inline copy is deleted), save the order id on the session immediately, write the `duffel_pre_order_*` columns, then continue as today. The placement runs under the same lock as the booking insert, so the webhook and `/confirm` cannot both place an order.

- Order placed: capture the PaymentIntent, insert rows, ticket, send confirmation email.
- Order fails: cancel the PaymentIntent (releases the hold), mark the session `failed`, send the failure email.

### Price drift after authorisation

| Duffel total vs quote | Outcome |
|---|---|
| At or below | Capture the recomputed lower charge (`amount_to_capture` may be less than the hold). |
| Higher, within `getFlightPriceTolerance()` | Absorb the difference; capture the quoted amount. |
| Higher beyond tolerance, or no matching offer left | Release the hold; session `failed` with `price_changed` or `flight_unavailable`. Retry creates a fresh session with fresh revalidation. |
| Seats/bags on a replaced offer | Release the hold; ask the traveller to re-select (existing behaviour). |

### Failure windows

- Order placed, capture then fails: cancel the Duffel order (ADR-0013 handling). An instantly ticketed order cannot be voided and becomes a refund from Duffel.
- Process dies mid-way: the order id is saved right after placement. An uncaptured hold lapses on its own (about seven days), so the traveller is not charged for an unrecorded ticket. `auto-recover` and the orphan sweep are the safety net.
- **Dependency:** the orphan sweep must be fixed as part of this change. It is the net for the case above and is currently failing.

### Client

- `/api/flights/confirm` accepts `requires_capture` for Duffel (today only `succeeded`; otherwise 402).
- `pollForBooking` window grows from 45 s to about 150 s (the 130 s order timeout plus capture). `/api/flights/booking-status` also returns the session status so the UI can tell "still working" from "failed".
- Waiting-state strings added to `en`, `zh`, `ko`, `ja` under `flightBook`.
- Refresh-recovery keys unchanged: a reload mid-wait resumes the poll.

### Emails

- Success: existing confirmation and awaiting-ticket emails, unchanged.
- Failure: new email, "We couldn't complete your booking. Your card was not charged." States the reason (price changed or flight unavailable) and links to search. Sent from the code path that releases the hold, through the existing retry-emails queue.

## Rollout

- No new session status, so no schema migration.
- Feature flag `FLIGHT_PAY_FIRST` switches the web route between the old and new flow, so rollback needs no redeploy.
- Sessions in flight at deploy time already hold an order and use automatic capture; they finish through the existing `payment_intent.succeeded` path.
- New ADR marking ADR-0009 superseded for web.
- Recommended follow-up migration: unique indexes on `flight_bookings(session_id)` and `(duffel_order_id)`. Local data has no violations; check production before applying.

## Testing

- Unit: price-drift outcome table, PaymentIntent idempotency-key derivation, webhook routing (Duffel with and without a pre-order), `/confirm` accepting `requires_capture`.
- Integration (mocked Stripe and Duffel): authorise, order, capture; order fails and the hold is released; capture fails and the order is cancelled; webhook and `/confirm` racing yields exactly one order; failure email sent on release.
- Regression for the original bug: two `/book` calls for the same offer with different client idempotency keys return the same PaymentIntent.
- Update existing tests: `stripe-book-variant`, `payment-recovery`, and the `preorder-reuse` usage in the web route.
- Manual: full flow against Duffel sandbox and Stripe test mode before merge, including clicking back during submit.

## Out of scope

- The mobile booking route (keeps pre-buying and its duplicate-order risk).
- Hotels and the other Stripe flows.
- Replacing the same-day duplicate warning.
