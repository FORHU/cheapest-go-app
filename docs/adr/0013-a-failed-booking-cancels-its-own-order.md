# A failed booking cancels its own airline order

`/api/flights/book` places a real airline order before taking payment ([ADR-0009](0009-airline-order-placed-before-payment.md)). Its outermost `catch` now cancels that order before answering the traveller, using an order id captured the moment the order exists and cleared once the order is safely recorded against a PaymentIntent.

Until this, exactly one failure undid the order: the session `UPDATE` *returning an error object*. Every other way the handler could fail after ordering — a thrown Postgres error from a raw query, a Stripe outage, an FX conversion failure, any bug — landed in the generic 500 handler, which logged and returned. The order stayed confirmed, our balance stayed debited, and because the failure happened *before* `duffel_pre_order_id` was written, the `cleanup-orphaned-duffel-orders` cron could not see it either: it selects on that column. An order in that state is invisible to the entire platform and survives until the airline's own hold expires — or indefinitely, if the fare ticketed instantly.

This is not hypothetical. On 2026-08-23 a Philippine Airlines order (`ord_0000B9eW4pEUTDvzh27YXo`, PNR `C2IWPF`, USD 479.50) was created and confirmed while the traveller was shown "Booking Failed — your card has **not** been charged". It appears in neither the local database nor RDS.

## Considered Options

- **Cancel in the outermost catch (chosen)** — one place, covering every failure mode after ordering rather than the single one anticipated. Best-effort: if the cancel itself fails, the order id is logged as `ORPHANED DUFFEL ORDER … MANUAL CANCELLATION REQUIRED`, which is the only trace that will exist.
- **Write the order id to the session immediately, before anything else can fail, and let the sweep handle it** — rejected as the primary mechanism, though it is a good complement. It converts an invisible orphan into a visible one, but leaves inventory held for up to 35 minutes plus the cron interval, and it still needs a write that can itself fail.
- **Wrap each fallible step in its own compensating handler** — rejected. It is what the code already attempted and is exactly why the gap existed: every new step after the order is one more place to remember, and the one nobody remembered is the one that fired.

## Consequences

- **The cancel is best-effort and may not release the money.** For an instant-ticketing fare the order is already a ticket, so cancelling is a refund request subject to the fare's rules — a non-refundable fare returns nothing. This limits the damage; it does not always undo it.
- **`placedOrderId` must be cleared when the order becomes recoverable by other means**, immediately after the session row records it. Leaving it set would cancel a perfectly good order if some later, unrelated line threw.
- The reuse path sets it too: an order adopted from a previous attempt is just as exposed if this attempt then fails.
- **This does not remove the need for the cron sweep or the timeout reconciliation.** Each covers a case the others cannot: this one covers a handler that fails and returns, the sweep covers a traveller who abandons checkout, and `findOrderFromTimedOutAttempt` covers a request killed before any code could run.
