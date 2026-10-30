# Flight orders are placed after the card is authorised

When `FLIGHT_PAY_FIRST=on`, `/api/flights/book` no longer calls Duffel's `POST /air/orders`. It prices the trip from the server's live fare (revalidation's Price Action, never the browser's offer total), get-or-creates exactly one `booking_sessions` row per exact attempt (`quote_hash`, enforced by a partial unique index), and creates a PaymentIntent with `capture_method: manual`. When Stripe reports the card authorised, `createBooking` — the one locked path shared by the webhook and `/api/flights/confirm` — places the Duffel order, records it on the session, then captures. If the order cannot be placed, the hold is released, the reason is kept on a failed `flight_bookings` row, and the traveller is emailed that their card was not charged.

This supersedes [ADR-0009](0009-airline-order-placed-before-payment.md) for the web flow. That ADR rejected "authorize first, order on capture" because the authorised amount is a guess at what the order will cost. The guess is now bounded and the failure mode is the benign one: a hold can be captured for less than it was authorised for, a rise within `getFlightPriceTolerance()` is absorbed, and a larger rise releases the hold so the traveller sees the new price before paying it. The failure ADR-0009 warned about — money held against no ticket — resolves itself, because a released authorisation is never a charge.

What ADR-0009 optimised for, a quote that cannot drift, is given up in exchange for removing its cost: a real, paid ticket bought on every form submit. Navigating back during the up-to-130-second order call left the first request running with its idempotency key lost; the next submit bought a second ticket, and every abandoned checkout drained the Duffel balance until a sweep — itself failing — cancelled it.

## Considered Options

- **Authorise, order, capture (chosen)** — nothing is bought before the card is held. Duplicate submits collapse onto one session and one PaymentIntent at the database.
- **Charge immediately, refund on failure** — rejected. Every failure becomes a charge followed by a refund that can take days to appear.
- **Keep ordering first and harden the dedupe (advisory lock / persisted client key)** — rejected as the primary fix. It narrows the race but keeps the underlying cost: unpaid tickets exist whenever a checkout is abandoned.

## Consequences

- **The amount is the server's.** Moving payment first made the quote the authority, so it can no longer come from the request body: the fare and its currency come from Duffel's Price Action, extras from Duffel's own service prices, and the stored offer is overwritten with them. A request whose fare cannot be confirmed is refused (`FARE_UNCONFIRMED`) rather than priced from the browser.
- **One paying attempt per traveller per offer.** `/book` refuses a new attempt while another is paid or paying, and the database enforces it where `/book` cannot (list-then-create is not atomic): `booking_sessions_one_paid_attempt_per_offer` makes the second attempt's lock fail with 23505, and `createBooking` releases that hold. A hold is only ever released by `/book` for a session it retired itself and that a fresh read still shows awaiting a card; a late authorisation on a retired attempt is released by the webhook.
- The order call now happens after the traveller has paid and can take up to 130 s. The post-payment screen polls for 150 s and tells the traveller to expect an email instead of waiting.
- A failure after authorisation must be communicated, not just recorded: the `booking_not_completed` email exists for this, attached to the failed `flight_bookings` row (the reason is kept in its `cancellation_log`). Building it exposed that `markFailed` had never written its failed row — three NOT NULL columns were missing and the error was swallowed — which is fixed for every flow.
- **Residual risk, unchanged from before:** if the database write that records the booking fails after capture, a paid order can exist without a booking row. The order id is staked on the session first so the sweep and `auto-recover` can find it.
- The `cleanup-orphaned-duffel-orders` sweep remains the safety net for a crash between placing the order and capturing. It must be working before the flag is turned on in production.
- The web route's inline order code (ADR-0009's flow) stays until the flag is retired; the mobile route is unchanged and keeps the old flow and its duplicate-order exposure.
- Sessions in flight at deploy time already hold an order and use automatic capture; they finish through the existing `payment_intent.succeeded` path.
