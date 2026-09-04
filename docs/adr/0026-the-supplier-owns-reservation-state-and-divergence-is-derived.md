# The supplier owns reservation state, and divergence is derived rather than stored

RateHawk's **Reservation** is the authority on whether a stay exists; a CheapestGo **Booking** is a cache of it that can be wrong in both directions. Reconciliation therefore *detects* divergence and never corrects it automatically, and the set of divergences is computed on read from Stripe and `bookings` rather than kept in a table of its own.

Both directions had already happened before this was written. On 2026-08-04 a confirmed, paid stay (`FORHU-1785814877094-7G2SM`, `pi_3U0ZDiC6cOjdwOIC13w89Ikx`, USD 44.18) failed both its INSERT and its emergency INSERT, leaving an **Unrecorded Reservation** — a guest holding a room the platform could not see. On 2026-08-17 and 2026-08-19 two bookings were cancelled in RateHawk's own dashboard, leaving **Stale Bookings** still reading `confirmed`. Nothing detected either.

## Detection reads Stripe, not the supplier

The obvious source is the supplier, but no booking-read exists in the TGX integration — it implements search, quote, book, cancel and destinations only. Stripe needs no new capability and is genuinely authoritative for the case that matters, because what defines an Unrecorded Reservation is that we took the money. `metadata.bookingReference` is minted and written at PaymentIntent creation, before any booking work can fail, precisely so a charge whose booking later fails stays attributable. A succeeded hotel PaymentIntent whose `bookingReference` matches no `bookings.booking_id` is an Unrecorded Reservation.

This buys only one direction. A dashboard cancellation leaves no Stripe trace, so **Stale Bookings are not detected by this mechanism** and stay undetected until a supplier booking-read is added. That is accepted deliberately: a Stale Booking shows a wrong status but moves no money, while an Unrecorded Reservation is a paid stay nobody can see.

## Why detect and not correct

A reconciler that writes based on supplier or payment evidence will eventually act on a stale read, and the action at the end of that path is a refund. [ADR-0023](0023-a-cancellation-refunds-what-the-recorded-terms-allow.md) already settled the direction of safety here: refusing is safe because a guest owed a refund will contact support, while a refund issued in error is gone. Automatic correction inverts that.

## Why derived and not stored

A divergence is a disagreement between two records we already hold, so storing it creates a third record that can disagree with both — a cache of a discrepancy between caches, which is the failure being fixed. Derived state is always current and self-resolving: when the missing Booking is written, the item leaves the list with no lifecycle, no resolution flag, and no stale rows.

## Considered Options

- **Notify on every detection run** — rejected, and rejected from evidence rather than principle. The existing flight reconciler emits an unconditional notification per run; on 6–7 August 2026 it produced 60 identical `Auto-Recovery Complete` rows for one unrecoverable mismatch, and the genuine `CRITICAL: DB Save Failed` notification from 4 August was lost in that feed and went unread for a month. The mechanism fired correctly and still failed, because a notification is an event and an Unrecorded Reservation is a persistent condition.
- **A `divergences` table with a resolution lifecycle** — rejected as above.
- **Accept divergence and repair by hand** — a defensible position at nine bookings, and rejected only because the one signal that did fire went unread, so the notification-only design has already been shown to fail once.

## Consequences

- **Nothing clears an item except the Booking existing**, so the derived-state choice forces a reconstruct action to exist. Admin writes the missing Booking from the evidence; there is deliberately no dismiss flag, since that would reintroduce the stored resolution state this decision rejects.
- **Reconstruction cannot be fully automatic.** Stripe metadata carries the reference, user, holder email, prebook id, amount and property/room, but not the stay dates and not `supplierRef` — those exist only in the RateHawk order. The action is an admin-initiated form pre-filled from Stripe, not a job.
- **Detection is blind to pre-`bookingReference` charges.** It matches on PaymentIntent metadata, so any charge predating that minting — including the 2026-08-04 orphan, whose reference carries the retired `FORHU-` prefix — needs checking by hand before the automated path is trusted.
- **One deduped notification per new reference**, so a new orphan still reaches a human without anyone watching the admin page, and a persisting one never floods the feed again.
- **The reconciler asserts its Stripe account before running.** Comparing Stripe to the database is only meaningful when both belong to the same world, and `docker-compose.yml` overrides `DATABASE_URL` to live RDS without overriding the Stripe keys — so the container on 3001 pairs live RDS with the test key. Scanning there would mark every test PaymentIntent as orphaned while hiding the real one. The reconciler therefore requires the key's account to match an env-configured expected account and refuses to run otherwise, failing loudly rather than emitting plausible garbage. Discipline was already tried and lost here: on 2026-08-23 a test booking against live RDS issued a real airline ticket, and the fix was separating the environments, not remembering to be careful.
- **`adminRestoreBooking` does not cover this.** It calls `findBookingAcrossTables` first and returns "Booking not found" when there is no row, so it can restore a terminal Booking but cannot create a missing one.
