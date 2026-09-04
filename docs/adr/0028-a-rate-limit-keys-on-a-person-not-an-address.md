# A rate limit keys on a person, not an address

Where a route knows who is calling, its rate limit keys on the user id. Addresses are the fallback for genuinely anonymous traffic, and are believed only when the request can be proved to have come through Cloudflare. When no client can be identified at all, the request counts against a shared backstop bucket at a much wider limit — never against the route's own limit.

The limiter used to read `x-real-ip`, with a comment explaining that Vercel's edge sets it to the true client address and clients cannot forge it. That was true of a deployment we no longer run. `cheapestgo.com` resolves to Cloudflare (104.21.x / 172.67.x), Cloudflare does not set `x-real-ip` — it sets `cf-connecting-ip` and appends the client to `x-forwarded-for` — so the value being read was written by whatever terminates TLS in front of the container, and named a *Cloudflare edge address*. The documented fallback, the rightmost `x-forwarded-for` entry, named the same proxy.

So the key identified a PoP, not a person. Traffic is heavily Philippine and lands on one or two PoPs, which turned every published limit into a national one: 10 hotel prebooks a minute for the whole country, 60 exchange-rate lookups, and — worst — **5 payment initiations**, so customers were told to wait a moment before paying for something nobody else was paying for. It surfaced as a QA report about stacked "Too many requests" toasts on checkout; the toasts were real, the cause was not local to checkout.

`create-payment` illustrates how the shape of the code caused it: the limiter ran *before* the session was read, so an endpoint that requires authentication and knows exactly who is calling was keyed by address for no reason. Reading the session first costs one lookup and removes the failure mode entirely.

## Considered options

**Trust `cf-connecting-ip` unconditionally.** Rejected. `docker run -p 3000:3000` binds all interfaces, and nothing in this repository configures the security group, so we cannot show that the origin is unreachable except through Cloudflare. Anything that can reach the origin directly can send whatever `cf-connecting-ip` it likes and mint itself a fresh allowance per request — strictly worse than a shared bucket, which at least cannot be forged. The header is therefore gated on `CF_ORIGIN_SECRET`, a value a Cloudflare Transform Rule adds at the edge and a direct caller does not know.

**Fail open when no client can be identified.** Rejected. Prebook runs a live supplier search per call, so an unlimited anonymous endpoint is a bill as well as a load. The backstop bucket keeps a ceiling on a flood while being far too wide for ordinary traffic to reach.

**Keep a shared bucket at the route's own limit** — the accidental status quo. Rejected: that is the bug.

## Consequences

- **`CF_ORIGIN_SECRET` and the matching Cloudflare Transform Rule are required in production.** Without them every anonymous request falls into the backstop bucket, per-client limiting is effectively off, and the first such request logs a warning saying so.
- **The multiplier on the backstop bucket is deliberately unprincipled.** It is "wide enough that real traffic never reaches it", not a calculated figure. If it ever starts rejecting, the answer is to fix client identification, not to raise it.
- **Anonymous limits could be raised once they mean what they say.** Prebook moved 10 → 30 on that basis; it had been sized against a bucket shared by an entire country.
- **The origin should still be locked to Cloudflare's ranges,** and the container bound to `127.0.0.1:3000` rather than `0.0.0.0`. Until then Cloudflare's own WAF and rate limiting are bypassable by addressing the origin directly, and this ADR's gate is the only thing standing in for that.
