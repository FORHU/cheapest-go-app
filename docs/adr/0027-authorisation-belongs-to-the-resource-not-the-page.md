# Authorisation belongs to the resource, not the page

A page is never an authorization boundary. Every route that reads or writes booking data resolves who is asking and scopes the query to the owner, on its own, without assuming anything about how the caller arrived. A middleware guard is a *routing convenience* — it sends a signed-out visitor somewhere more useful than an empty form — and is never counted as protection, because everything a page displays came from a route that had to authorise itself anyway.

Authentication is required at the point of **payment**, not at the point of **browsing**. A visitor may reach `/checkout` and fill the form signed out; they cannot create a payment session.

This is written down because the opposite reading keeps being filed as a bug. QA raised it as BG-1 ("require auth on all sensitive booking pages", Critical) against `https://cheapestgo.com/checkout?currency=PHP`, and [middleware.ts](../../src/middleware.ts) already carried a comment defending the same decision from a previous round. The comment was not enough, so here is the reasoning in a place that outlives it.

## Why checkout stays open

Nothing on the checkout page is server-rendered from a session. The state comes from `cheapestgo-booking`, a client store holding property, room, dates and guest *counts* — no names, no email, no payment data. The only query parameters read are `currency`, `payment_intent`, `redirect_status` and `bundleFlightId`. `/api/booking/create-payment` returns 401 without a session. A stranger opening that URL sees an empty form.

Guarding it in middleware was tried and reverted: it bounced signed-out users who had clicked "Choose room" to the landing page and discarded their query string, losing the search they had just done. So the wall cost a real funnel and protected nothing.

The corollary matters more than the page: because the page is not the boundary, **every route is**. Two were not, and were found while answering BG-1 — `/api/flights/booking-note` accepted an unauthenticated POST that wrote a remark onto any reservation Mystifly holds, and `/api/flights/booking-notes` returned any booking's notes to anyone who named its id. Under this ADR those are not oversights of unusual severity; they are breaches of a stated rule, and the rule is what makes them findable by inspection.

## Capability Links

Sessions are not the only way to become an authorised actor. A **Capability Link** is a URL whose possession *is* the authorisation — the receipt links in confirmation emails work this way, and deliberately so: guests forward receipts to travel companions and expense departments, and a login wall there generates support load rather than security. Stripe receipts, DocuSign envelopes and airline check-in links all take this shape.

What separates a capability link from a sloppy one is that it obeys rules:

1. **Scoped to one resource and one action, and read-only.**
2. **No weaker alternate lookup on the same route.** A route with a strong credential and a weak fallback has the strength of the weak one.
3. **Non-enumerable, `noindex`, and `Referrer-Policy: no-referrer`,** so the credential does not walk out in a `Referer` header.
4. **Ideally a secret distinct from the resource id**, ≥128 bits, stored hashed, expiring and revocable — because ids leak by design into logs, admin screens, supplier payloads and support threads, and a credential must be rotatable without changing the row's identity.

Rules 1-3 hold today. Rule 4 does not: `/trips/invoice/[id]` uses the booking's own UUID as the credential. That is 122 bits and adequate for a hotel receipt, and it is thin for a flight receipt, which renders passenger names, the PNR and e-ticket numbers — enough to manage the reservation on most airline sites. Moving to a separate `receipt_token` needs a migration, changes to nine call sites in `email.ts` and a backfill, all while every already-sent link keeps working, so it is tracked as its own piece of work rather than folded into a bug fix.

## Consequences

- **`/checkout` must not be added to `PROTECTED_PREFIXES`.** If it appears there again, this ADR is the thing to argue with.
- **A page-level guard is never accepted as the fix for a data-exposure report.** The fix is on the route.
- **The invoice route no longer resolves a hotel receipt by supplier `booking_id`.** That fallback was rule 2 being violated; every link we generate uses the UUID, so it cost nothing to remove. A support workflow that pasted a supplier reference into the receipt URL will now 404 — admin is the place to look a booking up by supplier reference.
- **Flight receipts remain a known-thin capability** until the token migration lands. If that slips, the cheap interim is requiring the passenger surname as a second factor on the flight branch, which needs no schema change.
