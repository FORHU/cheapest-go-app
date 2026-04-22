/**
 * CSRF protection for API routes via Origin/Referer header verification.
 *
 * Rejects requests whose Origin does not match the configured SITE_URL.
 * This stops cross-origin forms and scripts from hitting state-mutating endpoints.
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

    const origin = req.headers.get('origin');
    const referer = req.headers.get('referer');

    // Prefer Origin; fall back to Referer host
    const requestOrigin = origin
        ?? (referer ? new URL(referer).origin : null);

    if (!requestOrigin || !ALLOWED_ORIGINS.has(requestOrigin)) {
        console.warn(`[csrf] Blocked request from origin: ${requestOrigin}`);
        return NextResponse.json(
            { success: false, error: 'Forbidden' },
            { status: 403 }
        );
    }

    return null;
}
