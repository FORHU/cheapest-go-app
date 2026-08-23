# The airline order is placed before the customer pays

`/api/flights/book` calls Duffel's `POST /air/orders` and only then creates the Stripe PaymentIntent, deriving the charge amount from the order Duffel actually returned. The customer enters their card against a seat that already exists. We chose this because Duffel offers are quotes with a 20–30 minute expiry and no price guarantee: ordering after capture means charging a number the airline may no longer honour, then either eating the difference or asking a customer who has already paid to accept a new price. Ordering first makes the amount charged the amount owed, by construction.

The cost is that the failure mode inverts. The usual risk in a booking system is money taken without a ticket; here it is a ticket held — sometimes issued — without money taken.

## Considered Options

- **Order first, then charge (chosen)** — the Stripe amount is read from the real order (`stripeBase = duffelPreOrder.orderTotal`), so a price change between search and checkout is impossible by construction rather than by tolerance. Accepts orphan risk when payment never completes, and requires the compensating controls below.
- **Authorize first, order on capture** — rejected. It is the textbook shape and eliminates orphaned inventory entirely, but it reintroduces exactly the problem this route exists to avoid: the authorized amount is a guess at what the order will cost, and any drift has to be resolved after the customer has already committed. It also does not remove the failure, it moves it — an order that fails after a successful authorization leaves money held against no ticket, which is worse for the customer than an unpaid seat is for us.
- **Hold the offer without ordering** — rejected. Duffel has no hold primitive separate from order creation for the fares we sell; `POST /air/orders` *is* the hold, and for instant-ticketing carriers it is also the ticket.

## Consequences

- **For instant-ticketing fares the ticket is issued before payment.** `duffel_pre_order_ticketed` records this, and such an order cannot simply be cancelled — it is a refund, not a void.
- Three controls reclaim unpaid orders, and they are not redundant — each covers a case the others cannot:
  1. **Inline cancel** when the post-order session UPDATE fails (`book/route.ts`), cancelling the Duffel order before the Stripe PaymentIntent.
  2. **`cleanup-orphaned-duffel-orders` cron**, sweeping sessions older than 35 minutes that are still `initiated`/`payment_initiated`, in batches of 20.
  3. **`findOrderFromTimedOutAttempt`**, which asks Duffel whether an order exists after a request aborts at `ORDER_CREATE_TIMEOUT_MS` (130 s, Duffel's documented floor). Aborting the HTTP request does not cancel the order at Duffel, so without this a timeout orphans a real PNR.
- **The sweep is blind to an order whose session row was never written.** It selects on `duffel_pre_order_id IS NOT NULL AND payment_intent_id IS NOT NULL`, and both columns are populated by the single UPDATE that follows order creation. If that UPDATE fails, the order exists at Duffel and nothing in this system records it. Control 1 is the only thing standing between that case and a permanent orphan, and it merely logs if its own cancel call fails.
- **Order creation is not written to `api_logs`**, though `offer_requests` is. The one call that spends money and issues tickets leaves no audit trail, so the case above cannot even be investigated locally — Duffel's own orders list is the sole witness. This is a known gap, not a deliberate omission.
- Because the order precedes payment, anything that makes order creation cheap to retry is dangerous: retries must go through the existing idempotency key and the pre-order reuse path (`duffel_pre_order_id` on the session), never straight back to `POST /air/orders`.
