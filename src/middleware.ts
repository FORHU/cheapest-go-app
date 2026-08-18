import { type NextRequest, NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from '@/i18n/routing';

const intlMiddleware = createMiddleware(routing);

// Lucia session cookie name (must match lucia.ts sessionCookie.name)
const SESSION_COOKIE = 'cg-session';

export function middleware(request: NextRequest): NextResponse {
    const { pathname } = request.nextUrl;

    // Fast admin guard — cookie presence only, no DB call.
    // Full Lucia session validation + role check happens in the admin layout.
    if (pathname.startsWith('/admin')) {
        if (!request.cookies.has(SESSION_COOKIE)) {
            const loginUrl = request.nextUrl.clone();
            loginUrl.pathname = '/login';
            loginUrl.searchParams.set('redirect', pathname);
            return NextResponse.redirect(loginUrl);
        }
    }

    // Locale URL detection and rewriting:
    //   /ko/* → serves the page with Korean locale context
    //   /ja/* → Japanese
    //   /zh/* → Chinese (Simplified)
    //   /*    → English (default, no prefix)
    return intlMiddleware(request) as NextResponse;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
