# Internal routes are called in-process, not over HTTP

The app used to reach its own `/api/internal/*` endpoints with `fetch`, building the URL from `NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'` and authenticating to itself with `FUNCTIONS_SECRET`. Ten call sites did this, including the Stripe webhook and `/flights/confirm`. The logic behind each of those endpoints now lives in `src/lib/server/flights/` and is called directly; the routes remain as thin HTTP wrappers around the same functions.

We changed this because the loopback was never a design decision. All 47 of these were Supabase Edge Functions once, where the network hop was real — the conversion to API routes moved them into this process but kept them being called as though they were still remote.

The cost was not merely latency. `NEXT_PUBLIC_SITE_URL` is brand configuration (see [ADR-0005](0005-geomeego-white-label-deployment.md)), not a self-address, and the app is deployed as multiple instances sharing one database. A stale or mismatched value therefore did not fail loudly — it sent the request to a *different running instance*, or to whatever else happened to be listening on port 3000. The webhook path is the worst case: a payment is captured, `create-booking` is called over HTTP, the call lands somewhere else or returns an HTML error page, and `await res.json()` dies on `<!DOCTYPE` — money taken, no booking created. That exact failure was reproduced in development, where a dev server on port 3099 silently called a container on port 3000.

## Considered Options

- **Call the functions directly (chosen)** — a self-call cannot be misrouted if there is no address involved. Also removes the `FUNCTIONS_SECRET` round-trip, the JSON re-serialisation, and the possibility of an HTML response where JSON was expected.
- **Resolve the base URL from the incoming request** (`new URL(req.url).origin`) — rejected as the destination, though it was the obvious smaller fix. It makes the address correct instead of making the address unnecessary, and leaves every other property of the hop intact.
- **A dedicated `INTERNAL_BASE_URL` env var** — rejected. It fixes the symptom by adding one more thing that can be configured wrongly.
- **Delete the routes entirely** — rejected. They are part of the surface inherited from the Edge Functions and may still have external callers; keeping them as wrappers costs a few lines each.

## Consequences

- **`createBooking()` still returns through a `NextResponse`.** Its 572 lines of payment-capture and booking-persistence logic were moved verbatim rather than rewritten, and the wrapper unwraps the response in memory. That serialisation is now a local object round-trip, not a network call. Rewriting the return type of code that captures and cancels payments, on a path that cannot be exercised without issuing real tickets, would have risked far more than the round-trip costs.
- **Types now cross the boundary.** `revalidateFlight()` returns a typed result instead of `any` from `res.json()`, which immediately exposed that `/book` compared `newPrice === 0` against a field the function *omits* when it cannot read a price — a diagnostic branch that had never once executed. Expect more of these as the remaining callers are typed.
- **HTTP status is carried as a field** (`httpStatus`, `badRequest`) so the wrapper routes can still answer 400/404/503 exactly as before. Callers ignore it.
- **The `AbortController` timeouts around these calls were removed**, because they were guarding sockets that no longer exist. The supplier calls *inside* these functions keep their own timeouts, which is where the real latency always was.
- **Errors now propagate as exceptions rather than status codes.** Each call site wraps the direct call in try/catch and answers 502 as it did before, but a bug inside `createBooking` now surfaces as a thrown error in the caller's stack instead of a 500 body — better for debugging, and the reason each site keeps its catch.
- `NEXT_PUBLIC_SITE_URL` remains correct for what it is for: links in emails, Stripe redirect URLs, and CSRF origin checks.
