# A cancellation refunds what the recorded terms allow

What comes back when a hotel booking is cancelled is decided by the supplier's penalty schedule as recorded at booking time, not by the amount charged. The terms are written to `booking_policy_snapshots` and `policy_tiers` when the booking is confirmed, and `calculateCancellation` reads them back to produce a refund ratio that the Stripe amount is scaled by.

api-v2 refunded `pi.amount` outright. Every cancellation returned the full charge — a non-refundable stay cancelled the night before check-in was handed back in full while the supplier still billed us for the room, and a rate that was free until a deadline was refunded in full long after that deadline had passed. Nothing consulted a policy because nothing had recorded one: all three tables existed in the schema and none was ever written.

The confirm path was also collapsing the terms as it stored them. `policyType` was computed as `isRefundable ? 'free_cancellation' : 'non_refundable'`, so a tiered rate — free until a date, then charged in steps — was filed as plainly "free". Even a correct engine reading that snapshot would have refunded in full. A refundable rate carrying penalty steps is now recorded as `tiered`, with one `policy_tiers` row per step and `free_cancel_deadline` set to the earliest of them.

## Refusing is the safe direction

Three cases return no refund rather than guess: no snapshot on record, a tiered policy with no tiers, and a booking whose `total_price` cannot be read. Each is a failure to know the terms, and the alternative is to hand back money the supplier will still charge us for. A guest who is owed a refund and does not get one will contact support and be made whole; a refund issued in error is gone.

This is why the snapshot write at confirm is non-fatal but its absence is not treated as permission. A booking that loses its snapshot is cancellable only through support, which is the correct outcome for a booking whose terms nobody can read.

## Consequences

- **Cancellation now depends on data written at confirm.** Bookings taken before this change have no snapshot, so cancelling one refunds nothing and routes to support. They need backfilling from `bookings.cancellation_policy`, which does hold the raw supplier response.
- **The refund is a ratio, not an amount.** The supplier quotes in its own currency and the guest is charged in theirs, so applying a supplier-currency figure to a Stripe charge would be wrong whenever the two differ. `refundRatio` is applied to `pi.amount` and clamped to it.
- **The Stripe idempotency key now includes the amount.** It was scoped to the booking reference alone, which would have replayed the first refund's figure if a corrected policy later produced a different one.
- **A held payment is still released in full.** A PI in `requires_capture` has taken nothing, so cancelling the hold costs the guest nothing whatever the policy says — the penalty only applies to money that actually moved.
- **`refund_logs` is still unwritten.** The table exists and v1 has `createRefundRequest`/`processRefund` around it. The refund decision is now correct; the ledger of decisions is not yet ported.
