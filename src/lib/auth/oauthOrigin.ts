/**
 * The origin an OAuth `redirect_uri` is built from.
 *
 * Google compares the `redirect_uri` sent when starting the flow against the one
 * sent during the token exchange and rejects the exchange unless they match
 * byte-for-byte. The two run in different routes — /api/auth/oauth/google and
 * /auth/callback — so they have to derive the origin the same way or the flow
 * breaks at the last step with an opaque "token exchange failed: 400".
 *
 * They previously did not: initiation read NEXT_PUBLIC_SITE_URL directly while
 * the callback preferred x-forwarded-host. Behind the proxy that serves
 * geomeego.com off this same backend, that pair disagrees — initiation quotes the
 * canonical site URL, the callback quotes the brand the traveller actually came
 * in on. Both routes now call this.
 *
 * Order matters:
 *   1. x-forwarded-host — the host the browser really used, which is the only one
 *      it can be sent back to. Also what makes the second brand work.
 *   2. NEXT_PUBLIC_SITE_URL — configured canonical origin, no proxy in front.
 *   3. The request's own origin — local dev, where the port is whatever `next dev`
 *      bound to rather than whatever .env claims.
 *
 * Every origin this can return needs its /auth/callback registered as an
 * authorized redirect URI in the Google Cloud Console.
 */
export function getOAuthOrigin(request: Request): string {
    // Cloudflare can send comma-separated values — take the first only
    const fwdHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim();
    const fwdProto = (request.headers.get('x-forwarded-proto') || 'https').split(',')[0].trim();
    if (fwdHost) return `${fwdProto}://${fwdHost}`;
    return process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
}

/** The `redirect_uri` for the Google OAuth flow, identical on both legs. */
export function getOAuthRedirectUri(request: Request): string {
    return `${getOAuthOrigin(request)}/auth/callback`;
}
