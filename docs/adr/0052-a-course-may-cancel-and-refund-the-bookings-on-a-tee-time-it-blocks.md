# A course may cancel and refund the bookings on a tee time it blocks

When a course blocks tee times that already have live bookings, it can choose, in the same
confirmation, to cancel those bookings and refund the customers in full. This narrows ADR-0048
("course staff confirm and decline; they do not cancel") and ADR-0049 ("a block never touches a
booking"), and records why the narrowing stops where it does.

**Only the bookings on the tee times the course has just blocked.** ADR-0048 kept cancellation
with the team because a refund is the platform's money and it had no policy on who bears a refund
the course caused. The case here is narrow enough not to need one: the course has itself made the
round unplayable, the customer is owed everything back, and nothing the customer did is in
question. Cancelling any booking at will, one by one, would need that policy, so it stays with the
team.

**Always in full, always the customer's whole payment.** A confirmed booking is refunded in full,
service fee included, as `cancelByTeam` does. A request has its card hold released and an unpaid
hold is ended; neither was ever charged. There is no partial option: the course caused it.

**Opt-in, and unticked.** Blocking alone still leaves the bookings as they are (ADR-0049); the
confirmation shows them and offers "also cancel these bookings and refund the customers". Moving
money is never a side effect of closing a day. The preview cannot do it either: a preview is a
rolled-back transaction, and a Stripe refund cannot be rolled back, so the cancellation runs only
after a real block has been committed and never in a dry run.

**One at a time, and a failure is reported, not hidden.** The block is committed first, then each
booking is cancelled in turn. A booking whose refund fails (Stripe unreachable) is left exactly as
it was, named to the course, and recorded in the history; the others carry on. It can be tried
again by the team from the admin queue, where `cancelByTeam` is idempotent on the same Stripe key.
The alternative, cancelling inside the block's transaction, would either hold a database
transaction open across network calls or refund customers for a block that then failed to commit.

**The booking says the course did it.** `close_reason = 'cancelled_by_course'`, distinct from
`cancelled_by_team`. Settlement with the course happens outside the app (ADR-0051), so the app
does not net the refund against anything; the reason is what lets whoever settles see which
refunds the course caused.

**Scoped to the course, twice.** The route only acts for a course the caller is attached to
(ADR-0048), and `cancelByCourse` itself refuses a booking of any other course, so the function is
safe to call from anywhere.

## Considered options

- **The team executes cancellations the course requests.** Rejected: it puts the team back in the
  middle of every closure and leaves customers waiting on a refund for a decision already made.
- **Cancel by default when a block touches bookings.** Rejected: closing a day to deal with a
  problem on the course must not silently refund people before the course has looked.
- **Let course staff cancel any booking.** Deferred until there is a policy on who bears a refund
  the course caused.
- **Show the refund amount in the confirmation.** Deferred: bookings are charged in the customer's
  currency (ADR-0051), so a total is several currencies; the count and the references are shown.
