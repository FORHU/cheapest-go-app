/**
 * GET /auth/callback
 *
 * Handles:
 *   1. Google OAuth callback (code + state params)
 *   2. Password reset token redirect
 *   3. Fallback redirect for already-authenticated users
 */

import { landingFor } from '@/lib/auth/roles';
import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { getSqlAdmin } from '@/lib/db/postgres';
import { createUserSession } from '@/lib/auth/session';
import { safeReturnTo } from '@/lib/auth/returnTo';
import { getOAuthOrigin, getOAuthRedirectUri } from '@/lib/auth/oauthOrigin';

// ─── HMAC-signed state verification ─────────────────────────────────────────

interface StatePayload { n: string; r: string; t: number }

function verifyOAuthState(state: string | null): { returnTo: string } | null {
    if (!state) return null;
    const secret = process.env.JWT_SECRET;
    if (!secret) return null;

    const dotIdx = state.lastIndexOf('.');
    if (dotIdx === -1) return null;
    const payloadB64 = state.slice(0, dotIdx);
    const sig        = state.slice(dotIdx + 1);

    const expectedSig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
    try {
        if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    } catch {
        return null; // length mismatch
    }

    let payload: StatePayload;
    try {
        payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as StatePayload;
    } catch {
        return null;
    }

    if (!payload.n || !payload.r || !payload.t) return null;
    if (Date.now() - payload.t > 10 * 60 * 1000) return null; // 10-minute window

    return { returnTo: safeReturnTo(payload.r) };
}

// ─── Google token exchange ────────────────────────────────────────────────────

async function exchangeGoogleCode(code: string, redirectUri: string) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id:     process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri:  redirectUri,
            grant_type:    'authorization_code',
        }),
    });
    if (!res.ok) throw new Error(`Google token exchange failed: ${res.status}`);
    return res.json() as Promise<{ access_token: string; id_token: string }>;
}

async function getGoogleUser(accessToken: string) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Google userinfo failed: ${res.status}`);
    return res.json() as Promise<{
        sub: string;
        email: string;
        name?: string;
        given_name?: string;
        family_name?: string;
        picture?: string;
        email_verified?: boolean;
    }>;
}

// ─── User upsert ──────────────────────────────────────────────────────────────

async function findOrCreateGoogleUser(googleUser: {
    sub: string;
    email: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
}): Promise<string> {
    const sql = getSqlAdmin();

    // Check by email first (may have signed up with email/password before)
    const existing = await sql`
        SELECT id FROM users WHERE email = ${googleUser.email.toLowerCase()} LIMIT 1
    `;

    if (existing.length > 0) {
        // Update avatar if we got one from Google
        if (googleUser.picture) {
            await sql`
                UPDATE users SET avatar_url = ${googleUser.picture}, updated_at = NOW()
                WHERE id = ${existing[0].id} AND (avatar_url IS NULL OR avatar_url = '')
            `;
        }
        return existing[0].id;
    }

    // Create new user — no password_hash (OAuth users authenticate via Google)
    const rows = await sql`
        INSERT INTO users (email, role, first_name, last_name, avatar_url)
        VALUES (
            ${googleUser.email.toLowerCase()},
            'user',
            ${googleUser.given_name ?? null},
            ${googleUser.family_name ?? null},
            ${googleUser.picture ?? null}
        )
        RETURNING id
    `;
    return rows[0].id;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
    const origin = getOAuthOrigin(request);
    const { searchParams } = new URL(request.url);

    // ── Password reset token ────────────────────────────────────────────────
    const resetToken = searchParams.get('token');
    if (resetToken) {
        return NextResponse.redirect(`${origin}/auth/reset-password?token=${resetToken}`);
    }

    // ── Google OAuth callback ───────────────────────────────────────────────
    const code     = searchParams.get('code');
    const state    = searchParams.get('state');
    const oauthErr = searchParams.get('error');

    if (code) {
        if (oauthErr) {
            console.error('[OAuth] Google error:', oauthErr);
            return NextResponse.redirect(`${origin}/login?error=oauth_denied`);
        }

        const verified = verifyOAuthState(state);
        if (!verified) {
            console.error('[OAuth] State verification failed — invalid, expired, or tampered state');
            return NextResponse.redirect(`${origin}/login?error=oauth_state`);
        }

        try {
            const redirectUri = getOAuthRedirectUri(request);
            const tokens      = await exchangeGoogleCode(code, redirectUri);
            const googleUser  = await getGoogleUser(tokens.access_token);

            if (!googleUser.email) {
                return NextResponse.redirect(`${origin}/login?error=oauth_no_email`);
            }

            const userId = await findOrCreateGoogleUser(googleUser);
            await createUserSession(userId);

            return NextResponse.redirect(`${origin}${verified.returnTo}`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[OAuth] Google callback error:', msg);
            return NextResponse.redirect(`${origin}/login?error=oauth_failed`);
        }
    }

    // ── Fallback: already authenticated ────────────────────────────────────
    try {
        const { getSession } = await import('@/lib/auth/session');
        const { user } = await getSession();
        if (user) {
            const returnTo = safeReturnTo(searchParams.get('next') ?? '/');
            const landing = landingFor(user.role);
            const target = landing ?? returnTo;
            return NextResponse.redirect(`${origin}${target}`);
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[OAuth] getSession fallback error:', msg);
    }

    return NextResponse.redirect(`${origin}/login`);
}
