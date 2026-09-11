# ADR-0005: GeomeeGo as a White-Label Deployment of CheapestGo

**Date:** 2026-07-17  
**Status:** Accepted

## Context

The CEO acquired `geomeego.com` to serve Korean users. GeomeeGo is the same product as CheapestGo — same inventory, same suppliers, same features — but with a different brand name, logo, and locked Korean locale. The question was whether to create a separate repository or serve both brands from one codebase.

## Decision

GeomeeGo is deployed as a second AWS EC2 instance pointing at the **same repo and same database** as CheapestGo. Brand differences are driven entirely by environment variables:

| Env var | CheapestGo | GeomeeGo |
|---|---|---|
| `NEXT_PUBLIC_BRAND_NAME` | CheapestGo | GeomeeGo |
| `NEXT_PUBLIC_BRAND_LOGO_URL` | /logo.png | /geomeego-logo.png |
| `NEXT_PUBLIC_BRAND_FAVICON` | /favicon.ico | /geomeego-favicon.ico |
| `NEXT_PUBLIC_BRAND_EMAIL` | noreply@cheapestgo.com | noreply@geomeego.com |
| `NEXT_PUBLIC_LOCALE` | (unset — cookie-based) | ko |
| `NEXT_PUBLIC_SITE_URL` | https://cheapestgo.com | https://geomeego.com |

When `NEXT_PUBLIC_LOCALE` is set, the locale is locked and the language switcher is hidden. When unset, the existing cookie-based switching applies.

## Alternatives Considered

**Separate repository** — rejected. Two codebases that are the same product diverge over time. Every bug fix and feature must be ported to both. Maintenance cost grows with every commit.

**Single deployment with runtime domain detection** — rejected. Reading `req.headers.host` to switch brands at runtime means every brand-conditional is a runtime branch, not a build-time constant. One deployment failure affects both brands simultaneously, and independent rollback is impossible.

## Consequences

- Any feature added to CheapestGo is automatically available on GeomeeGo — no porting needed.
- GeomeeGo can be deployed, rolled back, and scaled independently of CheapestGo.
- New white-label brands in the future follow the same pattern: new Coolify service, new env vars, no code changes required (unless brand-specific features are needed).
- `geomeego.com` must be added as a verified sending domain in the email provider (Resend/SendGrid) for `NEXT_PUBLIC_BRAND_EMAIL` to work.

---

## Amendment — 2026-09-06: the brand is now AirangGo

GeomeeGo was renamed **AirangGo**, serving `airanggo.com`, at the direction of the Korean
partner. This is the second rename of this brand.

The decision recorded above is unchanged and is what made the rename cheap: because the
brand is env vars over one codebase, renaming it touched no product logic. What it did
touch is everywhere the old *name* had been written down as a value rather than derived:

- `source_brand` on the three booking tables, migrated by
  `20260906000001_rename_geomeego_to_airanggo.sql`
- the admin brand filter, the brand switcher and its cookie
- the booking reference prefix map — the prefix stays **GG** so references already
  issued keep resolving to one brand
- the CSRF origin allowlist, which now permits both domains

Both names are deliberately still accepted in code. The Korean instance keeps running with
`NEXT_PUBLIC_BRAND_NAME=GeomeeGo` until it is redeployed, and `geomeego.com` keeps
resolving until DNS moves; a hard cutover would have made Korean bookings invisible in
admin and misfiled their Stripe attribution during that window. The tolerance is removable
once no deployment serves the old name — see `RENAMED_BRANDS` in `src/lib/brand.ts`.

Two things the original Consequences got wrong or left stale, corrected here rather than
edited above:

- "new Coolify service" — deployment is AWS EC2, as the Decision section itself says.
  Coolify is not used.
- the verified sending domain requirement now applies to `airanggo.com`, and
  `geomeego.com` must stay verified until it stops sending.

A third rename should not require a third pass over the codebase. The remaining
name-shaped values are listed above; anything new that hardcodes a brand name instead of
reading it from configuration is a defect.
