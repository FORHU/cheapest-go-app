/**
 * Post-login return paths ("come back to where I was").
 *
 * One canonical query param — `next` — shared by the server redirects
 * (`redirect('/login?next=…')`), the login form, and the OAuth round trip.
 * `redirect` is still accepted when reading so older links keep working.
 */

export const RETURN_TO_PARAM = 'next';

/** Legacy param name; still read, never written. */
const LEGACY_PARAM = 'redirect';

/** Cookie carrying the return path across the Google OAuth round trip. */
export const RETURN_TO_COOKIE = 'auth_return_to';

/**
 * Only same-origin absolute paths are allowed. Anything else — a protocol,
 * a protocol-relative `//evil.com`, a backslash (which some browsers
 * normalise to `/`) — is an open-redirect vector and falls back to `/`.
 */
export function safeReturnTo(url: string | null | undefined, fallback = '/'): string {
    if (!url) return fallback;
    if (!url.startsWith('/')) return fallback;
    if (url.startsWith('//') || url.startsWith('/\\')) return fallback;
    if (url.includes('://')) return fallback;
    if (url.includes('\\')) return fallback;
    // Never bounce back into the auth pages themselves — that would loop.
    if (url === '/login' || url.startsWith('/login?') || url.startsWith('/auth/')) return fallback;
    return url;
}

/** Reads the return path from a URLSearchParams-like source, newest name first. */
export function readReturnTo(
    params: { get(name: string): string | null } | null | undefined,
    fallback = '/',
): string {
    if (!params) return fallback;
    return safeReturnTo(params.get(RETURN_TO_PARAM) ?? params.get(LEGACY_PARAM), fallback);
}

/** Builds `/login?next=<current location>` for client-side auth gates. */
export function loginUrlFor(returnTo: string): string {
    const safe = safeReturnTo(returnTo);
    return safe === '/' ? '/login' : `/login?${RETURN_TO_PARAM}=${encodeURIComponent(safe)}`;
}
