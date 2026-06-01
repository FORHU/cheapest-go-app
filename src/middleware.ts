/**
 * Next.js edge middleware.
 * Runs on every matched request before the page/route handler.
 *
 * Replaces the Supabase SSR session-refresh middleware with our
 * Lucia-based session validation.
 */

import { type NextRequest } from 'next/server';
import { updateSession } from '@/utils/postgres/middleware';

export async function middleware(request: NextRequest) {
    return updateSession(request);
}

export const config = {
    matcher: [
        /*
         * Match all request paths except static assets, images, and _next internals.
         * This mirrors the Supabase SSR recommendation.
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
