# api-v2 owns all domain logic; app-v2 is a frontend

app-v2 had grown a 23-file `src/server/` layer — its own TravelgateX client and search, its own Postgres pool, FX locking, Stripe, currency conversion, city aliases, Lucia sessions — behind 20 of its own API routes, only 3 of which proxied to api-v2. The result was that prebook, search, autocomplete, confirm, cancel, amend and auth each existed **three** times: in v1, in api-v2, and in app-v2. Domain logic and supplier credentials now live in api-v2 alone. app-v2 keeps only server code that serves the browser — SSR fetches, key-hiding proxies, cookie forwarding, streaming — and reaches api-v2 over HTTP through `NEXT_PUBLIC_API_URL` for everything else. `DATABASE_URL` leaves app-v2's environment.

We chose this at the start of the Feature Port, because the alternative was porting every capability twice for the lifetime of v2. A change to bounding-box filtering would have had to land in both `api-v2/src/lib/hotels/travelgatex.ts` and `app-v2/src/server/stays/travelgatex/search.ts`, with nothing enforcing that it did — and that class of divergence is what produced the wrong-country hotel results for Rome and Athens in v1. It also gave app-v2 a `DATABASE_URL`, making it a second writer to a database that [ADR-0014](0014-v2-reads-v1s-schema-until-cutover.md) says has exactly one.

Having server code in a Next.js app is not itself the problem — the App Router is a full-stack framework and v1 is built that way deliberately. The problem is a second implementation of the same domain sitting beside a dedicated backend service. The line drawn is therefore not "no server code in app-v2" but: **does it encode a business rule or hold a supplier credential?** If so it belongs to api-v2.

## Considered Options

- **Keep both, api-v2 for mobile and app-v2 for web** — rejected. It is the status quo that produced three prebooks, and it makes every future fix a two-repo change with no mechanism to catch a missed one.
- **Invert: app-v2 owns web, api-v2 shrinks to mobile** — rejected. It contradicts the premise of v2 as separate FE/BE and the EC2-plus-Vercel deployment split.

## Consequences

- **This is part of slice C0**, before any capability slice, so that nothing is ported into a layer that is about to be deleted.
- **SSR now crosses a network boundary** (Vercel to EC2) where v1 had an in-process call. This does not contradict [ADR-0012](0012-internal-routes-are-called-in-process.md): that decision was about a process calling *itself* over HTTP through a misconfigurable base URL, whereas this is a real service boundary.
- **app-v2's auth changes model.** `server/auth/lucia.ts` and `server/auth/session.ts` are v1's Lucia session; api-v2 issues a JWT cookie. These are different mechanisms and the switch is its own piece of work.
- **The `fetch('/api/...')` convention is retired.** All backend calls go through `@/shared/lib/http` against `NEXT_PUBLIC_API_URL`; the five remaining call sites move.
