/**
 * CSRF protection for API routes.
 *
 * Primary check: presence of the custom `X-Requested-By: cheapestgo-client` header.
 * Cross-origin requests cannot set custom headers without a CORS preflight, which
 * the browser would block — making this a valid same-origin proof.
 *
 * Fallback: Origin/Referer header must match NEXT_PUBLIC_SITE_URL.
 *
 * Usage:
 *   const csrfError = checkCsrf(req);
 *   if (csrfError) return csrfError;
 */
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_ORIGINS = (() => {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://cheapestgo.com';
    const origins = new Set([siteUrl.replace(/\/$/, '')]);
    // Always allow localhost in development
    if (process.env.NODE_ENV !== 'production') {
        origins.add('http://localhost:3000');
        origins.add('http://127.0.0.1:3000');
    }
    return origins;
})();

export function checkCsrf(req: NextRequest): NextResponse | null {
    // Only enforce on state-mutating methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return null;

    // Skip enforcement in development for easier local testing
    if (process.env.NODE_ENV !== 'production') return null;

    // ── Primary check: custom header (JS-settable, blocks cross-origin attackers) ──
    // Cross-origin scripts cannot include custom headers without a CORS preflight,
    // which the browser will block. Our apiFetch always sends this header.
    const requestedBy = req.headers.get('x-requested-by');
    if (requestedBy === 'cheapestgo-client') return null;

    // ── Fallback: Origin / Referer header matching ──
    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');
    const requestOrigin = origin ?? (referer ? new URL(referer).origin : null);

    if (requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)) return null;

    console.warn(`[csrf] Blocked request — no valid CSRF proof. origin: ${requestOrigin}, x-requested-by: ${requestedBy}`);
    return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
    );
}
