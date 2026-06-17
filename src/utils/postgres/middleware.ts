/**
 * Next.js request middleware — drop-in replacement for
 * src/utils/supabase/middleware.ts
 *
 * Validates the Lucia session cookie on every request.
 * Refreshes the cookie if the session is still valid (sliding expiry).
 * Redirects unauthenticated users away from protected routes.
 *
 * No Supabase dependency — reads directly from PostgreSQL via the
 * lucia adapter.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { getLucia } from '@/lib/auth/lucia';

export async function updateSession(request: NextRequest): Promise<NextResponse> {
    const lucia = getLucia();
    const sessionId = request.cookies.get(lucia.sessionCookieName)?.value ?? null;

    const response = NextResponse.next({ request });
    let isAuthenticated = false;

    if (sessionId) {
        const { session } = await lucia.validateSession(sessionId);

        if (session) {
            isAuthenticated = true;

            // Refresh the cookie on a sliding expiry window
            if (session.fresh) {
                const newCookie = lucia.createSessionCookie(session.id);
                response.cookies.set(newCookie.name, newCookie.value, newCookie.attributes);
            }
        } else {
            // Session expired or invalid — clear the cookie
            const blankCookie = lucia.createBlankSessionCookie();
            response.cookies.set(blankCookie.name, blankCookie.value, blankCookie.attributes);
        }
    }

    // Protect /admin routes — role check is in the layout server component
    if (request.nextUrl.pathname.startsWith('/admin') && !isAuthenticated) {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.searchParams.set('redirect', request.nextUrl.pathname);
        return NextResponse.redirect(loginUrl);
    }

    return response;
}
