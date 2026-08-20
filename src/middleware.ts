import { type NextRequest, NextResponse } from 'next/server';

// Non-default locales that use a URL prefix (/ko/, /ja/, /zh/).
// English is the default locale — no prefix.
const LOCALE_PREFIXES = ['ko', 'ja', 'zh'] as const;
type LocalePrefix = (typeof LOCALE_PREFIXES)[number];

// Header next-intl reads to populate `requestLocale` in getRequestConfig.
const INTL_LOCALE_HEADER = 'X-NEXT-INTL-LOCALE';

// Lucia session cookie name (must match lucia.ts sessionCookie.name).
const SESSION_COOKIE = 'cg-session';

function detectLocale(pathname: string): { locale: LocalePrefix; stripped: string } | null {
    for (const locale of LOCALE_PREFIXES) {
        if (pathname === `/${locale}`) {
            return { locale, stripped: '/' };
        }
        if (pathname.startsWith(`/${locale}/`)) {
            return { locale, stripped: pathname.slice(locale.length + 1) };
        }
    }
    return null;
}

export function middleware(request: NextRequest): NextResponse {
    const { pathname } = request.nextUrl;

    // 1. Locale URL rewriting: /ko/search → /search with X-NEXT-INTL-LOCALE: ko
    const detected = detectLocale(pathname);
    if (detected) {
        const url = request.nextUrl.clone();
        url.pathname = detected.stripped;

        // Forward all existing request headers plus the locale header
        const headers = new Headers(request.headers);
        headers.set(INTL_LOCALE_HEADER, detected.locale);

        const response = NextResponse.rewrite(url, { request: { headers } });

        // Also set the locale cookie so the next request (after redirect/refresh)
        // uses the correct locale without a URL prefix.
        response.cookies.set('locale', detected.locale, {
            path: '/',
            maxAge: 60 * 60 * 24 * 365,
            sameSite: 'lax',
        });

        return response;
    }

    // 2. Protected route guard — cookie presence only (no DB call).
    //    Full Lucia session validation happens in the route/layout.
    const PROTECTED_PREFIXES = ['/admin', '/checkout'];
    if (PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
        if (!request.cookies.has(SESSION_COOKIE)) {
            const homeUrl = request.nextUrl.clone();
            homeUrl.pathname = pathname.startsWith('/admin') ? '/login' : '/';
            homeUrl.search = '';
            return NextResponse.redirect(homeUrl);
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
