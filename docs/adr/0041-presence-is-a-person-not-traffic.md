# Presence is a person at the screen, not traffic on the wire

A **Session** now ends after an **Idle Limit** with no **Presence** — ten minutes for staff, thirty for travellers. The server holds the clock, and a request only counts as Presence when a person caused it. Background polling is explicitly excluded, and every polling fetch has to say so about itself.

The client had no revalidation at all. `AuthListener` calls `/api/auth/me` once on mount with `[]` deps and never again, and its comment gives the reason: *"The Lucia session cookie is validated server-side on every request by the middleware, so no polling is needed for security."* That is not what the middleware does. `middleware.ts` checks cookie **presence only, with no database call**, and [ADR-0027](0027-authorisation-belongs-to-the-resource-not-the-page.md) already states that a middleware guard *"is never counted as protection."* The justification for never re-checking rested on a control that does not exist, so a returning traveller renders as signed in against a cookie that may have been revoked hours earlier.

The exclusion of polling is the part that will look strange later, so it is the part worth recording. The admin navigation fetches notifications every 30 seconds and sits on every admin page; the dashboard invalidates its queries every 60; `/trips` refreshes every 30. If the limit were measured against the last request the server saw, a staff member could walk away from an open admin screen and their session would be held open indefinitely by the page itself — the feature would do nothing on the one screen showing customer records, bookings and Stripe data. Traffic is evidence that a tab is open. It is not evidence that anyone is there.

Thirty minutes for travellers is chosen to match the life of a **Price Hold**. A traveller has two things to lose on an abandoned checkout — their sign-in and their quote — and giving them the same scale makes the behaviour explainable and stops one silently outliving the other by a wide margin.

## Considered options

- **Server-held clock, polling excluded (chosen)** — the only version that is both unbypassable and actually fires where it matters.
- **A client-side idle timer that calls sign-out** — far less work, and it gives the same warning experience. Rejected on ADR-0027's own terms: a limit the browser keeps is one a stale tab or an edited client simply declines to keep, so it would be a screen lock described as a security control.
- **Measure against the last request of any kind** — the simplest server rule, and defeated by the product's own polling, as above.
- **Staff only** — the narrowest change and the strongest case, since a 10-minute timeout is ordinary for an internal tool and unheard of on a leisure booking site. Rejected because a traveller signing in on a hotel lobby machine has bookings and personal details behind the same cookie, and thirty minutes costs a real traveller nothing.

## Consequences

- **Every background fetch must declare itself, and a new one that forgets is an invisible hole.** A poll added later without the marker silently becomes a way to hold a session open, and nothing fails visibly when that happens. This is a standing maintenance obligation, not a one-time change.
- **Lucia's own expiry cannot express this.** `sessionExpiresIn` is a single global value and Lucia slides it on validation, so it can carry neither two limits nor an exclusion. The limit needs its own `last_activity_at` on `sessions`, checked in `getSession()` alongside Lucia's validation, which means session expiry is now decided in two places and both have to agree.
- **No `sessionExpiresIn` is configured today, so sessions are Lucia's 30-day default.** That absolute lifetime is untouched here and remains worth revisiting separately; an Idle Limit is not a substitute for it.
- **A traveller who idles out on checkout loses the quote as well as the session.** The page keeps their form, signs them back in over the top, and the existing post-auth prebook retry re-quotes the room — so the recovery path is the one that already exists, not a new one.
- **The stay-signed-in button is a way to hold a session open by clicking.** Accepted, because someone clicking it is by definition present; it is the narrowest possible exception and it requires a human.
- **`AuthListener`'s comment has to be corrected in the same change.** Left as it is, it goes on justifying the absence of the thing this decision adds.
