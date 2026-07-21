# ADR-0005: GeomeGo as a White-Label Deployment of CheapestGo

**Date:** 2026-07-17  
**Status:** Accepted

## Context

The CEO acquired `geomego.com` to serve Korean users. GeomeGo is the same product as CheapestGo — same inventory, same suppliers, same features — but with a different brand name, logo, and locked Korean locale. The question was whether to create a separate repository or serve both brands from one codebase.

## Decision

GeomeGo is deployed as a second AWS EC2 instance pointing at the **same repo and same database** as CheapestGo. Brand differences are driven entirely by environment variables:

| Env var | CheapestGo | GeomeGo |
|---|---|---|
| `NEXT_PUBLIC_BRAND_NAME` | CheapestGo | GeomeGo |
| `NEXT_PUBLIC_BRAND_LOGO_URL` | /logo.png | /geomego-logo.png |
| `NEXT_PUBLIC_BRAND_FAVICON` | /favicon.ico | /geomego-favicon.ico |
| `NEXT_PUBLIC_BRAND_EMAIL` | noreply@cheapestgo.com | noreply@geomego.com |
| `NEXT_PUBLIC_LOCALE` | (unset — cookie-based) | ko |
| `NEXT_PUBLIC_SITE_URL` | https://cheapestgo.com | https://geomego.com |

When `NEXT_PUBLIC_LOCALE` is set, the locale is locked and the language switcher is hidden. When unset, the existing cookie-based switching applies.

## Alternatives Considered

**Separate repository** — rejected. Two codebases that are the same product diverge over time. Every bug fix and feature must be ported to both. Maintenance cost grows with every commit.

**Single deployment with runtime domain detection** — rejected. Reading `req.headers.host` to switch brands at runtime means every brand-conditional is a runtime branch, not a build-time constant. One deployment failure affects both brands simultaneously, and independent rollback is impossible.

## Consequences

- Any feature added to CheapestGo is automatically available on GeomeGo — no porting needed.
- GeomeGo can be deployed, rolled back, and scaled independently of CheapestGo.
- New white-label brands in the future follow the same pattern: new Coolify service, new env vars, no code changes required (unless brand-specific features are needed).
- `geomego.com` must be added as a verified sending domain in the email provider (Resend/SendGrid) for `NEXT_PUBLIC_BRAND_EMAIL` to work.
