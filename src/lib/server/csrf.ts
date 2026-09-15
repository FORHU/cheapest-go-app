/**
 * CSRF protection for API routes.
 *
 * Primary check: presence of the custom `X-Requested-By: cheapestgo-client` header.
 * Cross-origin requests cannot set custom headers without a CORS preflight, which
 * the browser would block — making this a valid same-origin proof.
 *
 * Fallback: Origin/Referer header must match NEXT_PUBLIC_SITE_URL (or one of the other
 * known-good production origins), or, outside production, be localhost/127.0.0.1 on any
 * port.
 *
 * Usage:
 *   const csrfError = checkCsrf(req);
 *   if (csrfError) return csrfError;
 */
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = (() => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapestgo.com';
    const origins = new Set([siteUrl.replace(/\/$/, '')]);
    // The Korean brand, served off this same backend. Both spellings are listed
    // deliberately: geomeego.com is the live domain and airanggo.com is the rebrand it
    // moves to, and during the changeover a traveller can arrive on either. Dropping the
    // old one the day the new one is added would reject every state-mutating request from
    // anyone still landing on geomeego.com — including mid-checkout. Remove geomeego.com
    // only once its DNS no longer resolves here.
    origins.add('https://geomeego.com');
    origins.add('https://airanggo.com');
    // Local dev origins are handled separately, by LOCAL_DEV_ORIGIN below — any port,
    // not just 3000.
    return origins;
})();

// A request from the machine running this process, in development, on any port — not
// just the 3000 the dev script happens to default to. `next dev` falls back to the next
// free port when 3000 is already taken, more than one dev server can run side by side,
// and `-p` overrides it outright. Every one of those previously 403'd for any caller that
// fell through to the Origin fallback instead of sending X-Requested-By, with nothing in
// the response to say why: same machine, same browser, same app, just the "wrong" port.
const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export function checkCsrf(req: NextRequest): NextResponse | null {
    // Only enforce on state-mutating methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return null;

    // ── Primary check: custom header (JS-settable, blocks cross-origin attackers) ──
    // Cross-origin scripts cannot set custom headers without a CORS preflight, which
    // the browser blocks. Our apiFetch() always sends this header, so local dev,
    // staging, and production all pass this check without any special casing.
    const requestedBy = req.headers.get('x-requested-by');
    if (requestedBy === 'cheapestgo-client') return null;

    // ── Fallback: Origin / Referer header matching ──
    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');
    const requestOrigin = origin ?? (referer ? new URL(referer).origin : null);

    if (requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)) return null;
    if (requestOrigin && process.env.NODE_ENV !== 'production' && LOCAL_DEV_ORIGIN.test(requestOrigin)) return null;

    console.warn(`[csrf] Blocked request — no valid CSRF proof. origin: ${requestOrigin}, x-requested-by: ${requestedBy}`);
    return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
    );
}
