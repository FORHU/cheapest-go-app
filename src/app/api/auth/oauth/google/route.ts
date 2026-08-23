/**
 * GET /api/auth/oauth/google
 * Initiates Google OAuth flow — builds a HMAC-signed state parameter,
 * embeds returnTo inside it, and redirects to Google.
 * No cookies are set; CSRF protection comes from the server-side signature.
 */

import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';
import { RETURN_TO_PARAM, safeReturnTo } from '@/lib/auth/returnTo';
import { getOAuthRedirectUri } from '@/lib/auth/oauthOrigin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
        return NextResponse.json({ error: 'GOOGLE_CLIENT_ID is not configured' }, { status: 500 });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
        return NextResponse.json({ error: 'JWT_SECRET is not configured' }, { status: 500 });
    }

    const returnTo = safeReturnTo(new URL(req.url).searchParams.get(RETURN_TO_PARAM));

    // Encode {nonce, returnTo, issuedAt} and sign with JWT_SECRET.
    // The state is self-contained — no browser cookie is needed.
    const payload = { n: crypto.randomUUID(), r: returnTo, t: Date.now() };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
    const state = `${payloadB64}.${sig}`;

    // Shared with /auth/callback — Google rejects the token exchange unless the
    // two legs quote an identical redirect_uri.
    const redirectUri = getOAuthRedirectUri(req);

    const params = new URLSearchParams({
        client_id:     clientId,
        redirect_uri:  redirectUri,
        response_type: 'code',
        scope:         'openid email profile',
        state,
        access_type:   'offline',
        prompt:        'select_account',
    });

    return NextResponse.redirect(
        `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    );
}
